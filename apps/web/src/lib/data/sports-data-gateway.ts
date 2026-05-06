import { prisma } from "@/lib/db";
import { fetchRoundMatchInputs, getCurrentRound as getCurrentRoundFromConnectors } from "@/lib/bob/connectors";
import {
  getFixturesByRound as getApiFootballFixturesByRound,
  getH2H as getApiFootballH2H,
  getInjuriesByDate as getApiFootballInjuriesByDate,
  getOdds as getApiFootballOdds,
  getStandings as getApiFootballStandings,
  getTeamLastFixtures as getApiFootballTeamLastFixtures,
} from "@/lib/bob/connectors/api-football";
import type { AFFixtureItem, AFInjuryItem, AFOddsItem } from "@/lib/bob/connectors/api-football-types";
import {
  fdFetch,
  getFinishedMatchesGated,
  getMatchesByMatchdayGated,
  getSerieBStandings,
  getStandingsGated,
  type FDMatch,
  type FDMatchesResponse,
  type FDStandingEntry,
  type FDStandingsResponse,
} from "@/lib/bob/connectors/football-data";
import { normalizeMatchInputs } from "@/lib/bob/connectors/normalize";
import { getOddsFromTheOddsApi, listAvailableSports } from "@/lib/bob/connectors/the-odds-api";
import { getOddsByTournament, TOURNAMENT_SERIE_A } from "@/lib/bob/connectors/oddspapi";
import type { MatchInput } from "@/lib/bob/engine/scoring";
import { recordApiEvent, recordMemoryEvent } from "./data-gateway";

export type GatewayRoundResult = Awaited<ReturnType<typeof fetchRoundMatchInputs>>;
export type GatewayOddsMap = Awaited<ReturnType<typeof getOddsFromTheOddsApi>>;
export type GatewayBackfillActual = "HOME" | "DRAW" | "AWAY";
export type GatewayBackfillResult = {
  season: number;
  round: number;
  matches: MatchInput[];
  fixtureCount: number;
  completed: boolean;
  pending: string[];
  realResults: Map<string, GatewayBackfillActual>;
};

const BSA_STANDINGS_CACHE_KEY = "gateway:football-data:standings:BSA";
const BSB_STANDINGS_CACHE_KEY = "gateway:football-data:standings:BSB";
const FINISHED_CACHE_KEY = "gateway:football-data:finished:BSA";

function uniqueTeamIds(fixtures: AFFixtureItem[]): number[] {
  const ids = new Set<number>();
  for (const fixture of fixtures) {
    ids.add(fixture.teams.home.id);
    ids.add(fixture.teams.away.id);
  }
  return Array.from(ids);
}

function uniqueDates(fixtures: AFFixtureItem[]): string[] {
  const dates = new Set<string>();
  for (const fixture of fixtures) {
    const date = fixture.fixture.date.split("T")[0];
    if (date) dates.add(date);
  }
  return Array.from(dates);
}

function apiFootballRealResult(fixture: AFFixtureItem): GatewayBackfillActual | null {
  const home = fixture.goals.home;
  const away = fixture.goals.away;
  if (home === null || away === null) return null;
  if (home > away) return "HOME";
  if (home < away) return "AWAY";
  return "DRAW";
}

function serializeBackfillResult(result: GatewayBackfillResult) {
  return {
    season: result.season,
    round: result.round,
    matches: result.matches,
    fixtureCount: result.fixtureCount,
    completed: result.completed,
    pending: result.pending,
    realResults: Array.from(result.realResults.entries()),
  };
}

function deserializeBackfillResult(data: unknown): GatewayBackfillResult | null {
  const value = data as {
    season?: number;
    round?: number;
    matches?: MatchInput[];
    fixtureCount?: number;
    completed?: boolean;
    pending?: string[];
    realResults?: Array<[string, GatewayBackfillActual]>;
  };
  if (!Array.isArray(value.matches) || !Array.isArray(value.realResults)) return null;
  return {
    season: Number(value.season ?? 0),
    round: Number(value.round ?? 0),
    matches: value.matches,
    fixtureCount: Number(value.fixtureCount ?? value.matches.length),
    completed: Boolean(value.completed),
    pending: Array.isArray(value.pending) ? value.pending : [],
    realResults: new Map(value.realResults),
  };
}

