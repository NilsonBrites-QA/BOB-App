/**
 * BOB — Auto-Reflexão (Self-Reflection)
 *
 * Orquestra dados de calibração + backtest do banco de dados
 * para produzir uma reflexão evolutiva sobre o aprendizado do BOB.
 *
 * Lógica:
 *   1. Busca histórico de pesos da temporada no DB (getWeightHistory)
 *   2. Executa backtest da rodada solicitada (backtestRound)
 *   3. Calibra em cima dos resultados (selfCalibrate)
 *   4. Delega geração de texto ao Analista Cognitivo (Claude ou fallback)
 *
 * Exporta:
 *   selfReflect(season, round) → ReflectionResult | null
 */

import { backtestRound }          from "@/lib/bob/engine/backtest";
import { selfCalibrate }          from "@/lib/bob/engine/calibrator";
import { getWeightHistory, getLatestWeights } from "@/lib/bob/persist-weights";
import {
  generateReflection,
  suggestWeightAdjustments,
  type RoundReflection,
  type WeightSuggestion,
} from "@/lib/bob/ai/cognitive-analyst";
import { prisma }                 from "@/lib/db";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type FactorTrend = {
  factor:    string;
  weights:   number[];  // últimas N calibrações em ordem cronológica
  direction: "rising" | "falling" | "stable";
  delta:     number;    // variação absoluta entre primeira e última entrada
};

export type ReflectionResult = {
  season:      number;
  round:       number;
  publicText:  string;         // texto para usuário (dashboard)
  adminText:   string;         // texto técnico (admin)
  accuracy:    number;         // overall accuracy da rodada (0–1)
  anchorAcc:   number;         // anchor accuracy da rodada (0–1)
  suggestions: WeightSuggestion[];
  trends:      FactorTrend[];  // evolução dos principais fatores
  source:      RoundReflection["source"];
};

// ─── selfReflect ──────────────────────────────────────────────────────────────

/**
 * Gera reflexão completa para uma rodada/temporada.
 * Retorna null se não houver dados de backtest disponíveis.
 */
export async function selfReflect(
  season: number,
  round:  number,
): Promise<ReflectionResult | null> {
  // 1. Backtest da rodada
  const roundResult = await backtestRound(season, round);
  if (!roundResult) return null;
  if (roundResult.totalPicks === 0) return null;

  // 2. Pesos mais recentes (ou default se ainda não calibrado)
  // getLatestWeights retorna FactorWeights diretamente (com fallback para DEFAULT_WEIGHTS)
  const currentWeights = await getLatestWeights(season);

  // 3. Calibra em cima do backtest
  const calibration = selfCalibrate(roundResult, currentWeights);

  // 4. Gera reflexão (Claude → fallback determinístico)
  const reflection = await generateReflection(calibration, roundResult);

  // 5. Sugestões de ajuste de pesos
  const suggestions = await suggestWeightAdjustments(calibration, roundResult);

  // 6. Tendências derivadas do histórico de pesos
  const history = await getWeightHistory(season, 8);
  const trends  = buildTrends(history);

  const overall = roundResult.totalPicks > 0
    ? roundResult.correctPicks / roundResult.totalPicks
    : 0;

  const result: ReflectionResult = {
    season,
    round,
    publicText:  reflection.publicText,
    adminText:   reflection.adminText,
    accuracy:    overall,
    anchorAcc:   roundResult.anchorAccuracy,
    suggestions,
    trends,
    source:      reflection.source,
  };

  // Persistir no banco como MemoryEvent (layer=DECISIONS, type="reflection")
  try {
    const dbRound = await prisma.round.findFirst({
      where: {
        number: round,
        season: { year: season },
      },
      select: { id: true },
    });

    await prisma.memoryEvent.create({
      data: {
        roundId:        dbRound?.id ?? null,
        layer:          "DECISIONS",
        type:           "reflection",
        content:        {
          publicText:  result.publicText,
          adminText:   result.adminText,
          accuracy:    result.accuracy,
          anchorAcc:   result.anchorAcc,
          season:      result.season,
          round:       result.round,
          source:      result.source,
        },
        source:         "bob-self-reflection",
        relevanceScore: result.accuracy,
      },
    });
  } catch (err) {
    console.warn("[BOB/self-reflection] Falha ao persistir MemoryEvent:", err);
  }

  return result;
}

// ─── buildTrends ──────────────────────────────────────────────────────────────

type WeightRow = Awaited<ReturnType<typeof getWeightHistory>>[number];

function buildTrends(history: WeightRow[]): FactorTrend[] {
  if (history.length < 2) return [];

  const factors = [
    "tableContext", "recentForm", "momentum", "homeAway", "goalsXg",
    "h2h", "absences", "calendar", "market", "motivation",
  ] as const;

  // History vem em ordem DESC (mais recente primeiro) — invertemos para cronológico
  const chronological = [...history].reverse();

  const trends: FactorTrend[] = [];

  for (const factor of factors) {
    const weights: number[] = chronological.map((row) => {
      const w = row.weights as Record<string, number>;
      return w[factor] ?? 0;
    });

    if (weights.every((w) => w === 0)) continue;

    const first = weights[0] ?? 0;
    const last  = weights[weights.length - 1] ?? first;
    const delta = last - first;

    const direction: FactorTrend["direction"] =
      delta > 1 ? "rising" : delta < -1 ? "falling" : "stable";

    trends.push({ factor, weights, direction, delta });
  }

  // Ordena: maior variação absoluta primeiro
  return trends.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 6);
}
