/**
 * BOB — Persistência de Pesos do Motor (Fase 12)
 *
 * Salva e recupera snapshots dos pesos do motor de scoring na tabela
 * factor_weights. Permite rastrear a evolução histórica dos pesos e
 * recuperar os pesos mais recentes para uso no motor.
 *
 * Funções:
 *   saveFactorWeightSnapshot() — persiste resultado de calibração pós-rodada
 *   getLatestWeights()         — retorna os pesos mais recentes do banco
 *   getWeightHistory()         — histórico de snapshots (admin/gráficos)
 */

import { prisma } from "@/lib/db";
import type { CalibrationResult, FactorWeights } from "@/lib/bob/engine/calibrator";
import { DEFAULT_WEIGHTS } from "@/lib/bob/engine/calibrator";

// ─── saveFactorWeightSnapshot ─────────────────────────────────────────────────

/**
 * Persiste os novos pesos e métricas da calibração para a rodada.
 * Idempotente: se já existir snapshot para season+round, atualiza.
 *
 * @param season  - Ano da temporada
 * @param round   - Número da rodada calibrada
 * @param result  - Resultado retornado por selfCalibrate()
 */
export async function saveFactorWeightSnapshot(
  season: number,
  round: number,
  result: CalibrationResult,
): Promise<void> {
  const w = result.newWeights;

  await prisma.factorWeight.upsert({
    where: { season_round: { season, round } },
    create: {
      season,
      round,
      tableContext: w.tableContext,
      recentForm:  w.recentForm,
      momentum:    w.momentum,
      homeAway:    w.homeAway,
      goalsXg:     w.goalsXg,
      h2h:         w.h2h,
      absences:    w.absences,
      calendar:    w.calendar,
      market:      w.market,
      motivation:  w.motivation,
      overallAccuracy:  result.overallAccuracy,
      anchorAccuracy:   result.anchorAccuracy,
      samples:          result.samples,
      calibrationNotes: result.calibrationNotes,
    },
    update: {
      tableContext: w.tableContext,
      recentForm:  w.recentForm,
      momentum:    w.momentum,
      homeAway:    w.homeAway,
      goalsXg:     w.goalsXg,
      h2h:         w.h2h,
      absences:    w.absences,
      calendar:    w.calendar,
      market:      w.market,
      motivation:  w.motivation,
      overallAccuracy:  result.overallAccuracy,
      anchorAccuracy:   result.anchorAccuracy,
      samples:          result.samples,
      calibrationNotes: result.calibrationNotes,
    },
  });
}

// ─── getLatestWeights ─────────────────────────────────────────────────────────

/**
 * Retorna os pesos mais recentes do banco para uma temporada.
 * Fallback: DEFAULT_WEIGHTS se não houver nenhum snapshot ainda.
 *
 * Este é o ponto de entrada para o motor ao construir uma nova predição:
 * `const weights = await getLatestWeights(season);`
 * (uso futuro — motor atual ainda usa constante interna)
 *
 * @param season - Ano da temporada (ex: 2026)
 */
export async function getLatestWeights(season: number): Promise<FactorWeights> {
  const snapshot = await prisma.factorWeight.findFirst({
    where:   { season },
    orderBy: { round: "desc" },
  });

  if (!snapshot) return DEFAULT_WEIGHTS;

  return {
    tableContext: snapshot.tableContext.toNumber(),
    recentForm:  snapshot.recentForm.toNumber(),
    momentum:    snapshot.momentum.toNumber(),
    homeAway:    snapshot.homeAway.toNumber(),
    goalsXg:     snapshot.goalsXg.toNumber(),
    h2h:         snapshot.h2h.toNumber(),
    absences:    snapshot.absences.toNumber(),
    calendar:    snapshot.calendar.toNumber(),
    market:      snapshot.market.toNumber(),
    motivation:  snapshot.motivation.toNumber(),
  };
}

// ─── getWeightHistory ─────────────────────────────────────────────────────────

/**
 * Retorna o histórico completo de snapshots de pesos de uma temporada.
 * Ordenado por rodada crescente (mais antigo → mais recente).
 * Usado pelo painel admin para exibir gráficos de evolução.
 *
 * @param season - Ano da temporada
 * @param limit  - Número máximo de snapshots (padrão: 38 = temporada completa)
 */
export async function getWeightHistory(season: number, limit = 38) {
  const rows = await prisma.factorWeight.findMany({
    where:   { season },
    orderBy: { round: "asc" },
    take:    limit,
  });

  return rows.map((r) => ({
    season:          r.season,
    round:           r.round,
    overallAccuracy: r.overallAccuracy?.toNumber() ?? null,
    anchorAccuracy:  r.anchorAccuracy?.toNumber()  ?? null,
    samples:         r.samples,
    calibrationNotes: r.calibrationNotes,
    weights: {
      tableContext: r.tableContext.toNumber(),
      recentForm:  r.recentForm.toNumber(),
      momentum:    r.momentum.toNumber(),
      homeAway:    r.homeAway.toNumber(),
      goalsXg:     r.goalsXg.toNumber(),
      h2h:         r.h2h.toNumber(),
      absences:    r.absences.toNumber(),
      calendar:    r.calendar.toNumber(),
      market:      r.market.toNumber(),
      motivation:  r.motivation.toNumber(),
    } satisfies FactorWeights,
    createdAt: r.createdAt.toISOString(),
  }));
}
