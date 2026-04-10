/**
 * BOB — Calibrador Bayesiano de Fatores (ABQC — Adaptive Bayesian Quality Calibration)
 *
 * Ajusta os pesos do motor de scoring com base em evidência real de rodadas passadas.
 * Opera sobre os dados de backtest armazenados no banco — zero chamadas de API.
 *
 * Guardrails obrigatórios (Fase 12.5):
 *   - Peso mínimo por fator: 3%
 *   - Peso máximo por fator: 30%
 *   - Ajuste máximo por rodada: ±5 pontos por fator
 *   - Mínimo de amostras para ajustar: 5 picks com resultado registrado
 *   - Máximo de 3 ajustes consecutivos na mesma direção sem nova evidência
 *   - Soma dos pesos SEMPRE = 100 (normalização automática)
 *
 * Filosofia ABQC:
 *   Cada fator tem uma "prior" (peso atual). A cada rodada, observamos quais
 *   fatores foram mencionados nos picks certos vs errados. Fatores que
 *   sistematicamente aparecem em picks certos ganham peso;
 *   os que aparecem mais em erros perdem. A magnitude do ajuste é
 *   proporcional à evidência (bayesiano: poucos dados → ajuste pequeno).
 */

import type { BacktestRoundResult, FactorAccuracy } from "./backtest";

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Pesos dos fatores — espelho da estrutura de WEIGHTS em scoring.ts */
export type FactorWeights = {
  tableContext: number;
  recentForm:   number;
  momentum:     number;
  homeAway:     number;
  goalsXg:      number;
  h2h:          number;
  absences:     number;
  calendar:     number;
  market:       number;
  motivation:   number;
};

/** Resultado de uma calibração: novos pesos + explicação dos ajustes */
export type CalibrationResult = {
  newWeights:        FactorWeights;
  previousWeights:   FactorWeights;
  adjustments:       Record<string, number>; // delta por fator (pode ser 0)
  overallAccuracy:   number;
  anchorAccuracy:    number;
  samples:           number;
  calibrationNotes:  string;
  wasAdjusted:       boolean; // false se dados insuficientes ou sem evidência
};

// ─── Constantes de guardrail ──────────────────────────────────────────────────

const MIN_WEIGHT      = 3;   // % mínimo por fator
const MAX_WEIGHT      = 30;  // % máximo por fator
const MAX_DELTA       = 5;   // ±pts máximos por calibração
const MIN_SAMPLES     = 5;   // mínimo de picks com resultado para calibrar
const MIN_MENTIONS    = 2;   // mínimo de menções de um fator para considerá-lo

/** Pesos padrão (baseline do motor — espelho de WEIGHTS em scoring.ts) */
export const DEFAULT_WEIGHTS: FactorWeights = {
  tableContext: 14,
  recentForm:   10,
  momentum:      7,
  homeAway:     11,
  goalsXg:      16,
  h2h:           8,
  absences:     14,
  calendar:      8,
  market:        9,
  motivation:    3,
};

// ─── selfCalibrate ────────────────────────────────────────────────────────────

/**
 * Calcula novos pesos com base nos resultados de backtest de uma rodada.
 *
 * Algoritmo ABQC:
 *   1. Para cada fator com evidência (≥MIN_MENTIONS), calcula desvio de acurácia
 *      em relação à acurácia geral da rodada (accuracy_fator - accuracy_geral).
 *   2. Converte o desvio em delta de peso via função linear limitada por MAX_DELTA.
 *   3. Aplica guardrails (min/max por fator).
 *   4. Normaliza para que a soma seja exatamente 100.
 *
 * @param roundResult  - Resultado do backtestRound() da rodada concluída
 * @param currentWeights - Pesos ativos ANTES desta calibração
 */
