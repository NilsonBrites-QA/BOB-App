/**
 * BOB — Round Difficulty Analyzer
 *
 * Analisa a "dificuldade" de uma rodada ANTES de gerar a análise completa.
 * Rodadas difíceis ativam: banner no dashboard, badge (!) nas âncoras,
 * explicação no chat e diversificação agressiva das variações.
 *
 * Critérios:
 *   - Distribuição de scores (variância alta = incerteza)
 *   - Concentração de clássicos regionais
 *   - Jogos top×top (posição ≤ 5) e bottom×bottom (posição ≥ 16)
 *   - Volume de ausências (`absenceRate`)
 *   - Odds muito próximas (mercado incerto)
 */

import type { ScoredMatch } from "./scoring";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type Difficulty = "easy" | "balanced" | "hard";

export type RoundAnalysis = {
  difficulty: Difficulty;
  /** Pontuação 0–100: quanto maior, mais difícil */
  difficultyScore: number;
  /** Razões humanas explicando a dificuldade */
  reasons: string[];
  /** Recomendação BOB para essa rodada */
  bobMessage: string;
  /** Métricas intermediárias para debugging */
  metrics: {
    avgScore: number;
    scoreVariance: number;
    classicCount: number;
    topVsTopCount: number;
    bottomVsBottomCount: number;
    avgAbsenceRate: number;
    closedOddsCount: number;
  };
};

// ─── Thresholds ───────────────────────────────────────────────────────────────

const DIFFICULTY_HARD_THRESHOLD     = 62;
const DIFFICULTY_BALANCED_THRESHOLD = 40;

// ─── Análise ─────────────────────────────────────────────────────────────────

/**
 * Analisa a dificuldade de uma rodada a partir dos jogos já pontuados.
 *
 * @param matches - Jogos da rodada com scores calculados (output de scoreMatch[])
 * @returns RoundAnalysis com difficulty, razões e recomendação BOB
 */
export function analyzeRoundDifficulty(matches: ScoredMatch[]): RoundAnalysis {
  if (matches.length === 0) {
    return {
      difficulty: "balanced",
      difficultyScore: 50,
      reasons: ["Rodada sem dados disponíveis"],
      bobMessage: "Dados insuficientes para análise de dificuldade.",
      metrics: {
        avgScore: 50, scoreVariance: 0, classicCount: 0,
        topVsTopCount: 0, bottomVsBottomCount: 0,
        avgAbsenceRate: 0, closedOddsCount: 0,
      },
    };
  }

  // ── Métrica 1: score médio e variância ────────────────────────────────────
  const scores = matches.map((m) => m.score);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const scoreVariance =
    scores.reduce((acc, s) => acc + Math.pow(s - avgScore, 2), 0) / scores.length;

  // Score médio baixo = rodada difícil (poucos favoritos claros)
  // Variância alta = rodada equilibrada (muita incerteza)
  const scoreDifficultyContrib = Math.max(0, 70 - avgScore); // 0-70 → 0-70 pts

  // ── Métrica 2: clássicos regionais ─────────────────────────────────────────
  const classicCount = matches.filter((m) => m.isClassico).length;
  const classicContrib = classicCount * 10; // 10 pts por clássico

  // ── Métrica 3: jogos top×top e bottom×bottom ──────────────────────────────
  const topVsTopCount = matches.filter(
    (m) => m.homePosition <= 5 && m.awayPosition <= 5
  ).length;
  const bottomVsBottomCount = matches.filter(
    (m) => m.homePosition >= 16 && m.awayPosition >= 16
  ).length;
  const extremeMatchContrib = (topVsTopCount + bottomVsBottomCount) * 5;

  // ── Métrica 4: volume de ausências ─────────────────────────────────────────
  const avgAbsenceRate =
    matches.reduce((acc, m) => acc + (m.homeAbsenceRate + m.awayAbsenceRate) / 2, 0) /
    matches.length;
  const absenceContrib = avgAbsenceRate * 25; // 0-25 pts

  // ── Métrica 5: odds fechadas (mercado indeciso) ────────────────────────────
  // Se homeOdd e awayOdd estão próximas (diferença ≤ 0.8), o mercado está incerto
  const closedOddsCount = matches.filter(
    (m) => Math.abs(m.homeOdd - m.awayOdd) <= 0.8
  ).length;
  const closedOddsContrib = (closedOddsCount / matches.length) * 20;

  // ── Score final de dificuldade (0-100) ─────────────────────────────────────
  const rawDifficultyScore =
    scoreDifficultyContrib + classicContrib + extremeMatchContrib +
    absenceContrib + closedOddsContrib;
  const difficultyScore = Math.round(Math.min(100, rawDifficultyScore));

  // ── Classificação ──────────────────────────────────────────────────────────
  const difficulty: Difficulty =
    difficultyScore >= DIFFICULTY_HARD_THRESHOLD     ? "hard" :
    difficultyScore >= DIFFICULTY_BALANCED_THRESHOLD ? "balanced" :
    "easy";

  // ── Razões em linguagem natural ───────────────────────────────────────────
  const reasons: string[] = [];

  if (avgScore < 55) {
    reasons.push(`Score médio baixo (${avgScore.toFixed(0)}/100) — poucos favoritos claros nesta rodada`);
  }
  if (scoreVariance > 200) {
    reasons.push("Alta variância nos scores — resultados imprevisíveis por toda a tabela");
  }
  if (classicCount >= 2) {
    reasons.push(`${classicCount} clássicos regionais — jogos com volatilidade estrutural alta`);
  } else if (classicCount === 1) {
    reasons.push("1 clássico regional na rodada — resultado menos previsível que o normal");
  }
  if (topVsTopCount >= 2) {
    reasons.push(`${topVsTopCount} confrontos diretos entre times do top 5 — equilíbrio alto`);
  }
  if (bottomVsBottomCount >= 3) {
    reasons.push(`${bottomVsBottomCount} jogos entre times na zona de rebaixamento — desespero gera imprevisibilidade`);
  }
  if (avgAbsenceRate > 0.15) {
    reasons.push(`Volume alto de desfalques (média ${(avgAbsenceRate * 100).toFixed(0)}%) — escalações incertas`);
  }
  if (closedOddsCount >= 5) {
    reasons.push(`${closedOddsCount} jogos com odds fechadas — Pinnacle não consegue separar favoritos`);
  }

  if (reasons.length === 0) {
    reasons.push("Rodada com distribuição de favoritos clara e favorável ao método");
  }

  // ── Mensagem BOB ──────────────────────────────────────────────────────────
  const bobMessage = difficulty === "hard"
    ? `Rodada complicada — score de dificuldade ${difficultyScore}/100. Confio no processo, mas a margem de erro é maior. ` +
      `Variações foram diversificadas para cobrir cenários. Manage your banca.`
    : difficulty === "balanced"
    ? `Rodada equilibrada (${difficultyScore}/100). Há oportunidades, mas também incertezas. BOB trabalhou as variações para maximizar cobertura.`
    : `Rodada favorável (${difficultyScore}/100) — distribuição de scores clara. As âncoras têm boa base de dados.`;

  return {
    difficulty,
    difficultyScore,
    reasons,
    bobMessage,
    metrics: {
      avgScore: Math.round(avgScore),
      scoreVariance: Math.round(scoreVariance),
      classicCount,
      topVsTopCount,
      bottomVsBottomCount,
      avgAbsenceRate: Math.round(avgAbsenceRate * 100) / 100,
      closedOddsCount,
    },
  };
}
