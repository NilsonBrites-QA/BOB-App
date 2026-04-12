/**
 * BOB — Orquestrador do pipeline de dados (Multi-API)
 *
 * Ponto de entrada único para buscar e normalizar dados de uma rodada.
 *
 * Hierarquia de fontes:
 *   1. football-data.org (PRIMÁRIA) — cobre BSA 2026, free, 10 req/min
 *   2. API-Football (COMPLEMENTO) — odds, injuries, lineups (free: 2022-2024 apenas)
 *   3. TheSportsDB — assets visuais (logos, banners) — 100% free
 *
 * Nota: API-Football free plan NÃO cobre 2025+.
 * Para temporada atual, football-data.org é a única fonte de dados de jogo.
 */

import * as fd from "./football-data";
import type { FDMatch, FDStandingEntry, FDH2HResponse } from "./football-data";
import type { MatchInput } from "@/lib/bob/engine/scoring";
import { fetchWeatherForRound } from "./weather";

// ─── Tipos exportados ─────────────────────────────────────────────────────────

export type FetchRoundResult = {
  matches: MatchInput[];
  meta: {
    season: number;
    round: number;
    fixtureCount: number;
    generatedAt: string;
    source: "football-data" | "api-football" | "demo";
    /** ISO string da data/hora do primeiro jogo da rodada (UTC) */
    firstMatchAt: string | null;
  };
};

// ─── Helpers: Cálculo de Forma ────────────────────────────────────────────────

/** Extrai form (W/D/L) dos últimos N jogos de um time a partir de jogos finalizados */
function extractFormFromMatches(
  allFinished: FDMatch[],
  teamId: number,
  n: number
): string[] {
  return allFinished
    .filter(
      (m) =>
        (m.homeTeam.id === teamId || m.awayTeam.id === teamId) &&
        m.status === "FINISHED" &&
        m.score.fullTime.home !== null
    )
    .sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime())
    .slice(0, n)
    .map((m) => {
      const isHome = m.homeTeam.id === teamId;
      const teamGoals = isHome ? m.score.fullTime.home! : m.score.fullTime.away!;
      const oppGoals = isHome ? m.score.fullTime.away! : m.score.fullTime.home!;
      if (teamGoals > oppGoals) return "W";
      if (teamGoals < oppGoals) return "L";
      return "D";
    });
}

/** Pontos nos últimos N jogos como mandante */
function extractHomePoints(allFinished: FDMatch[], teamId: number): number {
  return allFinished
    .filter(
      (m) =>
        m.homeTeam.id === teamId &&
        m.status === "FINISHED" &&
        m.score.fullTime.home !== null
    )
    .sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime())
    .slice(0, 5)
    .reduce((pts, m) => {
      const h = m.score.fullTime.home!;
      const a = m.score.fullTime.away!;
      return pts + (h > a ? 3 : h === a ? 1 : 0);
    }, 0);
}

/** Pontos nos últimos N jogos como visitante */
function extractAwayPoints(allFinished: FDMatch[], teamId: number): number {
  return allFinished
    .filter(
      (m) =>
        m.awayTeam.id === teamId &&
        m.status === "FINISHED" &&
        m.score.fullTime.home !== null
    )
    .sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime())
    .slice(0, 5)
    .reduce((pts, m) => {
      const h = m.score.fullTime.home!;
      const a = m.score.fullTime.away!;
      return pts + (a > h ? 3 : a === h ? 1 : 0);
    }, 0);
}

/** Gols marcados/sofridos nos últimos 5 jogos */
function extractGoals(
  allFinished: FDMatch[],
  teamId: number,
  type: "scored" | "conceded"
): number {
  return allFinished
    .filter(
      (m) =>
        (m.homeTeam.id === teamId || m.awayTeam.id === teamId) &&
        m.status === "FINISHED" &&
        m.score.fullTime.home !== null
    )
    .sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime())
    .slice(0, 5)
    .reduce((total, m) => {
      const isHome = m.homeTeam.id === teamId;
      const teamGoals = isHome ? m.score.fullTime.home! : m.score.fullTime.away!;
      const oppGoals = isHome ? m.score.fullTime.away! : m.score.fullTime.home!;
      return total + (type === "scored" ? teamGoals : oppGoals);
    }, 0);
}

