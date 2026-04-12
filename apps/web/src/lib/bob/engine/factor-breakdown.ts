/**
 * BOB — Breakdown de Fatores por Jogo (Sprint 5)
 *
 * Retorna a nota individual (0–100) de cada um dos 15 fatores
 * para um MatchInput específico.
 *
 * Usado pela Página de Estatísticas para exibir o "painel de radar"
 * de cada jogo — usuário vê exatamente o que o motor considerou.
 *
 * Não duplica a lógica de scoreMatch() — extrai os valores intermediários
 * usando as mesmas equações do motor para garantir consistência.
 */

import type { MatchInput } from "./scoring";

// ─── Tipos ─────────────────────────────────────────────────────────────────

export type FactorScore = {
  id:       string;         // ex: "tableContext"
  label:    string;         // ex: "Contexto de tabela"
  score:    number;         // 0–100
  weight:   number;         // peso no motor (ex: 11)
  insight?: string;         // frase curta (opcional)
};

export type FactorBreakdown = {
  factors:        FactorScore[];
  totalScore:     number; // soma ponderada (espelho do scoreMatch — para conferência)
  homeWinProb:    number; // probabilidade implícita da odd do mandante (0–1)
  drawProb:       number;
  awayProb:       number;
  homeWinProbNorm: number; // normalizada (soma = 1)
  drawProbNorm:    number;
  awayWinProbNorm: number;
};

// ─── LABELS ──────────────────────────────────────────────────────────────────

const FACTOR_LABELS: Record<string, string> = {
  tableContext:     "Contexto de tabela",
  recentForm:       "Forma recente",
  momentum:         "Momentum",
  homeAway:         "Casa / Fora",
  goalsXg:          "Gols & Ataque",
  h2h:              "H2H",
  absences:         "Desfalques",
  calendar:         "Calendário",
  market:           "Mercado",
  motivation:       "Motivação",
  referee:          "Árbitro",
  weather:          "Clima",
  parallelCup:      "Copa paralela",
  positionPressure: "Pressão de posição",
  stadiumRecord:    "Histórico no estádio",
};

const WEIGHTS = {
  tableContext: 11, recentForm: 8, momentum: 6, homeAway: 8, goalsXg: 13,
  h2h: 6, absences: 11, calendar: 6, market: 8, motivation: 3,
  referee: 3, weather: 4, parallelCup: 4, positionPressure: 4, stadiumRecord: 5,
} as const;

// ─── Helpers (espelho fiel das funções em scoring.ts) ──────────────────────

function formScore(form: string[]): number {
  const pts = form.reduce((acc, r) => acc + (r === "W" ? 3 : r === "D" ? 1 : 0), 0);
  return pts / 15;
}
function positionScore(pos: number): number { return (20 - pos) / 19; }
function absencePenalty(rate: number): number { return Math.max(0, 1 - rate * 3); }
function oddToImpliedProb(odd: number): number { return odd > 0 ? 1 / odd : 0; }
function clamp(v: number): number { return Math.min(1, Math.max(0, v)); }

// ─── getFactorBreakdown ───────────────────────────────────────────────────────

/**
 * Calcula a nota de cada fator individualmente para um jogo.
 * Retorna também as probabilidades normalizadas das 3 opções (1/X/2).
 */