function toFdMatchesResponse(matches: FDMatch[]): FDMatchesResponse {
  return {
    competition: { id: 2013, name: "Campeonato Brasileiro Série A" },
    matches,
    resultSet: { count: matches.length },
  };
}

export async function validateApiCacheLocksTable() {
  try {
    await prisma.$queryRaw<Array<{ cache_key: string }>>`
      select cache_key from api_cache_locks limit 1
    `;
    return true;
  } catch {
    return false;
  }
}

export async function getGatewayCurrentRound(): Promise<number | null> {
  try {
    return await getCurrentRoundFromConnectors();
  } catch (err) {
    await recordApiEvent({ provider: "football-data", endpoint: "current-round", errorType: err instanceof Error ? err.message : String(err), usedCache: false, fallbackUsed: false });
    return null;
  }
}

export async function getGatewayRoundDataset(season: number, round: number): Promise<GatewayRoundResult | null> {
  try {
    return await fetchRoundMatchInputs(season, round);
  } catch (err) {
    await recordApiEvent({ provider: "football-data", endpoint: `round-dataset:${season}:${round}`, errorType: err instanceof Error ? err.message : String(err), usedCache: false, fallbackUsed: false });
    return null;
  }
}

export async function getGatewayFootballDataCompetitionMatches(
  competitionCode: string,
  season: number,
): Promise<FDMatchesResponse | null> {
  const cacheKey = `gateway:football-data:competition:${competitionCode}:${season}`;
  const cached = await prisma.chatContextCache.findUnique({ where: { cacheKey } }).catch(() => null);
  if (cached?.data) {
    await recordMemoryEvent("API_CACHE_HIT", { entity: "competition_matches", competitionCode, season }, "database");
    return cached.data as unknown as FDMatchesResponse;
  }

  try {
    const response = await fdFetch<FDMatchesResponse>(
      `/competitions/${competitionCode}/matches?season=${season}`,
      3600,
    );
    await prisma.chatContextCache.upsert({
      where: { cacheKey },
      create: { cacheKey, data: response as object, season, ttlSeconds: 3600 },
      update: { data: response as object, season, ttlSeconds: 3600 },
    }).catch(() => null);
    await recordApiEvent({ provider: "football-data", endpoint: cacheKey, statusCode: 200, usedCache: false, fallbackUsed: false, recordCount: response.matches.length });
    return response;
  } catch (err) {
    await recordApiEvent({ provider: "football-data", endpoint: cacheKey, errorType: err instanceof Error ? err.message : String(err), usedCache: false, fallbackUsed: false });
    return null;
  }
}

