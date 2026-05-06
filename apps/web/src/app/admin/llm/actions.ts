"use server";

/**
 * Server Actions do painel admin LLM.
 *
 * Permite ao admin disparar a pré-computação da análise sem esperar o cron.
 */

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { judgeVariations, type VariationSnapshot } from "@/lib/bob/engine/variation-judge";
import { loadRoundData } from "@/lib/bob/round-loader";
import { isRealDataSource } from "@/lib/bob/data/source-policy";
import { buildOfficialVariationsPipeline } from "@/lib/bob/analytics/official-variation-pipeline";

async function requireAdmin() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) throw new Error("Unauthorized");
  const dbUser = await prisma.user.findUnique({
    where: { email: user.email.toLowerCase() },
    select: { role: true, active: true },
  });
  if (!dbUser?.active || dbUser.role !== "ADMIN") {
    throw new Error("Forbidden");
  }
}

export type RecalcResult = {
  ok: boolean;
  season?: number;
  round?: number;
  provider?: string;
  enrichments?: number;
  replacementsProposed?: number;
  replacementsApproved?: number;
  elapsedMs?: number;
  error?: string;
};

export async function recalcVariationJudgement(
  season: number,
  round: number | null,
): Promise<RecalcResult> {
  await requireAdmin();
  const startedAt = Date.now();

  try {
    const roundData = await loadRoundData(season, round);
    if (!isRealDataSource(roundData.source)) {
      return { ok: false, error: `Geração oficial bloqueada: fonte inválida (${roundData.source})` };
    }
    if (roundData.matches.length === 0) {
      return { ok: false, error: "Sem partidas para a rodada solicitada" };
    }

    const effectiveRound =
      roundData.source === "api" && roundData.meta ? roundData.meta.round : (round ?? 0);

    const pipeline = await buildOfficialVariationsPipeline({
      matches: roundData.matches,
      source: roundData.source,
      round: effectiveRound,
      sourceSnapshotIds: [`round:${season}:${effectiveRound}:${roundData.source}`],
    });
    if (!pipeline.ok || !pipeline.variationsResult) {
      return { ok: false, error: pipeline.reason ?? "Pipeline oficial bloqueou a geração" };
    }
    const anchors = pipeline.anchors;
    const pool = pipeline.anchorSelection?.allRanked.filter((m) => !anchors.some((a) => a.id === m.id)) ?? [];
    const variationsResult = pipeline.variationsResult;

    const snapshots: VariationSnapshot[] = variationsResult.variations.map((v) => ({
      id: v.id,
      combinedOdd: v.combinedOdd,
      legCount: v.legCount,
      legs: v.legs.map((l) => ({
        matchId: l.matchId,
        match: l.match,
        pickOutcome: l.pickOutcome,
        pickOdd: l.pickOdd,
        isAnchor: l.isAnchor,
      })),
    }));

    const judgeResult = await judgeVariations(snapshots, anchors, pool);

    const payload = {
      enrichments: judgeResult.enrichments,
      replacements: judgeResult.replacements,
      anchorIds: anchors.map((a) => a.id),
      generatedAt: new Date().toISOString(),
    };

    await prisma.variationJudgement.upsert({
      where: { season_round: { season, round: effectiveRound } },
      create: { season, round: effectiveRound, provider: judgeResult.provider, payload },
      update: { provider: judgeResult.provider, payload },
    });

    revalidatePath("/variacoes");
    revalidatePath("/admin/llm");

    return {
      ok: true,
      season,
      round: effectiveRound,
      provider: judgeResult.provider,
      enrichments: judgeResult.enrichments.length,
      replacementsProposed: judgeResult.replacements.length,
      replacementsApproved: judgeResult.replacements.filter((r) => r.approved).length,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

export async function deleteVariationJudgement(season: number, round: number) {
  await requireAdmin();
  await prisma.variationJudgement.delete({
    where: { season_round: { season, round } },
  });
  revalidatePath("/admin/llm");
  revalidatePath("/variacoes");
}