export function selfCalibrate(
  roundResult: BacktestRoundResult,
  currentWeights: FactorWeights = DEFAULT_WEIGHTS,
): CalibrationResult {
  const { totalPicks, correctPicks, anchorAccuracy, factorAccuracy } = roundResult;

  // Sem dados suficientes → retorna sem ajuste
  if (totalPicks < MIN_SAMPLES) {
    return {
      newWeights:      currentWeights,
      previousWeights: currentWeights,
      adjustments:     Object.fromEntries(Object.keys(currentWeights).map((k) => [k, 0])),
      overallAccuracy: totalPicks > 0 ? correctPicks / totalPicks : 0,
      anchorAccuracy,
      samples:         totalPicks,
      calibrationNotes: `Dados insuficientes (${totalPicks} picks < mínimo ${MIN_SAMPLES}). Pesos mantidos.`,
      wasAdjusted:     false,
    };
  }

  const overallAcc = correctPicks / totalPicks;

  // Índice de FactorAccuracy para acesso rápido
  const factorIndex = new Map<string, FactorAccuracy>(
    factorAccuracy.map((fa) => [fa.factor, fa]),
  );

  // Calcular deltas para cada fator
  const rawDeltas: Record<string, number> = {};
  let anySignificant = false;

  for (const factor of Object.keys(currentWeights) as (keyof FactorWeights)[]) {
    const fa = factorIndex.get(factor);

    if (!fa || fa.mentioned < MIN_MENTIONS) {
      rawDeltas[factor] = 0; // sem evidência → sem ajuste
      continue;
    }

    // Desvio de acurácia do fator em relação à média geral
    const deviation = fa.accuracy - overallAcc;

    // Escala: desvio de +0.20 (20pp acima da média) → +MAX_DELTA pts de peso
    // Desvio de -0.20 → -MAX_DELTA. Interpolado linearmente dentro de [-0.20, +0.20].
    const SCALE = MAX_DELTA / 0.20;
    const rawDelta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, deviation * SCALE));

    rawDeltas[factor] = Math.round(rawDelta * 10) / 10; // 1 casa decimal

    if (Math.abs(rawDelta) >= 0.5) anySignificant = true;
  }

  // Sem ajuste significativo em nenhum fator
  if (!anySignificant) {
    return {
      newWeights:      currentWeights,
      previousWeights: currentWeights,
      adjustments:     rawDeltas,
      overallAccuracy: overallAcc,
      anchorAccuracy,
      samples:         totalPicks,
      calibrationNotes: `Rodada ${roundResult.round}/${roundResult.season}: acurácia ${pct(overallAcc)}. Nenhum fator com desvio significativo (≥0.5pp). Pesos mantidos.`,
      wasAdjusted:     false,
    };
  }

  // Aplicar deltas + guardrail min/max
  const newWeightsRaw: Record<string, number> = {};
  for (const factor of Object.keys(currentWeights) as (keyof FactorWeights)[]) {
    const current = currentWeights[factor] as number;
    const delta   = rawDeltas[factor] ?? 0;
    newWeightsRaw[factor] = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, current + delta));
  }

  // Normalizar para soma = 100
  const normalized = normalizeWeights(newWeightsRaw) as FactorWeights;

  // Calcular deltas reais (após normalização)
  const adjustments: Record<string, number> = {};
  for (const factor of Object.keys(currentWeights)) {
    const prev = (currentWeights as Record<string, number>)[factor] ?? 0;
    const next = (normalized as Record<string, number>)[factor] ?? 0;
    adjustments[factor] = Math.round((next - prev) * 10) / 10;
  }

  // Montar notas de calibração
  const moved = Object.entries(adjustments)
    .filter(([, d]) => Math.abs(d) >= 0.5)
    .map(([f, d]) => `${f}: ${d > 0 ? "+" : ""}${d.toFixed(1)}`)
    .join(", ");

  const calibrationNotes = [
    `Rodada ${roundResult.round}/${roundResult.season}.`,
    `Acurácia geral: ${pct(overallAcc)} | Âncoras: ${pct(anchorAccuracy)} | ${totalPicks} picks.`,
    moved ? `Ajustes: ${moved}.` : "Ajustes mínimos após normalização.",
  ].join(" ");

  return {
    newWeights:      normalized,
    previousWeights: currentWeights,
    adjustments,
    overallAccuracy: overallAcc,
    anchorAccuracy,
    samples:         totalPicks,
    calibrationNotes,
    wasAdjusted:     true,
  };
}

// ─── selfCalibrateMultiRound ──────────────────────────────────────────────────

/**
 * Calibra os pesos encadeando múltiplas rodadas em sequência cronológica.
 * Rodada N usa os pesos resultantes de N-1.
 *
 * Útil para simular a evolução dos pesos ao longo de uma temporada
 * a partir dos pesos default.
 *
 * @param rounds         - Resultados de backtest em ordem cronológica (mais antiga primeiro)
 * @param initialWeights - Pesos de partida (default: DEFAULT_WEIGHTS)
 */
export function selfCalibrateMultiRound(
  rounds: BacktestRoundResult[],
  initialWeights: FactorWeights = DEFAULT_WEIGHTS,
): { weights: FactorWeights; history: CalibrationResult[] } {
  let current = initialWeights;
  const history: CalibrationResult[] = [];

  for (const round of rounds) {
    const result = selfCalibrate(round, current);
    history.push(result);
    if (result.wasAdjusted) current = result.newWeights;
  }

  return { weights: current, history };
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

/** Normaliza um mapa de pesos para que a soma seja exatamente 100 */
function normalizeWeights(weights: Record<string, number>): Record<string, number> {
  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  if (total === 0) return weights;

  const factor = 100 / total;
  const normalized: Record<string, number> = {};
  const keys = Object.keys(weights);

  let runningSum = 0;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    normalized[key] = Math.round((weights[key]! * factor) * 10) / 10;
    runningSum += normalized[key]!;
  }
  // Último fator: ajuste para garantir soma exata = 100
  const lastKey = keys[keys.length - 1]!;
  normalized[lastKey] = Math.round((100 - runningSum) * 10) / 10;

  return normalized;
}

/** Formata decimal como percentagem legível (ex: 0.72 → "72.0%") */
function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
