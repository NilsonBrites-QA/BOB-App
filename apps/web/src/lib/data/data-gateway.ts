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
  try {
    await prisma.apiSyncLog.create({
      data: {
        source: args.provider,
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

  const completeHistorical = cachedMatches.length > 0 && cachedMatches.every((m) => isFinished(m.status));
  const freshCalendar = cachedMatches.length > 0 && isFresh(recentSync?.syncedAt, TABLE_CALENDAR_TTL_MS);

  if (completeHistorical || freshCalendar) {
    await recordApiEvent({
      provider: "football-data",
      endpoint,
      usedCache: true,
      fallbackUsed: false,
      recordCount: cachedMatches.length,
    });
    return {
      ok: true,
      data: null,
      source: "database",
      stale: false,
      confidencePenalty: 0,
      reason: "database-round-available",
    };
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
    return {
      ok: true,
      data: result.matches,
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
        data: null,
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
