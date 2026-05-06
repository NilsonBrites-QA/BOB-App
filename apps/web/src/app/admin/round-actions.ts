"use server";

/**
 * Server Actions: governança das rodadas (entrega/regeneração).
 *
 * Estas ações são o ponto de controle do admin sobre o ciclo de vida das
 * variações. Após "Aprovar e entregar", a rodada vira IMUTÁVEL — toda visita
 * a /variacoes vê o mesmo conteúdo até o admin clicar "Regenerar" (que cria
 * nova versão e marca a anterior como SUPERSEDED, preservando histórico).
 */

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import {
  saveRound,
  freezeRound,
  supersedeActiveRound,
} from "@/lib/bob/persist";
import { getGatewayCurrentRound, getGatewayRoundDataset } from "@/lib/data/sports-data-gateway";
import { buildOfficialVariationsPipeline } from "@/lib/bob/analytics/official-variation-pipeline";

// ─── Auth gate ────────────────────────────────────────────────────────────────

async function ensureAdmin(): Promise<void> {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error("Não autenticado.");

  const dbUser = await prisma.user.findUnique({
    where: { email: user.email.toLowerCase() },
    select: { role: true, active: true },
  });
  if (!dbUser?.active || dbUser.role !== "ADMIN") {
    throw new Error("Acesso negado: somente ADMIN pode operar rodadas.");
  }
}

// ─── Pipeline interno: gera + persiste ────────────────────────────────────────

async function runPipelineAndPersist(
  season: number,
  round: number,
): Promise<{ roundDbId: string; matchCount: number; anchorCount: number }> {
  const data = await getGatewayRoundDataset(season, round);
  const matches = data?.matches ?? [];
  if (matches.length === 0) {
    throw new Error(
      `Sem jogos disponíveis para R${round}/${season}. Verifique se a rodada já foi publicada nas APIs.`,
    );
  }

  const pipeline = await buildOfficialVariationsPipeline({
    matches,
    source: "api",
    round,
    sourceSnapshotIds: [`admin-round:${season}:${round}:gateway`],
  });
  if (!pipeline.ok || !pipeline.variationsResult) {
    throw new Error(pipeline.reason ?? "Dados insuficientes para gerar Variações oficiais.");
  }

  const { roundDbId } = await saveRound({
    season,
    round,
    anchors: pipeline.anchors,
    variations: pipeline.variationsResult.variations,
    source: "api",
    officialSnapshot: pipeline.snapshot ?? undefined,
  });

  return {
    roundDbId,
    matchCount: matches.length,
    anchorCount: pipeline.anchors.length,
  };
}

// ─── Action: Aprovar e entregar ───────────────────────────────────────────────

/**
 * Gera (se não existe) e CONGELA a rodada como DELIVERED.
 *
 * Após esta ação, /variacoes vai ler do banco — toda visita verá o mesmo
 * conteúdo até o admin clicar "Regenerar". Isto resolve a sensação de
 * "as variações ficam mudando sozinhas".
 *
 * Idempotente: se a rodada já está DELIVERED, retorna OK sem alterar.
 */
export async function approveAndDeliverRound(
  season: number | null,
  round: number | null,
): Promise<{ ok: boolean; message: string; roundDbId?: string }> {
  await ensureAdmin();

  const seasonNum = season ?? new Date().getFullYear();
  const roundNum  = round ?? (await getGatewayCurrentRound());
  if (!roundNum) {
    return {
      ok: false,
      message: "Nenhuma rodada aberta detectada. Tente forçar um número de rodada.",
    };
  }

  // Se já existe versão ativa e está DELIVERED, mantém (idempotente)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingActive = await (prisma.round as any).findFirst({
    where: {
      season: { year: seasonNum },
      number: roundNum,
      status: { not: "SUPERSEDED" },
    },
    orderBy: { version: "desc" },
    select: { id: true, status: true },
  });

  if (existingActive?.status === "DELIVERED") {
    revalidatePath("/variacoes");
    revalidatePath("/dashboard");
    return {
      ok: true,
      message: `Rodada R${roundNum}/${seasonNum} já estava entregue (DELIVERED).`,
      roundDbId: existingActive.id,
    };
  }

  // Caso ainda não exista, gera e persiste
  let roundDbId = existingActive?.id as string | undefined;
  if (!roundDbId) {
    const result = await runPipelineAndPersist(seasonNum, roundNum);
    roundDbId = result.roundDbId;
  }

  // Congela
  await freezeRound(roundDbId);

  revalidatePath("/variacoes");
  revalidatePath("/dashboard");
  revalidatePath("/historico");
  revalidatePath("/admin");

  return {
    ok: true,
    message: `Rodada R${roundNum}/${seasonNum} entregue e congelada. Variações imutáveis até regenerar.`,
    roundDbId,
  };
}

// ─── Action: Regenerar ────────────────────────────────────────────────────────

/**
 * Marca a versão atual da rodada como SUPERSEDED e gera nova versão.
 *
 * NÃO destrutivo — a versão antiga fica disponível em /historico com o badge
 * "regenerada por admin em DD/MM HH:mm". Nova versão começa em DRAFT (não
 * congelada) para que o admin valide antes de "Aprovar e entregar" novamente.
 */
export async function regenerateRound(
  season: number | null,
  round: number | null,
  reason?: string,
): Promise<{ ok: boolean; message: string; supersededId: string | null; newRoundDbId?: string }> {
  await ensureAdmin();

  const seasonNum = season ?? new Date().getFullYear();
  const roundNum  = round ?? (await getGatewayCurrentRound());
  if (!roundNum) {
    return {
      ok: false,
      message: "Nenhuma rodada para regenerar.",
      supersededId: null,
    };
  }

  // 1. Marca a atual como SUPERSEDED
  const { supersededId } = await supersedeActiveRound(seasonNum, roundNum);

  // 2. Gera nova versão (saveRound vai criar com version = previous.version + 1)
  let newRoundDbId: string | undefined;
  try {
    const result = await runPipelineAndPersist(seasonNum, roundNum);
    newRoundDbId = result.roundDbId;
  } catch (err) {
    // Se falhar, NÃO desfaz o supersede — o admin precisa investigar.
    return {
      ok: false,
      message:
        `Versão anterior marcada como SUPERSEDED, mas não foi possível gerar a nova: ${
          err instanceof Error ? err.message : String(err)
        }. Tente novamente em alguns minutos.`,
      supersededId,
    };
  }

  // 3. Registra o motivo no notes da rodada nova
  if (reason) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.round as any).update({
      where: { id: newRoundDbId },
      data: { notes: `Regenerada pelo admin: ${reason}` },
    });
  }

  revalidatePath("/variacoes");
  revalidatePath("/dashboard");
  revalidatePath("/historico");
  revalidatePath("/admin");

  return {
    ok: true,
    message: `R${roundNum}/${seasonNum} regenerada. Nova versão em DRAFT — valide e clique "Aprovar e entregar".`,
    supersededId,
    newRoundDbId,
  };
}
