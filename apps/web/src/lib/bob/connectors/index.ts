/**
 * BOB — Orquestrador do pipeline de dados (Multi-API)
 *
 * Ponto de entrada único para buscar e normalizar dados de uma rodada.
 *
 * Hierarquia de fontes:
 *   1. football-data.org (PRIMÁRIA) — cobre BSA 2026, free, 10 req/min
 *   2. API-Football (COMPLEMENTO) — injuries, team stats, copa BR (free: 100 req/dia)
 *      CONFIRMADO: cobre temporada atual 2026 (league 71, Current: true)
 *   3. OddsPapi (ODDS REAIS) — Pinnacle via proxy, tournamentId=325 (A), 390 (B)
 *   4. TheSportsDB — assets visuais (logos, banners) — 100% free
 *   5. open-meteo.com — clima por estádio — gratuito e ilimitado
 */

// ─── Imports com política de acesso em camadas ─────────────────────────────────────────────
//
// Regra central (PRD §9 — "O Bisturi"):
//   GATED   → caminho oficial — checkgate L1+L2 antes de chamar a API.
//   RAW     → fallback INTERNO — acessa ISR do Next.js (edge cache).
//             NÃO re-exportadas; invisíveis para módulos externos.
//   DB-FIRST → TheSportsDB — leitura pura do banco, sem API call.
//
// ╳ PROIBIDO adicionar re-exportações de funções raw via este arquivo. ╳

// football-data.org ───────────────────────────────────────────────────
import {
  // Gated (caminho primário) — throttle 24h enforced via cache-gate
  getStandingsGated,
  getMatchesByMatchdayGated,
  getFinishedMatchesGated,
  // Raw (fallback interno) — ISR edge cache, sem nova chamada à API
  getStandings,
  getMatchesByMatchday,
  getFinishedMatches,
  // H2H: dados históricos; loop já é sequencial/throttled (sem janela aplicável)
  getH2H,
  // getCurrentMatchday: usado pelo getCurrentRound() — sem janela de throttle
  getCurrentMatchday,
} from "./football-data";
import type { FDMatch, FDStandingEntry, FDH2HResponse } from "./football-data";

// api-football (“O Bisturi”) ─────────────────────────────────────────
import {
  // Gated (primário) — janelas T-48h / T-24h / T-1h do PRD
  getInjuriesByDateGated,
  // Enriquecimento: Copa detection — não está nas 3 janelas do PRD §9.
  // Chamado apenas 3× por rodada; não exposto publicamente pelo index.ts.
  getFixturesByLeague,
} from "./api-football";

// TheSportsDB — DB-first absoluto ──────────────────────────────────
import { getTeamAssetsMap } from "./thesportsdb";
export type { TeamAssetRow } from "./thesportsdb";

import { getOddsByTournament, lookupOdds, TOURNAMENT_SERIE_A } from "./oddspapi";
import type { MatchInput } from "@/lib/bob/engine/scoring";
import { fetchWeatherForRound } from "./weather";

// ─── Tipos exportados ─────────────────────────────────────────────────────────