export async function getGatewayBackfillRoundDataset(
  season: number,
  round: number,
): Promise<GatewayBackfillResult> {
  const cacheKey = `gateway:backfill:api-football:${season}:${round}`;
  const cached = await prisma.chatContextCache.findUnique({ where: { cacheKey } }).catch(() => null);
  const cachedResult = cached?.data ? deserializeBackfillResult(cached.data) : null;
  if (cachedResult?.completed) {
    await recordMemoryEvent("API_CACHE_HIT", { entity: "backfill_round", season, round }, "database");
    return cachedResult;
  }

  await recordMemoryEvent("API_CACHE_MISS", { entity: "backfill_round", season, round }, "api-football");

  const [standingsRes, fixturesRes] = await Promise.all([
    getApiFootballStandings(season),
    getApiFootballFixturesByRound(season, round),
  ]);

  const roundFixtures = fixturesRes.response;
  const completedStatuses = new Set(["FT", "AET", "PEN", "AWD"]);
  const pending = roundFixtures
    .filter((fixture) => !completedStatuses.has(fixture.fixture.status.short))
    .map((fixture) => `${fixture.teams.home.name} x ${fixture.teams.away.name} [${fixture.fixture.status.short}]`);
  const completed = roundFixtures.length > 0 && pending.length === 0;

  if (roundFixtures.length === 0 || !completed) {
    return {
      season,
      round,
      matches: [],
      fixtureCount: roundFixtures.length,
      completed,
      pending,
      realResults: new Map(),
    };
  }

  const standingsData = standingsRes.response[0];
  const standings = standingsData?.league?.standings?.[0] ?? [];
  const teamIds = uniqueTeamIds(roundFixtures);
  const matchDates = uniqueDates(roundFixtures);

  const [teamLastFixturesArr, h2hArr, injuriesArr, oddsArr] = await Promise.all([
    Promise.all(
      teamIds.map((teamId) =>
        getApiFootballTeamLastFixtures(teamId, season, 10).then((response) => ({ teamId, fixtures: response.response })),
      ),
    ),
    Promise.all(
      roundFixtures.map((fixture) =>
        getApiFootballH2H(fixture.teams.home.id, fixture.teams.away.id, 10).then((response) => ({
          key: `${fixture.teams.home.id}-${fixture.teams.away.id}`,
          fixtures: response.response,
        })),
      ),
    ),
    Promise.all(matchDates.map((date) => getApiFootballInjuriesByDate(season, date))).then(
      (responses) => responses.flatMap((response): AFInjuryItem[] => response.response),
    ),
    Promise.all(
      roundFixtures.map((fixture) =>
        getApiFootballOdds(fixture.fixture.id)
          .then((response) => ({ fixtureId: fixture.fixture.id, data: response.response[0] as AFOddsItem | undefined }))
          .catch(() => ({ fixtureId: fixture.fixture.id, data: undefined as AFOddsItem | undefined })),
      ),
    ),
  ]);

  const teamLastFixtures: Record<number, AFFixtureItem[]> = {};
  for (const { teamId, fixtures } of teamLastFixturesArr) {
    teamLastFixtures[teamId] = fixtures;
  }

  const h2hByKey: Record<string, AFFixtureItem[]> = {};
  for (const { key, fixtures } of h2hArr) {
    h2hByKey[key] = fixtures;
  }

  const oddsMap: Record<number, AFOddsItem> = {};
  for (const { fixtureId, data } of oddsArr) {
    if (data) oddsMap[fixtureId] = data;
  }

  const matches = normalizeMatchInputs(
    { roundFixtures, standings, teamLastFixtures, h2hByKey, teamStats: {}, injuries: injuriesArr, oddsMap },
    round,
    true,
  );

  const realResults = new Map<string, GatewayBackfillActual>();
  for (const fixture of roundFixtures) {
    const result = apiFootballRealResult(fixture);
    if (result) realResults.set(String(fixture.fixture.id), result);
  }

  const result: GatewayBackfillResult = {
    season,
    round,
    matches,
    fixtureCount: roundFixtures.length,
    completed,
    pending,
    realResults,
  };

  if (matches.length > 0) {
    await prisma.chatContextCache.upsert({
      where: { cacheKey },
      create: { cacheKey, data: serializeBackfillResult(result) as object, season, round, ttlSeconds: null },
      update: { data: serializeBackfillResult(result) as object, season, round, ttlSeconds: null },
    }).catch(() => null);
    await recordApiEvent({ provider: "api-football", endpoint: cacheKey, statusCode: 200, usedCache: false, fallbackUsed: false, recordCount: matches.length });
  }

  return result;
}

export async function getGatewayStandings(): Promise<FDStandingsResponse | null> {
  const cached = await prisma.chatContextCache.findUnique({ where: { cacheKey: BSA_STANDINGS_CACHE_KEY } }).catch(() => null);
  if (cached?.data) {
    await recordMemoryEvent("API_CACHE_HIT", { entity: "standings", cacheKey: BSA_STANDINGS_CACHE_KEY }, "database");
    return cached.data as unknown as FDStandingsResponse;
  }

  const result = await getStandingsGated();
  if (!result) {
    await recordMemoryEvent("API_CACHE_MISS", { entity: "standings", cacheKey: BSA_STANDINGS_CACHE_KEY }, "football-data");
    return null;
  }

  await prisma.chatContextCache.upsert({
    where: { cacheKey: BSA_STANDINGS_CACHE_KEY },
    create: { cacheKey: BSA_STANDINGS_CACHE_KEY, data: result as object, ttlSeconds: 4 * 3600 },
    update: { data: result as object, ttlSeconds: 4 * 3600 },
  }).catch(() => null);
  await recordApiEvent({ provider: "football-data", endpoint: BSA_STANDINGS_CACHE_KEY, statusCode: 200, usedCache: false, fallbackUsed: false, recordCount: result.standings.find((s) => s.type === "TOTAL")?.table.length ?? 0 });
  return result;
}