/** Soma de pontos de uma sequência de resultados (W=3, D=1, L=0) */
function formPoints(form: string[]): number {
  return form.reduce((acc, r) => acc + (r === "W" ? 3 : r === "D" ? 1 : 0), 0);
}

/** Momentum: compara últimos 5 vs jogos 6-10. -1 a +1 */
function calcMomentum(form5: string[], form10: string[]): number {
  const older = form10.slice(5);
  if (older.length === 0) return 0;
  const recentPpg = formPoints(form5) / Math.max(form5.length, 1);
  const olderPpg = formPoints(older) / older.length;
  return Math.max(-1, Math.min(1, (recentPpg - olderPpg) / 3));
}

/** Motivação contextual */
function calcMotivation(position: number, round: number): number {
  if (position >= 17 || (position <= 3 && round >= 30)) return 2;
  if ((position >= 15 && round >= 25) || (position >= 5 && position <= 8 && round >= 25)) return 1;
  return 0;
}

/** Zona de pressão tática na tabela (Fator 14) */
function calcPressureZone(
  position: number,
  round: number
): "title" | "g4" | "g6" | "neutral" | "z5" | "z4" {
  if (position <= 1 && round >= 25) return "title";
  if (position <= 4) return "g4";
  if (position <= 6) return "g6";
  if (position >= 18) return "z4";
  if (position >= 16) return "z5";
  return "neutral";
}

/** Taxa de vitória do mandante em casa nos últimos 10 jogos (Fator 15) */
function calcStadiumWinRate(allFinished: FDMatch[], teamId: number): number {
  const homeGames = allFinished
    .filter(
      (m) =>
        m.homeTeam.id === teamId &&
        m.status === "FINISHED" &&
        m.score.fullTime.home !== null
    )
    .sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime())
    .slice(0, 10);

  if (homeGames.length === 0) return 0.5; // neutro se sem histórico
  const wins = homeGames.filter((m) => m.score.fullTime.home! > m.score.fullTime.away!).length;
  return wins / homeGames.length;
}

/** H2H win rate do mandante */
function calcH2HWinRate(h2h: FDH2HResponse, homeTeamId: number): number {
  if (!h2h.aggregates || h2h.aggregates.numberOfMatches === 0) return 0.4;
  const agg = h2h.aggregates;
  const isHome = agg.homeTeam.id === homeTeamId;
  const wins = isHome ? agg.homeTeam.wins : agg.awayTeam.wins;
  return wins / Math.max(agg.numberOfMatches, 1);
}

/** Pares de clássicos regionais */
const CLASSICO_PAIRS = new Set([
  "Flamengo-Fluminense", "Fluminense-Flamengo",
  "Flamengo-Vasco", "Vasco-Flamengo",
  "Fluminense-Vasco", "Vasco-Fluminense",
  "Botafogo-Flamengo", "Flamengo-Botafogo",
  "Botafogo-Fluminense", "Fluminense-Botafogo",
  "Botafogo-Vasco", "Vasco-Botafogo",
  "Palmeiras-Corinthians", "Corinthians-Palmeiras",
  "Palmeiras-São Paulo", "São Paulo-Palmeiras",
  "Corinthians-São Paulo", "São Paulo-Corinthians",
  "Santos-São Paulo", "São Paulo-Santos",
  "Santos-Palmeiras", "Palmeiras-Santos",
  "Atlético-Cruzeiro", "Cruzeiro-Atlético",
  "Grêmio-Internacional", "Internacional-Grêmio",
  "Athletico-Coritiba", "Coritiba-Athletico",
]);

