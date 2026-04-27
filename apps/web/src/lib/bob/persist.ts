/**
 * BOB — Persistência de rodadas no Supabase via Prisma
 *
 * Responsável por salvar e recuperar rodadas, variações, picks e resultados.
 * Usado pelo route handler e pelo painel admin.
 *
 * Contrato:
 *   saveRound()   — persiste a rodada completa gerada pelo motor
 *   markPickResult() — registra o resultado real de um pick pós-rodada
 *   saveRoundResult() — registra o resultado financeiro da rodada
 *   getRounds()   — lista rodadas para o painel admin
 *   getRoundWithPicks() — detalhes completos de uma rodada
 */

import { prisma } from "@/lib/db";
import type { ScoredMatch } from "@/lib/bob/engine/scoring";
import type { Variation }   from "@/lib/bob/types";
import type { Variation as BeamVariation } from "@/lib/bob/engine/beam-search";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type SaveRoundInput = {
  season: number;
  round: number;
  anchors: ScoredMatch[];
  variations: Variation[] | BeamVariation[]; // Aceita ambos os formatos
  source: "api" | "football-data" | "api-football" | "demo";
};

/**
 * Converte variação do beam-search para formato legado (types.Variation)
 */
function convertBeamVariationToLegacy(beamVar: BeamVariation): Variation {
  // Mapear legs para picks
  const picks = beamVar.legs.map(leg => ({
    fixtureId: leg.matchId,
    match: `${leg.homeTeam} x ${leg.awayTeam}`,
    result: leg.pickOutcome === "Home" ? "1" : leg.pickOutcome === "Away" ? "2" : "X" as "1" | "X" | "2",
    odd: leg.pickOdd,
    isAnchor: leg.isAnchor,
  }));

  // Mapear títulos baseados no ID
  const titles: Record<string, string> = {
    V1: "Segurança",
    V2: "Equilíbrio", 
    V3: "Lógica Pura",
    V4: "Curta de pressão",
    V5: "Extrema",
  };

  const postures: Record<string, string> = {
    V1: "Conservadora",
    V2: "Moderada",
    V3: "Neutra",
    V4: "Agressiva",
    V5: "Máxima agressão",
  };

  return {
    id: beamVar.id,
    title: titles[beamVar.id] || `Variação ${beamVar.id}`,
    posture: postures[beamVar.id] || "Neutra",
    projectedOdd: beamVar.combinedOdd,
    gameCount: beamVar.legCount,
    anchorsTogether: beamVar.anchorPrimaryCount >= 3,
    summary: beamVar.transparencyNotes?.[0] || `${beamVar.legCount} jogos selecionados`,
    picks,
  };
}

export type SaveRoundResult = {
  roundDbId: string;
};

export type MarkPickResultInput = {
  pickId: string;
  actualResult: "HOME" | "DRAW" | "AWAY";
  correct: boolean;
};