export async function getGatewaySerieBStandings(): Promise<FDStandingsResponse | null> {
  const cached = await prisma.chatContextCache.findUnique({ where: { cacheKey: BSB_STANDINGS_CACHE_KEY } }).catch(() => null);
  if (cached?.data) return cached.data as unknown as FDStandingsResponse;

  const result = await getSerieBStandings();
  if (!result) return null;
  await prisma.chatContextCache.upsert({
    where: { cacheKey: BSB_STANDINGS_CACHE_KEY },
    create: { cacheKey: BSB_STANDINGS_CACHE_KEY, data: result as object, ttlSeconds: 4 * 3600 },
    update: { data: result as object, ttlSeconds: 4 * 3600 },
  }).catch(() => null);
  return result;
}

export async function getGatewayMatchesByMatchday(matchday: number): Promise<FDMatchesResponse | null> {
  const cachedMatches = await prisma.betMatch.findMany({
    where: { round: matchday },
    orderBy: { scheduledAt: "asc" },
  }).catch(() => []);

  if (cachedMatches.length > 0) {
    await recordMemoryEvent("API_CACHE_HIT", { entity: "matches_by_matchday", matchday, count: cachedMatches.length }, "database");
    return toFdMatchesResponse(cachedMatches.map((match) => ({
      id: Number(String(match.externalId ?? match.id).replace(/\D/g, "")) || 0,
      utcDate: match.scheduledAt.toISOString(),
      status: match.status,
      matchday: match.round ?? matchday,
      stage: "REGULAR_SEASON",
      homeTeam: { id: 0, name: match.homeTeam, shortName: match.homeTeam, tla: match.homeTeam.slice(0, 3).toUpperCase(), crest: match.homeCrest ?? "" },
      awayTeam: { id: 0, name: match.awayTeam, shortName: match.awayTeam, tla: match.awayTeam.slice(0, 3).toUpperCase(), crest: match.awayCrest ?? "" },
      score: { winner: null, duration: "REGULAR", fullTime: { home: match.homeScore, away: match.awayScore }, halfTime: { home: null, away: null } },
      referees: [],
    })));
  }

  const result = await getMatchesByMatchdayGated(matchday);
  if (!result) return null;
  return result;
}

export async function getGatewayFinishedMatches(limit = 100): Promise<FDMatchesResponse | null> {
  const cached = await prisma.chatContextCache.findUnique({ where: { cacheKey: `${FINISHED_CACHE_KEY}:${limit}` } }).catch(() => null);
  if (cached?.data) return cached.data as unknown as FDMatchesResponse;

  const result = await getFinishedMatchesGated(limit);
  if (!result) return null;
  await prisma.chatContextCache.upsert({
    where: { cacheKey: `${FINISHED_CACHE_KEY}:${limit}` },
    create: { cacheKey: `${FINISHED_CACHE_KEY}:${limit}`, data: result as object, ttlSeconds: 4 * 3600 },
    update: { data: result as object, ttlSeconds: 4 * 3600 },
  }).catch(() => null);
  return result;
}

export async function getGatewayOddsDiagnostics() {
  const results: Record<string, unknown> = { generatedAt: new Date().toISOString() };
  try {
    const map = await getOddsFromTheOddsApi();
    results.theOddsApi = { status: map.size > 0 ? "OK" : "EMPTY", games: map.size };
  } catch (err) {
    results.theOddsApi = { status: "ERROR", error: String(err) };
  }
  try {
    const map = await getOddsByTournament(TOURNAMENT_SERIE_A);
    results.oddspapi = { status: map.size > 0 ? "OK" : "EMPTY", games: map.size };
  } catch (err) {
    results.oddspapi = { status: "ERROR", error: String(err) };
  }
  try {
    results.availableSports = await listAvailableSports();
  } catch {
    results.availableSports = [];
  }
  return results;
}

export type { FDMatch, FDMatchesResponse, FDStandingEntry, FDStandingsResponse, MatchInput };
