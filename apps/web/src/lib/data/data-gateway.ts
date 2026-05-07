import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import type { MatchInput } from "@/lib/bob/engine/scoring";
import { fetchRoundMatchInputs } from "@/lib/bob/connectors";

export type DataGatewaySource = "database" | "api" | "cache_hit" | "stale_valid" | "insufficient";

export type DataGatewayResult<T> = {
  ok: boolean;
  data: T | null;
  source: DataGatewaySource;
  stale: boolean;
  confidencePenalty: number;
  reason?: string;
};

export type GatewayOdds = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  market: "RESULT_1X2";
  homeOdd?: number;
  drawOdd?: number;
  awayOdd?: number;
  timestamp: Date;
  source: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const TABLE_CALENDAR_TTL_MS = DAY_MS;
const ODDS_ACTIVE_WINDOW_MS = 48 * 60 * 60 * 1000;
const UNKNOWN_NUMBER = Number.NaN;
const UNKNOWN_BOOLEAN = undefined as unknown as boolean;

type CachedBetMatch = Prisma.BetMatchGetPayload<{ include: { odds: true } }>;

export async function recordMemoryEvent(type: string, content: Record<string, unknown>, source?: string) {
  try {
    await prisma.memoryEvent.create({
      data: {
        layer: "RAW",
        type,
        content: content as Prisma.InputJsonValue,
        source,
        relevanceScore: 0.5,
      },
    });
  } catch {
  }
}

export async function recordApiEvent(args: {
  provider: string;
  endpoint: string;
  statusCode?: number;
  errorType?: string;
  usedCache: boolean;
  fallbackUsed: boolean;
  recordCount?: number;
}) {
  const normalizedSource = args.provider.split(":")[0] || args.provider;
  try {
    await prisma.apiSyncLog.create({
      data: {
        source: normalizedSource,
        cacheKey: args.endpoint,
        statusCode: args.statusCode,
        recordCount: args.recordCount ?? 0,
        notes: JSON.stringify({
          error_type: args.errorType ?? null,
          used_cache: args.usedCache,
          fallback_used: args.fallbackUsed,
        }),
      },
    });
  } catch {
  }
}

function isFresh(date: Date | null | undefined, ttlMs: number) {
  if (!date) return false;
  return Date.now() - date.getTime() <= ttlMs;
}

function isFinished(status: string | null | undefined) {
  return status === "FINISHED" || status === "FT" || status === "AET" || status === "PEN";
}

function activeOdd(match: CachedBetMatch, option: "HOME" | "DRAW" | "AWAY") {
  return match.odds.find((odd) =>
    odd.market === "RESULT_1X2" &&
    odd.isActive &&
    odd.option.toUpperCase() === option &&
    odd.odd > 1,
  )?.odd ?? 0;
}

function cachedMatchToInput(match: CachedBetMatch): MatchInput {
  return {
    id: match.externalId || match.id,
    match: `${match.homeTeam} x ${match.awayTeam}`,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homePosition: UNKNOWN_NUMBER,
    awayPosition: UNKNOWN_NUMBER,
    homeNeedsWin: UNKNOWN_BOOLEAN,
    awayNeedsWin: UNKNOWN_BOOLEAN,
    homeForm: [],
    awayForm: [],
    homeHomePoints: UNKNOWN_NUMBER,
    awayAwayPoints: UNKNOWN_NUMBER,
    homeGoalsScored5: UNKNOWN_NUMBER,
    homeGoalsConceded5: UNKNOWN_NUMBER,
    awayGoalsScored5: UNKNOWN_NUMBER,
    awayGoalsConceded5: UNKNOWN_NUMBER,
    h2hHomeWinRate: UNKNOWN_NUMBER,
    homeAbsenceRate: UNKNOWN_NUMBER,
    awayAbsenceRate: UNKNOWN_NUMBER,
    homeBigGameAhead: UNKNOWN_BOOLEAN,
    awayBigGameAhead: UNKNOWN_BOOLEAN,
    homeOdd: activeOdd(match, "HOME"),
    drawOdd: activeOdd(match, "DRAW"),
    awayOdd: activeOdd(match, "AWAY"),
    homeOddDropped: false,
    scheduledAt: match.scheduledAt.toISOString(),
    status: match.status,
    homeCrest: match.homeCrest,
    awayCrest: match.awayCrest,
  };
}

