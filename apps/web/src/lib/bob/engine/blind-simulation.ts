/**
 * BOB — Simulação Retroativa Cega (Sprint 4)
 *
 * Opera sobre rodadas já salvas no banco com picks marcados (correct !== null).
 * Lê as previsões que o motor gerou "sem ver o resultado" e compara com o real.
 * Calcula acurácia por variação (V1–V5) e alimenta o calibrador ABQC.
 *
 * "Cega" = as previsões foram geradas ANTES dos resultados serem conhecidos;
 * agora só medimos a qualidade dessas previsões a posteriori.
 *
 * Funções exportadas:
 *   blindSimulateRound()      — simula uma rodada específica e salva resultado
 *   findNextRoundToSimulate() — descobre a próxima rodada pronta para simulação
 *   getSimulationProgress()   — progresso geral (X de Y rodadas simuladas)
 */

import { prisma }        from "@/lib/db";
import { backtestRound } from "@/lib/bob/engine/backtest";
import { selfCalibrate } from "@/lib/bob/engine/calibrator";
import type { FactorWeights } from "@/lib/bob/engine/calibrator";

// ─── Tipos exportados ─────────────────────────────────────────────────────────

/** Acurácia de uma variação (V1–V5) naquela rodada */
export type VariationSimResult = {
  code:          string;   // "V1" … "V5"
  picksTotal:    number;
  picksCorrect:  number;
  won:           boolean;  // todas as picks corretas (bilhete ganho)
  projectedOdd:  number;   // odd projetada na geração (variation.projectedOdd)
};

/** Resultado completo de uma simulação de rodada */
export type BlindSimulationResult = {
  season:         number;
  round:          number;
  anchorCount:    number;
  anchorsCorrect: number;
  totalPicks:     number;
  correctPicks:   number;
  variations:     VariationSimResult[];
  bestOddProj:    number | null; // odd projetada da variação vencedora (ou a mais alta com mais acertos)
  bestOddReal:    number | null; // odd real calculada (produto de odds dos picks corretos se ganhou)
  notes:          string;
  alreadyExists:  boolean; // true se o registro já estava no banco
};

/** Progresso geral da simulação na temporada */
export type SimulationProgress = {
  season:      number;
  totalRounds: number; // rodadas com todos os picks marcados no banco
  simulated:   number; // rodadas já com simulation_results salvo
  pending:     number; // faltam simular
  lastRound:   number | null; // última rodada simulada
};

// ─── blindSimulateRound ───────────────────────────────────────────────────────

/**
 * Simula uma rodada retroativamente:
 *   1. Lê âncoras e picks com `correct !== null` do banco
 *   2. Calcula acurácia por variação (picks corretos, "wonall", odd projetada)
 *   3. Chama selfCalibrate() com o resultado de backtest
 *   4. Salva o snapshot em `simulation_results` (upsert — idempotente)
 *   5. Persiste novos pesos em `factor_weights` (se houve ajuste)
 *
 * @param season         - Ano da temporada (ex: 2025)
 * @param round          - Número da rodada (1–38)
 * @param currentWeights - Pesos ativos antes desta rodada (null = usa DEFAULT_WEIGHTS)
 */