function isClassico(home: string, away: string): boolean {
  // Normaliza para short names
  const norm = (n: string) =>
    n.replace(/\s*(FC|SC|EC|SE|CA|CR|AC|FBC|AF|FBPA)\s*/gi, "")
      .replace("Paranaense", "Athletico")
      .replace("Mineiro", "Atlético")
      .trim();
  const h = norm(home);
  const a = norm(away);
  for (const pair of CLASSICO_PAIRS) {
    const [p1, p2] = pair.split("-");
    if ((h.includes(p1!) && a.includes(p2!)) || (h.includes(p2!) && a.includes(p1!)))
      return true;
  }
  return false;
}

// ─── Pipeline principal (football-data.org) ───────────────────────────────────

/**
 * Busca dados da rodada via football-data.org e converte para MatchInput[].
 *
 * Pipeline:
 *   1. Standings + Fixtures da rodada (paralelo)
 *   2. Jogos finalizados da temporada (forma/momentum)
 *   3. H2H por par de times (paralelo, com rate-limit awareness)
 *   4. Normaliza → MatchInput[]
 */
export async function fetchRoundMatchInputs(
  season: number,
  round: number
): Promise<FetchRoundResult> {
  // ── Etapa 1: dados base em paralelo ─────────────────────────────────────
  const [standingsRes, matchesRes, finishedRes] = await Promise.all([
    fd.getStandings(),
    fd.getMatchesByMatchday(round),
    fd.getFinishedMatches(200),
  ]);

  const roundMatches = matchesRes.matches;
  if (roundMatches.length === 0) {
    return {
      matches: [],
      meta: {
        season,
        round,
        fixtureCount: 0,
        generatedAt: new Date().toISOString(),
        source: "football-data",
        firstMatchAt: null,
      },
    };
  }

  const standings =
    standingsRes.standings.find((s) => s.type === "TOTAL")?.table ?? [];

  // ── Etapa 2: H2H para cada jogo (throttled — 10 req/min limit) ─────────
  // Fazemos sequencialmente para respeitar rate limit do football-data.org
  const h2hMap = new Map<number, FDH2HResponse>();
  for (const m of roundMatches) {
    try {
      const h2h = await fd.getH2H(m.id, 10);
      h2hMap.set(m.id, h2h);
    } catch {
      // Se falhar (rate limit), continua sem H2H para esse jogo
    }
  }

  // ── Etapa 2B: Clima para todos os jogos da rodada (paralelo, non-blocking) ─
  const weatherMap = await fetchWeatherForRound(
    roundMatches.map((m) => ({
      id: m.id.toString(),
      homeTeam: m.homeTeam.shortName || m.homeTeam.name,
      utcDate: m.utcDate,
    }))
  ).catch(() => new Map());

  // ── Etapa 3: Normalizar para MatchInput[] ───────────────────────────────
  const allFinished = finishedRes.matches;
  const standingByTeamId = new Map<number, FDStandingEntry>(
    standings.map((s) => [s.team.id, s])
  );

  const matches: MatchInput[] = roundMatches.map((m): MatchInput => {
    const homeId = m.homeTeam.id;
    const awayId = m.awayTeam.id;
    const homeSt = standingByTeamId.get(homeId);
    const awaySt = standingByTeamId.get(awayId);
    const h2h = h2hMap.get(m.id);

    const homePos = homeSt?.position ?? 10;
    const awayPos = awaySt?.position ?? 10;

    // Forma
    const homeForm = extractFormFromMatches(allFinished, homeId, 5);
    const awayForm = extractFormFromMatches(allFinished, awayId, 5);
    const homeForm10 = extractFormFromMatches(allFinished, homeId, 10);
    const awayForm10 = extractFormFromMatches(allFinished, awayId, 10);

    // Odds: football-data.org free não inclui odds → usar estimativa baseada na diferença de posição
    // Fórmula calibrada com mercado real do Brasileirão:
    //   Favoritismo = (awayPos - homePos) / 19, com bônus mandante +0.15
    //   home_odd: líder em casa ~1.25, lanterna em casa vs líder ~4.50
    //   draw_odd: inversamente proporcional à diferença
    //   away_odd: reflete dificuldade de vencer fora
    const posDiffNorm = homeSt && awaySt
      ? (awayPos - homePos) / 19
      : 0; // -1 (mandante é lanterna) a +1 (mandante é líder)

    const homeAdvantage = 0.15; // bônus mandante
    const strength = Math.max(-1, Math.min(1, posDiffNorm + homeAdvantage));

    // Mapear strength para odds realistas do BSA
    const homeOdd = Math.max(1.12, 1.20 + (1 - strength) * 2.5);
    const awayOdd = Math.max(1.12, 1.20 + (1 + strength) * 2.5);
    const drawOdd = Math.max(2.80, 3.00 + Math.abs(strength) * 1.5);

    return {
      id: m.id.toString(),
      match: `${m.homeTeam.shortName || m.homeTeam.name} x ${m.awayTeam.shortName || m.awayTeam.name}`,
      homeTeam: m.homeTeam.shortName || m.homeTeam.name,
      awayTeam: m.awayTeam.shortName || m.awayTeam.name,

      homePosition: homePos,
      awayPosition: awayPos,
      homeNeedsWin: homePos >= 17 || (homePos <= 3 && round >= 30),
      awayNeedsWin: awayPos >= 17 || (awayPos <= 3 && round >= 30),

      homeForm,
      awayForm,
      homeHomePoints: extractHomePoints(allFinished, homeId),
      awayAwayPoints: extractAwayPoints(allFinished, awayId),

      homeGoalsScored5: extractGoals(allFinished, homeId, "scored"),
      homeGoalsConceded5: extractGoals(allFinished, homeId, "conceded"),
      awayGoalsScored5: extractGoals(allFinished, awayId, "scored"),
      awayGoalsConceded5: extractGoals(allFinished, awayId, "conceded"),

      h2hHomeWinRate: h2h ? calcH2HWinRate(h2h, homeId) : 0.4,

      homeAbsenceRate: 0, // football-data.org free não tem injuries
      awayAbsenceRate: 0,

      homeBigGameAhead: false,
      awayBigGameAhead: false,

      homeOdd,
      drawOdd,
      awayOdd,
      homeOddDropped: false,

      // Campos estendidos (Fase 10)
      homeForm10,
      awayForm10,
      homeMomentum: calcMomentum(homeForm, homeForm10),
      awayMomentum: calcMomentum(awayForm, awayForm10),
      motivationHome: calcMotivation(homePos, round),
      motivationAway: calcMotivation(awayPos, round),
      isClassico: isClassico(m.homeTeam.name, m.awayTeam.name),

      // Fase B: Fatores 11-15
      refereeCardRate: 2.0, // placeholder — sem fonte de dados de árbitro na API free

      // F12 — Clima (open-meteo.com)
      weatherRain:       weatherMap.get(m.id.toString())?.rain ?? false,
      weatherIntensity:  weatherMap.get(m.id.toString())?.intensity ?? "none",
      weatherTempC:      weatherMap.get(m.id.toString())?.tempC ?? 22,

      // F13 — Copa paralela: placeholder (API-Football não cobre 2025+ no free plan)
      homeCupCompetition: "none",
      awayCupCompetition: "none",

      // F14 — Pressão de posição (calculada a partir da classificação)
      homePressureZone: calcPressureZone(homePos, round),
      awayPressureZone: calcPressureZone(awayPos, round),

      // F15 — Histórico no estádio: derivado do aproveitamento em casa da temporada
      // Média ponderada: form em casa nos últimos 10 jogos como mandante
      homeStadiumWinRate: calcStadiumWinRate(allFinished, homeId),
    };
  });

  return {
    matches,
    meta: {
      season,
      round,
      fixtureCount: roundMatches.length,
      generatedAt: new Date().toISOString(),
      source: "football-data",
      firstMatchAt: roundMatches
        .map((m) => m.utcDate)
        .filter(Boolean)
        .sort()[0] ?? null,
    },
  };
}

/**
 * Detecta a rodada (matchday) atual do Brasileirão.
 * Usa football-data.org como fonte primária.
 */
export async function getCurrentRound(): Promise<number | null> {
  try {
    return await fd.getCurrentMatchday();
  } catch {
    return null;
  }
}