export type SaveRoundResultInput = {
  roundDbId: string;
  variationPlayed?: string; // "V1" … "V5"
  stakePerVariation: number;
  totalStaked: number;
  grossReturn: number;
  netReturn: number;
  hit: boolean;
  notes?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Converte result "1"|"X"|"2" → PickResult enum do Prisma */
function toPickResult(r: string): "HOME" | "DRAW" | "AWAY" {
  if (r === "1") return "HOME";
  if (r === "2") return "AWAY";
  return "DRAW";
}

// ─── Funções ──────────────────────────────────────────────────────────────────

/**
 * Persiste uma rodada completa (Season → Round → Anchor/Variation/Pick).
 * Idempotente: se já existir rodada com mesmo season+round, retorna o ID existente.
 */
export async function saveRound(input: SaveRoundInput): Promise<SaveRoundResult> {
  // Converter variações se vierem do formato beam-search
  const variations: Variation[] = input.variations.map(v => {
    // Detectar se é beam variation pelo formato
    if ('legs' in v && 'combinedOdd' in v) {
      return convertBeamVariationToLegacy(v as unknown as BeamVariation);
    }
    return v as Variation;
  });

  // Buscar ou criar temporada
  const season = await prisma.season.upsert({
    where:  { year: input.season },
    create: { year: input.season, league: "Brasileirao Serie A", active: true },
    update: {},
  });

  // Buscar rodada ATIVA (não-SUPERSEDED) com mesmo season+number.
  // Após a migration de versionamento, múltiplas versões podem coexistir
  // (a antiga marcada SUPERSEDED quando o admin clica "Regenerar").
  // Cast `as any` é transitório — sumirá quando o Prisma generate roda no build.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roundDelegate = prisma.round as any;

  const existingRound = await roundDelegate.findFirst({
    where: {
      seasonId: season.id,
      number:   input.round,
      status:   { not: "SUPERSEDED" },
    },
    select: { id: true, version: true, status: true },
    orderBy: { version: "desc" },
  });

  if (existingRound) {
    // Rodada já persistida — não sobrescreve.
    // Para regenerar use `regenerateRound()` que cria nova versão e marca a antiga como SUPERSEDED.
    return { roundDbId: existingRound.id };
  }

  // Determinar versão: se já existe SUPERSEDED, soma +1
  const lastVersion = await roundDelegate.findFirst({
    where:    { seasonId: season.id, number: input.round },
    orderBy:  { version: "desc" },
    select:   { id: true, version: true },
  });
  const nextVersion = (lastVersion?.version ?? 0) + 1;

  // Criação transacional: round + anchors + variations + picks
  const roundDb = await prisma.$transaction(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txRound = tx.round as any;
    const round = await txRound.create({
      data: {
        seasonId:        season.id,
        number:          input.round,
        status:          "READY",
        version:         nextVersion,
        previousRoundId: lastVersion?.id ?? null,
        notes:           input.source === "demo" ? "Gerado com dados de demonstração" : undefined,
      },
    });

    // Âncoras
    for (let i = 0; i < input.anchors.length; i++) {
      const a = input.anchors[i];
      await tx.anchor.create({
        data: {
          roundId:  round.id,
          team:     a.homeTeam,
          opponent: a.awayTeam,
          score:    a.score,
          reasons:  a.reasons,
          rank:     i + 1,
        },
      });
    }

    // Variações + picks
    let variationIndex = 0;
    for (const v of variations) {
      variationIndex++;
      const dbVariation = await tx.variation.create({
        data: {
          roundId:        round.id,
          code:           `V${variationIndex}`,
          title:          v.title,
          posture:        v.posture,
          projectedOdd:   v.projectedOdd,
          gameCount:      v.gameCount,
          anchorsTogether: v.anchorsTogether,
          summary:        v.summary,
        },
      });

      for (let pos = 0; pos < v.picks.length; pos++) {
        const p = v.picks[pos];
        await tx.pick.create({
          data: {
            variationId: dbVariation.id,
            fixtureId:   p.fixtureId ?? null,
            match:       p.match,
            result:      toPickResult(p.result),
            odd:         p.odd,
            isAnchor:    p.isAnchor ?? false,
            position:    pos + 1,
          },
        });
      }
    }

    return round;
  });

  return { roundDbId: roundDb.id };
}

/**
 * Registra o resultado real de um pick individual.
 * Chamado pelo formulário pós-rodada no painel admin.
 */
export async function markPickResult(input: MarkPickResultInput): Promise<void> {
  await prisma.pick.update({
    where: { id: input.pickId },
    data: {
      actualResult: input.actualResult,
      correct:      input.correct,
    },
  });
}

/**
 * Registra o resultado financeiro de uma rodada (stake + retorno).
 * Chamado após o usuário preencher o formulário de pós-rodada.
 */
export async function saveRoundResult(input: SaveRoundResultInput): Promise<void> {
  await prisma.roundResult.upsert({
    where:  { roundId: input.roundDbId },
    create: {
      roundId:          input.roundDbId,
      variationPlayed:  input.variationPlayed ?? null,
      stakePerVariation: input.stakePerVariation,
      totalStaked:       input.totalStaked,
      grossReturn:       input.grossReturn,
      netReturn:         input.netReturn,
      hit:               input.hit,
      notes:             input.notes ?? null,
    },
    update: {
      variationPlayed:  input.variationPlayed ?? null,
      stakePerVariation: input.stakePerVariation,
      totalStaked:       input.totalStaked,
      grossReturn:       input.grossReturn,
      netReturn:         input.netReturn,
      hit:               input.hit,
      notes:             input.notes ?? null,
    },
  });
}

/**
 * Lista rodadas para o painel admin (mais recentes primeiro).
 * Inclui contagem de picks e se tem resultado registrado.
 */
export async function getRounds(limit = 20) {
  return prisma.round.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      season:     { select: { year: true } },
      result:     { select: { hit: true, netReturn: true, variationPlayed: true } },
      variations: { select: { id: true, _count: { select: { picks: true } } } },
      _count:     { select: { anchors: true } },
    },
  });
}

/**
 * Detalhes completos de uma rodada com picks e resultados.
 * Usado pelo formulário de pós-rodada.
 */
export async function getRoundWithPicks(roundDbId: string) {
  return prisma.round.findUnique({
    where: { id: roundDbId },
    include: {
      season:  { select: { year: true } },
      anchors: { orderBy: { rank: "asc" } },
      result:  true,
      variations: {
        orderBy: { code: "asc" },
        include: {
          picks: { orderBy: { position: "asc" } },
        },
      },
    },
  });
}

