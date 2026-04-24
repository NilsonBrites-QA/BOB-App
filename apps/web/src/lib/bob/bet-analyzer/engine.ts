/**
 * BOB Bet Analyzer - Motor de Análise de Apostas
 * 
 * Calcula probabilidades para diferentes mercados e gera sugestões
 * personalizadas por perfil de apostador.
 */

import type { MatchInput, ScoredMatch } from "../engine/scoring";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type MarketType = 
  | "1x2"           // Resultado final
  | "btts"          // Ambos marcam
  | "over_under"    // Total de gols
  | "correct_score" // Placar exato
  | "double_chance" // Chance dupla
  | "handicap"      // Handicap asiático
  | "first_half"    // Gols no 1º tempo
  | "corners"       // Escanteios
  | "cards";        // Cartões

export type Selection = 
  | "home" | "draw" | "away"  // 1x2
  | "yes" | "no"             // BTTS
  | "over_1_5" | "over_2_5" | "over_3_5"  // Over/Under
  | "under_1_5" | "under_2_5" | "under_3_5" // Under
  | string; // Placar exato, handicap, etc

export type ProbabilitySet = {
  homeWin: number;
  draw: number;
  awayWin: number;
  bttsYes: number;
  bttsNo: number;
  over1_5: number;
  over2_5: number;
  over3_5: number;
  under1_5: number;
  under2_5: number;
  under3_5: number;
};

export type MarketProbability = {
  market: MarketType;
  selection: Selection;
  probability: number; // 0-1
  impliedOdd: number;  // 1/probability
  confidence: number;  // 0-1 baseado na qualidade dos dados
};

export type MatchProbabilities = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  probabilities: ProbabilitySet;
  markets: MarketProbability[];
  factors: ProbabilityFactors;
  calculatedAt: string;
};

export type ProbabilityFactors = {
  // Fatores ofensivos
  homeAttackStrength: number;
  awayAttackStrength: number;
  homeDefenseWeakness: number;
  awayDefenseWeakness: number;
  
  // Forma recente
  homeFormFactor: number;
  awayFormFactor: number;
  
  // Contexto
  homeAdvantage: number;
  motivationFactor: number;
  
  // Qualidade da previsão
  dataQuality: number;
  uncertainty: number;
};

// ─── Constantes ──────────────────────────────────────────────────────────────

// Pesos para cálculo de probabilidades (ajustáveis)
const WEIGHTS = {
  form: 0.25,
  position: 0.20,
  goals: 0.20,
  h2h: 0.15,
  homeAway: 0.15,
  motivation: 0.05,
};

// Médias da Série A (para normalização)
const SERIE_A_AVERAGES = {
  homeWinRate: 0.45,
  drawRate: 0.25,
  awayWinRate: 0.30,
  avgHomeGoals: 1.4,
  avgAwayGoals: 1.1,
  bttsRate: 0.52,
  over25Rate: 0.48,
};

// ─── Funções Principais ──────────────────────────────────────────────────────

/**
 * Calcula probabilidades completas para uma partida.
 * Usa modelo de Poisson simplificado + fatores contextuais.
 */
