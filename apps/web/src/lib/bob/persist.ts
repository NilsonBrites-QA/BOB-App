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

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type SaveRoundInput = {
  season: number;
  round: number;
  anchors: ScoredMatch[];
  variations: Variation[];
  source: "api" | "demo";
};

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
  // Buscar ou criar temporada
  const season = await prisma.season.upsert({
    where:  { year: input.season },
    create: { year: input.season, league: "Brasileirao Serie A", active: true },
    update: {},
  });

  // Buscar ou criar rodada
  const existingRound = await prisma.round.findUnique({
    where: { seasonId_number: { seasonId: season.id, number: input.round } },
    select: { id: true },
  });

  if (existingRound) {
    // Rodada já persistida — retorna o ID sem sobrescrever
    return { roundDbId: existingRound.id };
  }

  // Criação transacional: round + anchors + variations + picks
  const roundDb = await prisma.$transaction(async (tx) => {
    const round = await tx.round.create({
      data: {
        seasonId: season.id,
        number:   input.round,
        status:   "READY",
        notes:    input.source === "demo" ? "Gerado com dados de demonstração" : undefined,
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
    for (const v of input.variations) {
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