export async function getCachedRoundDataset(
  season: number,
  round: number,
): Promise<DataGatewayResult<MatchInput[]>> {
  if (!Number.isInteger(round) || round < 1 || round > 38) {
    return {
      ok: false,
      data: [],
      source: "insufficient",
      stale: false,
      confidencePenalty: 1,
      reason: "invalid_round_context",
    };
  }

  const cachedMatches = await prisma.betMatch.findMany({
    where: { season, round },
    orderBy: { scheduledAt: "asc" },
    include: { odds: true },
  });

  if (cachedMatches.length === 0) {
    return {
      ok: false,
      data: [],
      source: "database",
      stale: false,
      confidencePenalty: 1,
      reason: "missing_round_dataset",
    };
  }

  return {
    ok: true,
    data: cachedMatches.map(cachedMatchToInput),
    source: "database",
    stale: false,
    confidencePenalty: 0,
    reason: "database-round-available",
  };
}

export async function getMarketOdds(
  fixtureId: string,
  options?: { allowStale?: boolean },
): Promise<DataGatewayResult<GatewayOdds>> {
  const match = await prisma.betMatch.findUnique({
    where: { id: fixtureId },
    include: { odds: true },
  });

  if (!match) {
    await recordMemoryEvent("API_CACHE_MISS", { entity: "market_odds", fixtureId }, "database");
    return {
      ok: false,
      data: null,
      source: "database",
      stale: false,
      confidencePenalty: 1,
      reason: "fixture-not-found",
    };
  }

  const activeOdds = match.odds.filter((o) => o.market === "RESULT_1X2" && o.isActive);
  const newestOddAt = activeOdds.reduce<Date | null>((acc, odd) => {
    if (!acc || odd.updatedAt > acc) return odd.updatedAt;
    return acc;
  }, null);

  const complete = ["HOME", "DRAW", "AWAY"].every((option) =>
    activeOdds.some((odd) => odd.option === option && odd.odd > 1),
  );

  const immutable = isFinished(match.status);
  const fresh = immutable || isFresh(newestOddAt, ODDS_ACTIVE_WINDOW_MS);

  if (complete && fresh) {
    await recordMemoryEvent("API_CACHE_HIT", { entity: "market_odds", fixtureId }, "database");
    return {
      ok: true,
      data: {
        matchId: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        market: "RESULT_1X2",
        homeOdd: activeOdds.find((o) => o.option === "HOME")?.odd,
        drawOdd: activeOdds.find((o) => o.option === "DRAW")?.odd,
        awayOdd: activeOdds.find((o) => o.option === "AWAY")?.odd,
        timestamp: newestOddAt ?? match.updatedAt,
        source: "database",
      },
      source: "database",
      stale: false,
      confidencePenalty: 0,
    };
  }

  if (complete && options?.allowStale) {
    await recordMemoryEvent("API_CACHE_HIT", { entity: "market_odds", fixtureId, stale: true }, "database");
    return {
      ok: true,
      data: {
        matchId: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        market: "RESULT_1X2",
        homeOdd: activeOdds.find((o) => o.option === "HOME")?.odd,
        drawOdd: activeOdds.find((o) => o.option === "DRAW")?.odd,
        awayOdd: activeOdds.find((o) => o.option === "AWAY")?.odd,
        timestamp: newestOddAt ?? match.updatedAt,
        source: "database-stale",
      },
      source: "stale_valid",
      stale: true,
      confidencePenalty: 0.25,
      reason: "stale-odds-used",
    };
  }

  await recordMemoryEvent("API_CACHE_MISS", { entity: "market_odds", fixtureId, complete, fresh }, "database");
  return {
    ok: false,
    data: null,
    source: "database",
    stale: false,
    confidencePenalty: 1,
    reason: complete ? "odds-expired" : "odds-incomplete",
  };
}