export function calculateMatchProbabilities(
  match: MatchInput
): MatchProbabilities {
  // 1. Calcular fatores de força
  const factors = calculateFactors(match);
  
  // 2. Probabilidades básicas 1x2 (modelo de Poisson simplificado)
  const probabilities1x2 = calculate1x2Probabilities(match, factors);
  
  // 3. Probabilidades de gols
  const goalProbabilities = calculateGoalProbabilities(match, factors);
  
  // 4. Probabilidades derivadas
  const bttsProbability = calculateBTTSProbability(match, factors);
  const overUnderProbabilities = calculateOverUnderProbabilities(goalProbabilities);
  
  // 5. Montar resultado completo
  const probSet: ProbabilitySet = {
    homeWin: probabilities1x2.home,
    draw: probabilities1x2.draw,
    awayWin: probabilities1x2.away,
    bttsYes: bttsProbability,
    bttsNo: 1 - bttsProbability,
    over1_5: overUnderProbabilities.over1_5,
    over2_5: overUnderProbabilities.over2_5,
    over3_5: overUnderProbabilities.over3_5,
    under1_5: 1 - overUnderProbabilities.over1_5,
    under2_5: 1 - overUnderProbabilities.over2_5,
    under3_5: 1 - overUnderProbabilities.over3_5,
  };
  
  // 6. Lista de mercados com probabilidades
  const markets = buildMarketProbabilities(probSet, factors.dataQuality);
  
  return {
    matchId: match.id,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    probabilities: probSet,
    markets,
    factors,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Calcula fatores de força baseados nos dados da partida.
 */
function calculateFactors(match: MatchInput): ProbabilityFactors {
  // Forma recente (últimos 5)
  const homeFormPoints = match.homeForm.reduce((acc, r) => {
    if (r === "W") return acc + 3;
    if (r === "D") return acc + 1;
    return acc;
  }, 0) / 15; // normalizar 0-1
  
  const awayFormPoints = match.awayForm.reduce((acc, r) => {
    if (r === "W") return acc + 3;
    if (r === "D") return acc + 1;
    return acc;
  }, 0) / 15;
  
  // Força ofensiva (gols marcados vs média)
  const homeAttackStrength = Math.min(match.homeGoalsScored5 / (5 * SERIE_A_AVERAGES.avgHomeGoals), 2.0);
  const awayAttackStrength = Math.min(match.awayGoalsScored5 / (5 * SERIE_A_AVERAGES.avgAwayGoals), 2.0);
  
  // Fraqueza defensiva (gols sofridos vs média)
  const homeDefenseWeakness = Math.min(match.homeGoalsConceded5 / (5 * SERIE_A_AVERAGES.avgHomeGoals), 2.0);
  const awayDefenseWeakness = Math.min(match.awayGoalsConceded5 / (5 * SERIE_A_AVERAGES.avgAwayGoals), 2.0);
  
  // Vantagem casa (baseada em pontos em casa vs fora)
  const homeAdvantage = Math.min(match.homeHomePoints / 15, 1.5);
  
  // Motivação (fim de temporada, necessidade de vitória)
  const motivationFactor = (match.homeNeedsWin ? 0.15 : 0) + (match.awayNeedsWin ? 0.1 : 0);
  
  // Qualidade dos dados (quanto mais dados, melhor)
  const hasForm = match.homeForm.length >= 3 && match.awayForm.length >= 3;
  const hasH2H = match.h2hHomeWinRate > 0;
  const dataQuality = (hasForm ? 0.4 : 0.2) + (hasH2H ? 0.3 : 0.1) + 0.3;
  
  // Incerteza (quanto maior a entropia, maior a incerteza)
  const positionUncertainty = Math.abs(match.homePosition - match.awayPosition) < 3 ? 0.3 : 0.1;
  const formUncertainty = Math.abs(homeFormPoints - awayFormPoints) < 0.2 ? 0.2 : 0.1;
  const uncertainty = positionUncertainty + formUncertainty;
  
  return {
    homeAttackStrength,
    awayAttackStrength,
    homeDefenseWeakness,
    awayDefenseWeakness,
    homeFormFactor: homeFormPoints,
    awayFormFactor: awayFormPoints,
    homeAdvantage,
    motivationFactor,
    dataQuality,
    uncertainty,
  };
}

/**
 * Calcula probabilidades 1x2 usando modelo simplificado.
 */
function calculate1x2Probabilities(
  match: MatchInput,
  factors: ProbabilityFactors
): { home: number; draw: number; away: number } {
  // Probabilidade base da posição
  const positionDiff = match.awayPosition - match.homePosition;
  const baseHomeWin = SERIE_A_AVERAGES.homeWinRate + (positionDiff * 0.015);
  const baseAwayWin = SERIE_A_AVERAGES.awayWinRate - (positionDiff * 0.015);
  const baseDraw = SERIE_A_AVERAGES.drawRate;
  
  // Ajustar por forma
  const formAdjustment = (factors.homeFormFactor - factors.awayFormFactor) * 0.15;
  
  // Ajustar por vantagem casa
  const homeAdvantageAdj = (factors.homeAdvantage - 0.5) * 0.1;
  
  // Ajustar por H2H
  const h2hAdjustment = (match.h2hHomeWinRate - 0.5) * 0.05;
  
  // Calcular probabilidades finais
  let home = baseHomeWin + formAdjustment + homeAdvantageAdj + h2hAdjustment;
  let away = baseAwayWin - formAdjustment - homeAdvantageAdj - h2hAdjustment;
  let draw = baseDraw;
  
  // Normalizar para somar 1
  const total = home + draw + away;
  home /= total;
  draw /= total;
  away /= total;
  
  // Limites realistas
  home = Math.max(0.15, Math.min(0.75, home));
  away = Math.max(0.15, Math.min(0.60, away));
  draw = Math.max(0.10, Math.min(0.35, 1 - home - away));
  
  // Re-normalizar
  const finalTotal = home + draw + away;
  return {
    home: home / finalTotal,
    draw: draw / finalTotal,
    away: away / finalTotal,
  };
}

/**
 * Calcula distribuição de probabilidades de gols.
 */
function calculateGoalProbabilities(
  match: MatchInput,
  factors: ProbabilityFactors
): { homeExpected: number; awayExpected: number } {
  // Gols esperados (modelo de Poisson simplificado)
  const homeExpected = 
    SERIE_A_AVERAGES.avgHomeGoals * 
    factors.homeAttackStrength * 
    factors.awayDefenseWeakness * 
    (1 + factors.homeAdvantage * 0.3);
  
  const awayExpected = 
    SERIE_A_AVERAGES.avgAwayGoals * 
    factors.awayAttackStrength * 
    factors.homeDefenseWeakness * 
    (1 - factors.homeAdvantage * 0.2);
  
  return { homeExpected, awayExpected };
}

/**
 * Calcula probabilidade de Ambos Marcam (BTTS).
 */
function calculateBTTSProbability(
  match: MatchInput,
  factors: ProbabilityFactors
): number {
  // Base: média da Série A
  let probability = SERIE_A_AVERAGES.bttsRate;
  
  // Ajustar por força ofensiva
  const offenseFactor = (factors.homeAttackStrength + factors.awayAttackStrength) / 2;
  probability *= (0.8 + offenseFactor * 0.4);
  
  // Ajustar por fraqueza defensiva
  const defenseFactor = (factors.homeDefenseWeakness + factors.awayDefenseWeakness) / 2;
  probability *= (0.8 + defenseFactor * 0.4);
  
  // Limitar
  return Math.max(0.25, Math.min(0.75, probability));
}

/**
 * Calcula probabilidades Over/Under baseadas na distribuição de Poisson.
 */
function calculateOverUnderProbabilities(
  goalProb: { homeExpected: number; awayExpected: number }
): { over1_5: number; over2_5: number; over3_5: number } {
  const { homeExpected, awayExpected } = goalProb;
  const totalExpected = homeExpected + awayExpected;
  
  // Simplificação: usar acumulada da Poisson
  // P(over 1.5) = 1 - P(0 gols) - P(1 gol)
  // P(over 2.5) = 1 - P(0) - P(1) - P(2)
  // etc
  
  const poisson = (lambda: number, k: number): number => {
    return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
  };
  
  const factorial = (n: number): number => {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
  };
  
  // Probabilidades acumuladas
  let p0orLess = poisson(totalExpected, 0);
  let p1orLess = p0orLess + poisson(totalExpected, 1);
  let p2orLess = p1orLess + poisson(totalExpected, 2);
  let p3orLess = p2orLess + poisson(totalExpected, 3);
  
  return {
    over1_5: 1 - p1orLess,
    over2_5: 1 - p2orLess,
    over3_5: 1 - p3orLess,
  };
}

/**
 * Constrói lista completa de mercados com probabilidades.
 */
function buildMarketProbabilities(
  probSet: ProbabilitySet,
  dataQuality: number
): MarketProbability[] {
  const markets: MarketProbability[] = [];
  
  // 1x2
  markets.push(
    { market: "1x2", selection: "home", probability: probSet.homeWin, impliedOdd: 1/probSet.homeWin, confidence: dataQuality },
    { market: "1x2", selection: "draw", probability: probSet.draw, impliedOdd: 1/probSet.draw, confidence: dataQuality * 0.9 },
    { market: "1x2", selection: "away", probability: probSet.awayWin, impliedOdd: 1/probSet.awayWin, confidence: dataQuality }
  );
  
  // BTTS
  markets.push(
    { market: "btts", selection: "yes", probability: probSet.bttsYes, impliedOdd: 1/probSet.bttsYes, confidence: dataQuality * 0.85 },
    { market: "btts", selection: "no", probability: probSet.bttsNo, impliedOdd: 1/probSet.bttsNo, confidence: dataQuality * 0.85 }
  );
  
  // Over/Under
  markets.push(
    { market: "over_under", selection: "over_1_5", probability: probSet.over1_5, impliedOdd: 1/probSet.over1_5, confidence: dataQuality * 0.8 },
    { market: "over_under", selection: "over_2_5", probability: probSet.over2_5, impliedOdd: 1/probSet.over2_5, confidence: dataQuality * 0.85 },
    { market: "over_under", selection: "over_3_5", probability: probSet.over3_5, impliedOdd: 1/probSet.over3_5, confidence: dataQuality * 0.75 },
    { market: "over_under", selection: "under_2_5", probability: probSet.under2_5, impliedOdd: 1/probSet.under2_5, confidence: dataQuality * 0.85 },
    { market: "over_under", selection: "under_3_5", probability: probSet.under3_5, impliedOdd: 1/probSet.under3_5, confidence: dataQuality * 0.8 }
  );
  
  return markets;
}

// ─── Funções de Scoring por Perfil ───────────────────────────────────────────

export type ProfileSlug = "conservador" | "moderado" | "agressivo" | "matematico";

export type ProfileScore = {
  profile: ProfileSlug;
  market: MarketType;
  selection: Selection;
  score: number;        // 0-100
  odd: number;
  expectedValue: number;
  confidence: number;
  recommendation: "strong" | "medium" | "weak" | "avoid";
  reasoning: string[];
};

/**
 * Avalia todos os mercados para um perfil específico.
 */
export function scoreMarketsForProfile(
  matchProbs: MatchProbabilities,
  profile: ProfileSlug
): ProfileScore[] {
  const scores: ProfileScore[] = [];
  
  for (const market of matchProbs.markets) {
    const score = calculateProfileScore(market, profile, matchProbs);
    if (score) {
      scores.push(score);
    }
  }
  
  // Ordenar por score decrescente
  return scores.sort((a, b) => b.score - a.score);
}

function calculateProfileScore(
  market: MarketProbability,
  profile: ProfileSlug,
  matchProbs: MatchProbabilities
): ProfileScore | null {
  const impliedProb = 1 / market.impliedOdd;
  const calculatedProb = market.probability;
  const edge = calculatedProb - impliedProb;
  
  let score = 0;
  let recommendation: ProfileScore["recommendation"] = "avoid";
  const reasoning: string[] = [];
  
  switch (profile) {
    case "conservador":
      // Prefere probabilidades altas (>50%), odds baixas (1.20-1.70)
      if (calculatedProb < 0.50) return null; // Ignora probabilidades baixas
      if (market.impliedOdd > 2.0) return null; // Ignora odds altas
      
      score = Math.round(calculatedProb * 100);
      if (calculatedProb > 0.65 && edge > 0.05) {
        recommendation = "strong";
        reasoning.push("Alta probabilidade de acerto (>65%)");
      } else if (calculatedProb > 0.55) {
        recommendation = "medium";
        reasoning.push("Probabilidade razoável de acerto");
      } else {
        recommendation = "weak";
      }
      break;
      
    case "moderado":
      // Balanceia risco e retorno, odds 1.75-4.50
      if (market.impliedOdd < 1.70 || market.impliedOdd > 5.0) return null;
      
      score = Math.round((calculatedProb * 0.6 + (1/market.impliedOdd) * 0.4) * 100);
      if (edge > 0.08) {
        recommendation = "strong";
        reasoning.push("Valor identificado (edge positivo)");
      } else if (edge > 0.03) {
        recommendation = "medium";
        reasoning.push("Leve vantagem estatística");
      } else {
        recommendation = "weak";
      }
      break;
      
    case "agressivo":
      // Busca odds altas, aceita risco
      if (market.impliedOdd < 2.5) return null;
      
      score = Math.round((market.impliedOdd * calculatedProb) * 30); // EV ponderado
      if (market.impliedOdd > 4.0 && calculatedProb > 0.20) {
        recommendation = "strong";
        reasoning.push("Odd alta com probabilidade decente");
      } else if (market.impliedOdd > 3.0) {
        recommendation = "medium";
      } else {
        recommendation = "weak";
      }
      break;
      
    case "matematico":
      // Busca value bets (EV positivo)
      const ev = (calculatedProb * market.impliedOdd) - 1;
      if (ev < 0) return null; // Só Value Bets
      
      score = Math.round(ev * 200); // Score baseado no EV
      if (ev > 0.10) {
        recommendation = "strong";
        reasoning.push(`EV positivo de ${(ev * 100).toFixed(1)}%`);
      } else if (ev > 0.05) {
        recommendation = "medium";
        reasoning.push("EV positivo moderado");
      } else {
        recommendation = "weak";
      }
      break;
  }
  
  // Adicionar contexto
  if (matchProbs.factors.uncertainty > 0.3) {
    reasoning.push("Partida equilibrada - incerteza elevada");
  }
  
  return {
    profile,
    market: market.market,
    selection: market.selection,
    score: Math.min(100, Math.max(0, score)),
    odd: market.impliedOdd,
    expectedValue: (calculatedProb * market.impliedOdd) - 1,
    confidence: market.confidence,
    recommendation,
    reasoning,
  };
}