export async function blindSimulateRound(
  season:         number,
  round:          number,
  currentWeights: FactorWeights | null = null,
): Promise<BlindSimulationResult> {
  // ── 1. Verificar se já existe resultado salvo ────────────────────────────
  const existing = await prisma.simulationResult.findUnique({
    where: { season_round: { season, round } },
  });

  if (existing) {
    return {
      season,
      round,
      anchorCount:    existing.anchorCount,
      anchorsCorrect: existing.anchorsCorrect,
      totalPicks:     existing.totalPicks,
      correctPicks:   existing.correctPicks,
      variations:     (existing.variationsJson as VariationSimResult[]) ?? [],
      bestOddProj:    existing.bestOddProjected ? Number(existing.bestOddProjected) : null,
      bestOddReal:    existing.bestOddReal       ? Number(existing.bestOddReal)      : null,
      notes:          existing.notes ?? "Resultado já existia no banco.",
      alreadyExists:  true,
    };
  }

  // ── 2. Buscar rodada com variações + picks marcados ──────────────────────
  const roundDb = await prisma.round.findFirst({
    where: {
      number:  round,
      season:  { year: season },
    },
    include: {
      anchors: { orderBy: { rank: "asc" } },
      variations: {
        include: {
          picks: {
            orderBy: { position: "asc" },
          },
        },
      },
    },
  });

  if (!roundDb) {
    throw new Error(`Rodada ${round}/${season} não encontrada no banco.`);
  }

  // ── 3. Garantir que a rodada tem picks com resultado ──────────────────────
  const allPicks = roundDb.variations.flatMap((v) => v.picks);
  const markedPicks = allPicks.filter((p) => p.correct !== null);

  if (markedPicks.length === 0) {
    throw new Error(
      `Rodada ${round}/${season} não tem picks com resultado registrado. ` +
      `Execute o cron post-round ou backfill antes de simular.`,
    );
  }

  // ── 4. Calcular acurácia das âncoras ──────────────────────────────────────
  const anchorMatchNames = new Set(
    roundDb.anchors.map((a) => `${a.team} x ${a.opponent}`),
  );

  const anchorPicks = markedPicks.filter(
    (p) => p.isAnchor && anchorMatchNames.has(p.match),
  );
  const anchorsCorrect = anchorPicks.filter((p) => p.correct === true).length;

  // ── 5. Calcular acurácia por variação ────────────────────────────────────
  const variationResults: VariationSimResult[] = [];
  let bestWonOddProj: number | null = null;
  let bestWonOddReal: number | null = null;

  for (const v of roundDb.variations) {
    const vPicks = v.picks.filter((p) => p.correct !== null);
    const picksCorrect = vPicks.filter((p) => p.correct === true).length;
    const won          = vPicks.length > 0 && picksCorrect === vPicks.length;

    // Odd real = produto das odds dos picks SE ganhou (simula retorno real do bilhete)
    const realOdd = won
      ? vPicks.reduce((acc, p) => acc * p.odd, 1)
      : null;

    variationResults.push({
      code:         v.code,
      picksTotal:   vPicks.length,
      picksCorrect,
      won,
      projectedOdd: v.projectedOdd,
    });

    // Rastreia a melhor odd da variação vencedora (ou a mais próxima, se nenhuma ganhou)
    if (won && realOdd !== null) {
      if (bestWonOddProj === null || v.projectedOdd > bestWonOddProj) {
        bestWonOddProj = v.projectedOdd;
        bestWonOddReal = realOdd;
      }
    }
  }

  // Se nenhuma variação ganhou, pegar a maior projectedOdd como referência de potencial
  if (bestWonOddProj === null && variationResults.length > 0) {
    const best = variationResults.reduce(
      (b, v) => (v.projectedOdd > b.projectedOdd ? v : b),
      variationResults[0],
    );
    bestWonOddProj = best.projectedOdd;
    bestWonOddReal = null;
  }

  // ── 6. Totais gerais ─────────────────────────────────────────────────────
  const totalPicks   = markedPicks.length;
  const correctPicks = markedPicks.filter((p) => p.correct === true).length;
  const anchorCount  = roundDb.anchors.length;

  // ── 7. Calibrar pesos com base nesta rodada ───────────────────────────────
  let calibrationNotes = "";
  let calibrated = false;

  const backtestResult = await backtestRound(season, round);

  if (backtestResult) {
    const weights = currentWeights ?? DEFAULT_WEIGHTS_FALLBACK;
    const calibResult = selfCalibrate(backtestResult, weights);
    calibrationNotes = calibResult.calibrationNotes;

    if (calibResult.wasAdjusted) {
      // Persistir novos pesos no banco
      await prisma.factorWeight.upsert({
        where:  { season_round: { season, round } },
        create: {
          season,
          round,
          tableContext:     calibResult.newWeights.tableContext,
          recentForm:       calibResult.newWeights.recentForm,
          momentum:         calibResult.newWeights.momentum,
          homeAway:         calibResult.newWeights.homeAway,
          goalsXg:          calibResult.newWeights.goalsXg,
          h2h:              calibResult.newWeights.h2h,
          absences:         calibResult.newWeights.absences,
          calendar:         calibResult.newWeights.calendar,
          market:           calibResult.newWeights.market,
          motivation:       calibResult.newWeights.motivation,
          overallAccuracy:  calibResult.overallAccuracy,
          anchorAccuracy:   calibResult.anchorAccuracy,
          samples:          calibResult.samples,
          calibrationNotes: calibResult.calibrationNotes,
        },
        update: {
          tableContext:     calibResult.newWeights.tableContext,
          recentForm:       calibResult.newWeights.recentForm,
          momentum:         calibResult.newWeights.momentum,
          homeAway:         calibResult.newWeights.homeAway,
          goalsXg:          calibResult.newWeights.goalsXg,
          h2h:              calibResult.newWeights.h2h,
          absences:         calibResult.newWeights.absences,
          calendar:         calibResult.newWeights.calendar,
          market:           calibResult.newWeights.market,
          motivation:       calibResult.newWeights.motivation,
          overallAccuracy:  calibResult.overallAccuracy,
          anchorAccuracy:   calibResult.anchorAccuracy,
          samples:          calibResult.samples,
          calibrationNotes: calibResult.calibrationNotes,
        },
      });
      calibrated = true;
    }
  } else {
    calibrationNotes = `backtestRound(${round}/${season}) retornou null — picks sem resultado ou rodada não encontrada.`;
  }

  // ── 8. Gerar notes da simulação ──────────────────────────────────────────
  const wonCount = variationResults.filter((v) => v.won).length;
  const overallAcc = totalPicks > 0 ? ((correctPicks / totalPicks) * 100).toFixed(1) : "0.0";
  const anchorAcc  = anchorPicks.length > 0
    ? ((anchorsCorrect / anchorPicks.length) * 100).toFixed(1)
    : "N/A";

  const notes = [
    `Simulação R${round}/${season}:`,
    `Picks ${correctPicks}/${totalPicks} (${overallAcc}%) · Âncoras ${anchorsCorrect}/${anchorPicks.length} (${anchorAcc}%)`,
    `Variações ganhas: ${wonCount}/${variationResults.length}`,
    calibrationNotes ? `Calibração: ${calibrationNotes}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  // ── 9. Persistir resultado ────────────────────────────────────────────────
  await prisma.simulationResult.upsert({
    where:  { season_round: { season, round } },
    create: {
      season,
      round,
      anchorCount,
      anchorsCorrect,
      totalPicks,
      correctPicks,
      variationsJson:   variationResults,
      bestOddProjected: bestWonOddProj,
      bestOddReal:      bestWonOddReal,
      calibrated,
      notes,
    },
    update: {
      anchorCount,
      anchorsCorrect,
      totalPicks,
      correctPicks,
      variationsJson:   variationResults,
      bestOddProjected: bestWonOddProj,
      bestOddReal:      bestWonOddReal,
      calibrated,
      notes,
    },
  });

  return {
    season,
    round,
    anchorCount,
    anchorsCorrect,
    totalPicks,
    correctPicks,
    variations: variationResults,
    bestOddProj: bestWonOddProj,
    bestOddReal: bestWonOddReal,
    notes,
    alreadyExists: false,
  };
}

// ─── findNextRoundToSimulate ──────────────────────────────────────────────────

/**
 * Retorna season + round da próxima rodada pronta para simulação:
 *   - Tem pelo menos 1 pick com `correct !== null`
 *   - NÃO tem correspondente em `simulation_results`
 *   - Ordenado do mais antigo para o mais recente (processa em ordem)
 *
 * Retorna null se não há rodadas pendentes.
 */
export async function findNextRoundToSimulate(): Promise<{
  season: number;
  round:  number;
  roundDbId: string;
} | null> {
  // Rodadas já simuladas
  const simulated = await prisma.simulationResult.findMany({
    select: { season: true, round: true },
  });
  const simulatedSet = new Set(simulated.map((s) => `${s.season}-${s.round}`));

  // Buscar rodadas que tenham pelo menos 1 pick com resultado
  const candidates = await prisma.round.findMany({
    where: {
      variations: {
        some: {
          picks: {
            some: { correct: { not: null } },
          },
        },
      },
    },
    select: {
      id:     true,
      number: true,
      season: { select: { year: true } },
    },
    orderBy: [
      { season: { year: "asc" } },
      { number: "asc" },
    ],
  });

  for (const c of candidates) {
    const key = `${c.season.year}-${c.number}`;
    if (!simulatedSet.has(key)) {
      return {
        season:    c.season.year,
        round:     c.number,
        roundDbId: c.id,
      };
    }
  }

  return null; // nada pendente
}

// ─── getSimulationProgress ────────────────────────────────────────────────────

/**
 * Retorna o progresso geral da simulação para uma temporada.
 *
 * @param season - Ano da temporada (ex: 2025); se omitido, usa a temporada ativa
 */
export async function getSimulationProgress(
  season?: number,
): Promise<SimulationProgress> {
  // Determinar temporada ativa se não informada
  const targetSeason = season ?? (await getActiveSeason());

  // Total de rodadas no banco com picks marcados
  const totalRounds = await prisma.round.count({
    where: {
      season: { year: targetSeason },
      variations: {
        some: {
          picks: {
            some: { correct: { not: null } },
          },
        },
      },
    },
  });

  // Rodadas já simuladas nesta temporada
  const simDone = await prisma.simulationResult.findMany({
    where:   { season: targetSeason },
    orderBy: { round: "desc" },
    take:    1,
    select:  { round: true },
  });

  const simCount = await prisma.simulationResult.count({
    where: { season: targetSeason },
  });

  return {
    season:      targetSeason,
    totalRounds,
    simulated:   simCount,
    pending:     Math.max(0, totalRounds - simCount),
    lastRound:   simDone[0]?.round ?? null,
  };
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

/** Pesos padrão usados quando não há pesos adaptados no banco */
const DEFAULT_WEIGHTS_FALLBACK: FactorWeights = {
  tableContext: 11,
  recentForm:    8,
  momentum:      6,
  homeAway:      8,
  goalsXg:      13,
  h2h:           6,
  absences:     11,
  calendar:      6,
  market:        8,
  motivation:    3,
};

/** Busca o ano da temporada ativa (fallback: ano corrente) */
async function getActiveSeason(): Promise<number> {
  const active = await prisma.season.findFirst({
    where:   { active: true },
    select:  { year: true },
    orderBy: { year: "desc" },
  });
  return active?.year ?? new Date().getFullYear();
}