export async function getRoundDataset(
  season: number,
  round: number,
): Promise<DataGatewayResult<MatchInput[]>> {
  const endpoint = `round-dataset:${season}:${round}`;
  const recentSync = await prisma.apiSyncLog.findFirst({
    where: { source: "football-data", cacheKey: endpoint },
    orderBy: { syncedAt: "desc" },
  });

  const cachedMatches = await prisma.betMatch.findMany({
    where: { season, round },
    orderBy: { scheduledAt: "asc" },
    include: { odds: true },
  });
  const cachedMatchInputs = cachedMatches.map(cachedMatchToInput);
  const hasCompleteMarketSnapshot =
    cachedMatchInputs.length > 0 &&
    cachedMatchInputs.every((m) => m.homeOdd > 1 && m.drawOdd > 1 && m.awayOdd > 1);

  const completeHistorical = cachedMatches.length > 0 && cachedMatches.every((m) => isFinished(m.status));
  const freshCalendar = cachedMatches.length > 0 && isFresh(recentSync?.syncedAt, TABLE_CALENDAR_TTL_MS);

  if (completeHistorical || (freshCalendar && hasCompleteMarketSnapshot)) {
    await recordApiEvent({
      provider: "football-data",
      endpoint,
      usedCache: true,
      fallbackUsed: false,
      recordCount: cachedMatches.length,
    });
    return {
      ok: true,
      data: cachedMatchInputs,
      source: "database",
      stale: false,
      confidencePenalty: 0,
      reason: "database-round-available",
    };
  }

  if (freshCalendar && !hasCompleteMarketSnapshot && cachedMatches.length > 0) {
    console.info(
      `[DataGateway] stale_market_snapshot_forcing_provider_fetch round=${round} season=${season} matches=${cachedMatches.length}`,
    );
  }

  try {
    const result = await fetchRoundMatchInputs(season, round);
    await recordApiEvent({
      provider: "football-data",
      endpoint,
      statusCode: 200,
      usedCache: false,
      fallbackUsed: false,
      recordCount: result.matches.length,
    });
    await recordMemoryEvent("DATASET_COMPLETED", { season, round, matches: result.matches.length }, "football-data");

    // Map apiMatch.id (externalId or internal id) → internal betMatch UUID for betOdds upserts.
    const internalIdByApiId = new Map<string, string>(
      cachedMatches.map((m) => [m.externalId ?? m.id, m.id]),
    );

    // Enrich API matches with persisted odds when external odds APIs returned zero values.
    const persistedOddsById = new Map(cachedMatchInputs.map((m) => [m.id, m]));
    const enrichedMatches = result.matches.map((apiMatch) => {
      if (apiMatch.homeOdd > 1 && apiMatch.drawOdd > 1 && apiMatch.awayOdd > 1) return apiMatch;
      const persisted = persistedOddsById.get(apiMatch.id);
      if (!persisted || !(persisted.homeOdd > 1 && persisted.drawOdd > 1 && persisted.awayOdd > 1))
        return apiMatch;
      console.info(
        `[DataGateway] odds_enriched_from_db match=${apiMatch.id} home=${persisted.homeOdd} draw=${persisted.drawOdd} away=${persisted.awayOdd} round=${round}`,
      );
      return { ...apiMatch, homeOdd: persisted.homeOdd, drawOdd: persisted.drawOdd, awayOdd: persisted.awayOdd };
    });

    // Persist valid odds to betOdds so that getCachedRoundDataset() can find them on subsequent calls.
    // This is the bridge between external odds providers and the DB-only page/loadOfficialRoundData path.
    const oddsToSync = enrichedMatches.filter((m) => m.homeOdd > 1 && m.drawOdd > 1 && m.awayOdd > 1);
    if (oddsToSync.length > 0 && internalIdByApiId.size > 0) {
      const oddsUpserts = oddsToSync.flatMap((m) => {
        const matchId = internalIdByApiId.get(m.id);
        if (!matchId) return [];
        return [
          prisma.betOdds.upsert({
            where: { matchId_market_option: { matchId, market: "RESULT_1X2", option: "HOME" } },
            update: { odd: m.homeOdd, isActive: true },
            create: { matchId, market: "RESULT_1X2", option: "HOME", optionLabel: "Casa", odd: m.homeOdd, isActive: true },
          }),
          prisma.betOdds.upsert({
            where: { matchId_market_option: { matchId, market: "RESULT_1X2", option: "DRAW" } },
            update: { odd: m.drawOdd, isActive: true },
            create: { matchId, market: "RESULT_1X2", option: "DRAW", optionLabel: "Empate", odd: m.drawOdd, isActive: true },
          }),
          prisma.betOdds.upsert({
            where: { matchId_market_option: { matchId, market: "RESULT_1X2", option: "AWAY" } },
            update: { odd: m.awayOdd, isActive: true },
            create: { matchId, market: "RESULT_1X2", option: "AWAY", optionLabel: "Visitante", odd: m.awayOdd, isActive: true },
          }),
        ];
      });
      if (oddsUpserts.length > 0) {
        await prisma.$transaction(oddsUpserts);
        console.info(
          `[DataGateway] odds_synced_to_db round=${round} matches=${oddsToSync.length} records=${oddsUpserts.length}`,
        );
      }
    }

    return {
      ok: true,
      data: enrichedMatches,
      source: "api",
      stale: false,
      confidencePenalty: 0,
    };
  } catch (err) {
    await recordApiEvent({
      provider: "football-data",
      endpoint,
      errorType: err instanceof Error ? err.message : String(err),
      usedCache: false,
      fallbackUsed: cachedMatches.length > 0,
      recordCount: cachedMatches.length,
    });

    if (cachedMatches.length > 0) {
      return {
        ok: true,
        data: cachedMatchInputs,
        source: "stale_valid",
        stale: true,
        confidencePenalty: 0.35,
        reason: "provider-failed-stale-round-available",
      };
    }

    return {
      ok: false,
      data: null,
      source: "api",
      stale: false,
      confidencePenalty: 1,
      reason: "provider-failed-no-cache",
    };
  }
}