export function getFactorBreakdown(input: MatchInput): FactorBreakdown {
  // ── F1: Contexto de tabela ───────────────────────────────────────────────
  const homePosFactor = positionScore(input.homePosition);
  const awayPosFactor = positionScore(input.awayPosition);
  const tableDiff = homePosFactor - awayPosFactor;
  const tableScore = clamp(0.5 + tableDiff * 0.8);
  const tableBonus = input.homeNeedsWin ? 0.15 : input.awayNeedsWin ? -0.1 : 0;
  const f1 = clamp(tableScore + tableBonus);

  // ── F2: Forma recente ────────────────────────────────────────────────────
  const homeFormScore = formScore(input.homeForm);
  const awayFormScore = formScore(input.awayForm);
  const f2 = clamp(0.5 + (homeFormScore - awayFormScore));

  // ── F3: Casa / Fora ──────────────────────────────────────────────────────
  const homeHomeFactor = input.homeHomePoints / 15;
  const awayAwayFactor = input.awayAwayPoints / 15;
  const f3 = clamp(homeHomeFactor - awayAwayFactor * 0.5 + 0.3);

  // ── F4: Gols e ataque ────────────────────────────────────────────────────
  const homeAttack  = input.homeGoalsScored5 / 10;
  const homeDefense = 1 - input.homeGoalsConceded5 / 10;
  const awayAttack  = input.awayGoalsScored5 / 10;
  const awayDefense = 1 - input.awayGoalsConceded5 / 10;
  const f4 = clamp(0.5 + ((homeAttack + homeDefense) / 2 - (awayAttack + awayDefense) / 2));

  // ── F5: H2H ──────────────────────────────────────────────────────────────
  const f5 = input.h2hHomeWinRate;

  // ── F6: Desfalques ───────────────────────────────────────────────────────
  const homeAbsFactor = absencePenalty(input.homeAbsenceRate);
  const awayAbsFactor = absencePenalty(input.awayAbsenceRate);
  const f6 = clamp(0.5 + (homeAbsFactor - awayAbsFactor) * 0.5);

  // ── F7: Calendário ───────────────────────────────────────────────────────
  const calHome = input.homeBigGameAhead ? 0.3 : 1.0;
  const calAway = input.awayBigGameAhead ? 0.3 : 1.0;
  const f7 = clamp(0.5 + (calHome - calAway) * 0.4);

  // ── F8: Mercado ──────────────────────────────────────────────────────────
  const impliedHome = oddToImpliedProb(input.homeOdd);
  const f8 = clamp(Math.min(1, impliedHome * 1.5) + (input.homeOddDropped ? 0.1 : 0));

  // ── F9: Momentum ─────────────────────────────────────────────────────────
  const hMomentum = input.homeMomentum ?? 0;
  const aMomentum = input.awayMomentum ?? 0;
  const f9 = clamp(0.5 + (hMomentum - aMomentum) * 0.5);

  // ── F10: Motivação ───────────────────────────────────────────────────────
  const mHome = input.motivationHome ?? 0;
  const mAway = input.motivationAway ?? 0;
  const f10 = clamp(0.5 + (mHome - mAway) * 0.25);

  // ── F11: Árbitro ─────────────────────────────────────────────────────────
  const cardRate = input.refereeCardRate ?? 2.0;
  const f11 = clamp(1 - (cardRate - 1.0) / 4.0);

  // ── F12: Clima ───────────────────────────────────────────────────────────
  const rainPenalty =
    input.weatherIntensity === "heavy"    ? 0.25 :
    input.weatherIntensity === "moderate" ? 0.12 :
    input.weatherIntensity === "light"    ? 0.05 : 0;
  const tempPenalty = (input.weatherTempC ?? 22) < 12 ? 0.10 : 0;
  const f12 = clamp(1.0 - rainPenalty - tempPenalty);

  // ── F13: Copa paralela ───────────────────────────────────────────────────
  const cupWeight: Record<string, number> = {
    "libertadores": 0.90, "copa-br": 0.65, "sulamericana": 0.50, "none": 0.0,
  };
  const homeCupDistr = cupWeight[input.homeCupCompetition ?? "none"] ?? 0;
  const awayCupDistr = cupWeight[input.awayCupCompetition ?? "none"] ?? 0;
  const f13 = clamp(0.5 - homeCupDistr * 0.4 + awayCupDistr * 0.3);

  // ── F14: Pressão de posição ───────────────────────────────────────────────
  const pressureValue: Record<string, number> = {
    "title": 0.85, "g4": 0.70, "g6": 0.60,
    "neutral": 0.50, "z5": 0.35, "z4": 0.20,
  };
  const hPressure = pressureValue[input.homePressureZone ?? "neutral"] ?? 0.5;
  const aPressure = pressureValue[input.awayPressureZone ?? "neutral"] ?? 0.5;
  const f14 = clamp(0.5 + (hPressure - aPressure) * 0.6);

  // ── F15: Histórico no estádio ─────────────────────────────────────────────
  const stadiumWin = input.homeStadiumWinRate ?? 0.5;
  const f15 = clamp(stadiumWin * 0.9 + 0.05);

  // ── Score total ponderado ─────────────────────────────────────────────────
  const rawFactors = [f1, f2, f9, f3, f4, f5, f6, f7, f8, f10, f11, f12, f13, f14, f15];
  const factorIds  = [
    "tableContext", "recentForm", "momentum", "homeAway", "goalsXg",
    "h2h", "absences", "calendar", "market", "motivation",
    "referee", "weather", "parallelCup", "positionPressure", "stadiumRecord",
  ] as const;
  const weightValues = [
    WEIGHTS.tableContext, WEIGHTS.recentForm, WEIGHTS.momentum, WEIGHTS.homeAway, WEIGHTS.goalsXg,
    WEIGHTS.h2h, WEIGHTS.absences, WEIGHTS.calendar, WEIGHTS.market, WEIGHTS.motivation,
    WEIGHTS.referee, WEIGHTS.weather, WEIGHTS.parallelCup, WEIGHTS.positionPressure, WEIGHTS.stadiumRecord,
  ];

  let totalScore = 0;
  const factors: FactorScore[] = factorIds.map((id, i) => {
    const raw = rawFactors[i];
    const weight = weightValues[i];
    const score100 = Math.round(raw * 100);
    totalScore += raw * weight;

    return {
      id,
      label:   FACTOR_LABELS[id] ?? id,
      score:   score100,
      weight,
    };
  });

  // ── Probabilidades implícitas normalizadas ─────────────────────────────────
  const p1   = oddToImpliedProb(input.homeOdd);
  const pX   = oddToImpliedProb(input.drawOdd);
  const p2   = oddToImpliedProb(input.awayOdd);
  const pSum = p1 + pX + p2 || 1;

  return {
    factors,
    totalScore: Math.round(Math.min(100, Math.max(0, totalScore))),
    homeWinProb:     p1,
    drawProb:        pX,
    awayProb:        p2,
    homeWinProbNorm: p1 / pSum,
    drawProbNorm:    pX / pSum,
    awayWinProbNorm: p2 / pSum,
  };
}