export type FetchRoundResult = {
  matches: MatchInput[];
  /**
   * Assets visuais dos times (logos, escudos, banners) — DB-first.
   * Keyed pelo nome curto do time em lowercase (ex: "flamengo", "palmeiras").
   * Pode ser vazio se `syncAllTeams()` ainda não foi executado no setup.
   */
  assets: Map<string, import("./thesportsdb").TeamAssetRow>;
  meta: {
    season: number;
    round: number;
    fixtureCount: number;
    generatedAt: string;
    source: "football-data" | "api-football" | "demo";
    /** ISO string da data/hora do primeiro jogo da rodada (UTC) */
    firstMatchAt: string | null;
    /**
     * Rastreio de quais fontes passaram pelo path gated (L2 hit = sync autorizado)
     * vs. path ISR (null = throttle ativo, dado servido do edge cache).
     * Exposto ao BOB Live Brain Console (Fase 4) via `meta.gatedHits`.
     */
    gatedHits: {
      standings: boolean;
      matchday: boolean;
      finished: boolean;
      injuries: boolean;
    };
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
  // ── Etapa 1: dados base em paralelo (gated-first + fallback ISR) ──────────
  //
  // Padrão: gatedFn().then(r => r ?? rawFn())
  //   Se gated retorna dado  → API chamada + L2 (api_sync_log) atualizado.
  //   Se gated retorna null  → throttle ativo; rawFn() serve do ISR edge cache
  //                            (Next.js fetch com revalidate já cacheado — sem
  //                             nova chamada à API).
  //
  // gatedHits: rastreia o caminho tomado para o BOB Live Brain Console.
  const gatedHits = { standings: false, matchday: false, finished: false, injuries: false };

  const [standingsRes, matchesRes, finishedRes, oddsMap] = await Promise.all([
    getStandingsGated().then((r) => {
      if (r) gatedHits.standings = true;
      return r ?? getStandings();
    }),
    getMatchesByMatchdayGated(round).then((r) => {
      if (r) gatedHits.matchday = true;
      return r ?? getMatchesByMatchday(round);
    }),
    getFinishedMatchesGated(200).then((r) => {
      if (r) gatedHits.finished = true;
      return r ?? getFinishedMatches(200);
    }),
    // OddsPapi: odds reais Pinnacle para o Brasileirão Série A
    getOddsByTournament(TOURNAMENT_SERIE_A).catch(() => new Map()),
  ]);

  const roundMatches = matchesRes.matches;
  if (roundMatches.length === 0) {
    return {
      matches: [],
      assets: new Map(),
      meta: {
        season,
        round,
        fixtureCount: 0,
        generatedAt: new Date().toISOString(),
        source: "football-data",
        firstMatchAt: null,
        gatedHits,
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
      const h2h = await getH2H(m.id, 10);
      h2hMap.set(m.id, h2h);
    } catch {
      // Se falhar (rate limit), continua sem H2H para esse jogo
    }
  }

  // ── Etapa 2B: Injuries (GATED T-24h — desbloqueia F6 — absenceRate) ──────
  // getInjuriesByDateGated: janela -24h → -12h antes do kickoff.
  // null = fora de janela ou já sincronizado hoje → usar injuriesMap vazio.
  let injuriesMap = new Map<number, number>(); // teamId → absenceRate (0-1)
  try {
    const firstMatchDate = roundMatches[0]?.utcDate?.split("T")[0];
    // firstKickoffAt: exigido pelo cache-gate para validar a janela T-24h
    const firstKickoffAt = roundMatches[0]?.utcDate
      ? new Date(roundMatches[0].utcDate)
      : new Date(Date.now() + 48 * 3600 * 1000); // fallback conservador
    if (firstMatchDate) {
      const injuriesRes = await getInjuriesByDateGated(season, firstMatchDate, firstKickoffAt);
      if (injuriesRes) {
        gatedHits.injuries = true;
        // Contar desfalques por time; assumindo elenco principal de ~25 jogadores
        const countByTeam = new Map<number, number>();
        for (const item of injuriesRes.response) {
          const tid = item.team.id;
          countByTeam.set(tid, (countByTeam.get(tid) ?? 0) + 1);
        }
        for (const [tid, count] of countByTeam) {
          injuriesMap.set(tid, Math.min(1, count / 25));
        }
      }
      // null = janela T-24h inativa ou throttle — injuriesMap permanece vazio
    }
  } catch {
    // API-Football indisponível ou quota atingida — continuar sem desfalques
    injuriesMap = new Map();
  }

  // ── Etapa 2C: Copa paralela via API-Football (desbloqueia F13) ───────────
  // Buscar fixtures da Copa do Brasil (league 73) nos próximos 7 dias para
  // detectar quais times têm jogo paralelo nesta semana.
  type CupComp = "none" | "copa-br" | "sulamericana" | "libertadores";
  const cupMap = new Map<number, CupComp>(); // teamId → copa
  try {
    const cupLeagues: Array<[number, CupComp]> = [
      [13, "libertadores"],
      [11, "sulamericana"],
      [73, "copa-br"],
    ];
    for (const [leagueId, cupName] of cupLeagues) {
      const cupRes = await getFixturesByLeague(leagueId, season);
      const nextWeek = Date.now() + 7 * 24 * 3600 * 1000;
      for (const fixture of cupRes.response) {
        const fixtureTime = new Date(fixture.fixture.date).getTime();
        if (fixtureTime > Date.now() && fixtureTime < nextWeek) {
          cupMap.set(fixture.teams.home.id, cupName);
          cupMap.set(fixture.teams.away.id, cupName);
        }
      }
    }
  } catch {
    // Falha silenciosa — usar "none" como default
  }

  // ── Etapa 2D: Assets visuais dos times (DB-first — sem chamada de API) ────
  // getTeamAssetsMap() lê exclusivamente do banco (tabela team_assets).
  // Não possui janela de cache: ou está no banco (sync já feito) ou não.
  // Se vazio: syncAllTeams() deve ser executado como setup job (TheSportsDB).
  const assets = await getTeamAssetsMap().catch(() => new Map());

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

    const homeTeamName = m.homeTeam.shortName || m.homeTeam.name;
    const awayTeamName = m.awayTeam.shortName || m.awayTeam.name;

    // ── Odds: OddsPapi (Pinnacle) › fallback sintético ──────────────────
    // Com odds reais: hasValueEdge funciona corretamente → 2-4 âncoras
    // Fallback: fórmula baseada na posição (igual ao original)
    let homeOdd: number;
    let drawOdd: number;
    let awayOdd: number;

    const realOdds = lookupOdds(homeTeamName, awayTeamName, oddsMap);
    if (realOdds) {
      homeOdd = realOdds.homeOdd;
      drawOdd = realOdds.drawOdd;
      awayOdd = realOdds.awayOdd;
    } else {
      // Fallback sintético (apenas quando OddsPapi não retorna o jogo)
      const posDiffNorm = homeSt && awaySt ? (awayPos - homePos) / 19 : 0;
      const strength = Math.max(-1, Math.min(1, posDiffNorm + 0.15));
      homeOdd = Math.max(1.12, 1.20 + (1 - strength) * 2.5);
      awayOdd = Math.max(1.12, 1.20 + (1 + strength) * 2.5);
      drawOdd = Math.max(2.80, 3.00 + Math.abs(strength) * 1.5);
    }

    // ── F6 — Ausências (API-Football) ────────────────────────────────────
    const homeAbsenceRate = injuriesMap.get(homeId) ?? 0;
    const awayAbsenceRate = injuriesMap.get(awayId) ?? 0;

    // ── F7 — Calendário (big game ahead derivado de Copa paralela) ────────
    const homeCup = cupMap.get(homeId) ?? ("none" as CupComp);
    const awayCup = cupMap.get(awayId) ?? ("none" as CupComp);
    const homeBigGameAhead = homeCup !== "none";
    const awayBigGameAhead = awayCup !== "none";

    return {
      id: m.id.toString(),
      match: `${homeTeamName} x ${awayTeamName}`,
      homeTeam: homeTeamName,
      awayTeam: awayTeamName,

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

      // F6 — Desfalques reais via API-Football
      homeAbsenceRate,
      awayAbsenceRate,

      // F7 — Calendário: derivado de copa paralela
      homeBigGameAhead,
      awayBigGameAhead,

      homeOdd,
      drawOdd,
      awayOdd,
      homeOddDropped: false, // detecção de queda de odd requer histórico de odds

      // Campos estendidos (Fase 10)
      homeForm10,
      awayForm10,
      homeMomentum: calcMomentum(homeForm, homeForm10),
      awayMomentum: calcMomentum(awayForm, awayForm10),
      motivationHome: calcMotivation(homePos, round),
      motivationAway: calcMotivation(awayPos, round),
      isClassico: isClassico(m.homeTeam.name, m.awayTeam.name),

      // F11 — Árbitro: placeholder (sem fonte de dados livre disponível)
      refereeCardRate: 2.0,

      // F12 — Clima (open-meteo.com)
      weatherRain:       weatherMap.get(m.id.toString())?.rain ?? false,
      weatherIntensity:  weatherMap.get(m.id.toString())?.intensity ?? "none",
      weatherTempC:      weatherMap.get(m.id.toString())?.tempC ?? 22,

      // F13 — Copa paralela via API-Football
      homeCupCompetition: homeCup,
      awayCupCompetition: awayCup,

      // F14 — Pressão de posição (calculada a partir da classificação)
      homePressureZone: calcPressureZone(homePos, round),
      awayPressureZone: calcPressureZone(awayPos, round),

      // F15 — Histórico no estádio: derivado do aproveitamento em casa da temporada
      // Média ponderada: form em casa nos últimos 10 jogos como mandante
      homeStadiumWinRate: calcStadiumWinRate(allFinished, homeId),

      // Status do jogo (SCHEDULED, TIMED, FINISHED, IN_PLAY etc.)
      status: m.status,
    };
  });

  return {
    matches,
    assets,
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
      gatedHits,
    },
  };
}

/**
 * Detecta a rodada (matchday) atual do Brasileirão.
 * Usa football-data.org como fonte primária.
 */
export async function getCurrentRound(): Promise<number | null> {
  try {
    return await getCurrentMatchday();
  } catch {
    return null;
  }
}

// ─── Re-exports seguros pelo Orquestrador ─────────────────────────────────────
//
// Apenas funções que NÃO burlam o cache-gate são re-exportadas daqui.
// Funções raw de football-data e api-football NÃO constam nesta lista.

/**
 * Assets visuais dos times (logos, escudos, banners).
 * DB-first absoluto: leitura pura do banco, sem chamada de API.
 * Re-exportada para uso direto pelo Cérebro e pelo Live Brain Console.
 */
export { getTeamAssetsMap } from "./thesportsdb";