/**
 * Métricas agregadas para o dashboard /investimento-retorno.
 * Retorna taxas de acerto e ROI por temporada.
 */
export async function getPerformanceMetrics(season: number) {
  const results = await prisma.roundResult.findMany({
    where: {
      round: {
        season: { year: season },
        status: "CLOSED",
      },
    },
    include: {
      round: { select: { number: true } },
    },
    orderBy: { registeredAt: "asc" },
  });

  const totalRounds  = results.length;
  const roundsHit    = results.filter((r) => r.hit).length;
  const totalStaked  = results.reduce((s, r) => s + Number(r.totalStaked), 0);
  const grossReturn  = results.reduce((s, r) => s + Number(r.grossReturn), 0);
  const netReturn    = results.reduce((s, r) => s + Number(r.netReturn), 0);

  return {
    totalRounds,
    roundsHit,
    hitRate: totalRounds > 0 ? roundsHit / totalRounds : 0,
    totalStaked,
    grossReturn,
    netReturn,
    roi: totalStaked > 0 ? netReturn / totalStaked : 0,
    byRound: results.map((r) => ({
      round:      r.round.number,
      hit:        r.hit,
      netReturn:  Number(r.netReturn),
      totalStaked: Number(r.totalStaked),
    })),
  };
}

// ─── Versionamento e congelamento (introduzido em 011_round_versioning) ───────
//
// As funções abaixo usam campos novos do model Round (status SUPERSEDED, version,
// previousRoundId, frozenAt, supersededAt). Antes do `prisma generate` ser
// executado em um ambiente onde a migration 011 já foi aplicada, o tipo TS gerado
// não contém esses campos. Os casts `as never` / `as RoundDelegateExt` abaixo são
// transitórios e desaparecem no build do Vercel (que sempre regenera).
/* eslint-disable @typescript-eslint/no-explicit-any */

const roundExt = prisma.round as any;

/**
 * Carrega a rodada ATIVA (não-SUPERSEDED) com tudo necessário para renderizar
 * a página /variacoes a partir do banco — variações, picks, âncoras, judgement.
 *
 * Retorna `null` se nenhuma versão da rodada foi salva ainda.
 *
 * Use isto em `/variacoes/page.tsx` em vez de gerar variações on-the-fly.
 */
export async function loadDeliveredRound(season: number, round: number) {
  return roundExt.findFirst({
    where: {
      season: { year: season },
      number: round,
      status: { not: "SUPERSEDED" },
    },
    orderBy: { version: "desc" },
    include: {
      season:  { select: { year: true } },
      anchors: { orderBy: { rank: "asc" } },
      variations: {
        orderBy: { code: "asc" },
        include: {
          picks: { orderBy: { position: "asc" } },
        },
      },
      result: true,
    },
  });
}

/**
 * Marca uma rodada como DELIVERED + frozenAt = now.
 * A partir desse momento as variações são imutáveis até que o admin regenere.
 */
export async function freezeRound(roundDbId: string): Promise<void> {
  await roundExt.update({
    where: { id: roundDbId },
    data: {
      status:      "DELIVERED",
      frozenAt:    new Date(),
      deliveredAt: new Date(),
    },
  });
}

/**
 * Marca a versão atual como SUPERSEDED (não destrutivo — preserva histórico).
 *
 * Uso típico: o admin clica em "Regenerar variações" → este método marca a
 * rodada atual como SUPERSEDED, e o próximo `saveRound()` cria uma nova versão
 * com `version = previous.version + 1` e `previousRoundId = previous.id`.
 *
 * Retorna o ID da rodada substituída (ou null se não havia rodada ativa).
 */
export async function supersedeActiveRound(
  season: number,
  round: number,
): Promise<{ supersededId: string | null }> {
  const active = await roundExt.findFirst({
    where: {
      season: { year: season },
      number: round,
      status: { not: "SUPERSEDED" },
    },
    orderBy: { version: "desc" },
    select: { id: true },
  });

  if (!active) return { supersededId: null };

  await roundExt.update({
    where: { id: active.id },
    data: {
      status:       "SUPERSEDED",
      supersededAt: new Date(),
    },
  });

  return { supersededId: active.id };
}

/**
 * Lista versões substituídas (histórico de regenerações) de uma rodada.
 * Útil para mostrar no /historico um indicador "v1 → v2 (regenerada por admin)".
 */
export async function listRoundVersions(season: number, round: number) {
  return roundExt.findMany({
    where: {
      season: { year: season },
      number: round,
    },
    orderBy: { version: "asc" },
    select: {
      id: true,
      version: true,
      status: true,
      frozenAt: true,
      deliveredAt: true,
      supersededAt: true,
      createdAt: true,
    },
  });
}
