/**
 * Serviço unificado de Odds cache-first.
 * Este módulo não chama providers externos; usa banco/gateway e retorna insufficient quando não há odds reais.
 */

import { prisma } from "@/lib/db";
import { getMarketOdds } from "@/lib/data/data-gateway";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

export type OddsEntry = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  market: string; // "1X2", "BTTS", "OVER_UNDER", etc
  homeOdd?: number;
  drawOdd?: number;
  awayOdd?: number;
  bttsYes?: number;
  bttsNo?: number;
  over25?: number;
  under25?: number;
  timestamp: Date;
  source: "cache";
};

// Cache em memória (LRU simples)
const memoryCache = new Map<string, { data: OddsEntry; timestamp: number }>();

/**
 * Busca odds reais do cache/banco.
 */
export async function fetchLiveOdds(
  homeTeam: string,
  awayTeam: string,
  matchId?: string
): Promise<OddsEntry | null> {
  const cacheKey = `odds:${homeTeam}:${awayTeam}`;
  
  // 1. Verificar cache de memória
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { ...cached.data, source: "cache" };
  }

  if (matchId) {
    const dbOdds = await getMarketOdds(matchId, { allowStale: true });
    if (dbOdds.ok && dbOdds.data) {
      return {
        matchId: dbOdds.data.matchId,
        homeTeam: dbOdds.data.homeTeam,
        awayTeam: dbOdds.data.awayTeam,
        market: "1X2",
        homeOdd: dbOdds.data.homeOdd,
        drawOdd: dbOdds.data.drawOdd,
        awayOdd: dbOdds.data.awayOdd,
        timestamp: dbOdds.data.timestamp,
        source: "cache",
      };
    }
  }

  const dbOdds = await fetchFromDatabase(homeTeam, awayTeam);
  if (dbOdds) {
    memoryCache.set(cacheKey, { data: dbOdds, timestamp: Date.now() });
    return { ...dbOdds, source: "cache" };
  }

  console.info(`[OddsService] insufficient key=${cacheKey} reason=no-database-odds`);
  return null;
}

/**
 * Busca múltiplas odds de uma vez (batch)
 */
export async function fetchOddsBatch(
  matches: Array<{ homeTeam: string; awayTeam: string; matchId?: string }>
): Promise<Map<string, OddsEntry>> {
  const results = new Map<string, OddsEntry>();
  
  await Promise.all(
    matches.map(async (m) => {
      const odds = await fetchLiveOdds(m.homeTeam, m.awayTeam, m.matchId);
      if (odds) {
        results.set(`${m.homeTeam}:${m.awayTeam}`, odds);
      }
    })
  );
  
  return results;
}

// ─── Implementações privadas ─────────────────────────────────────────────────

async function fetchFromDatabase(
  homeTeam: string,
  awayTeam: string
): Promise<OddsEntry | null> {
  // Buscar odds mais recentes do banco
  const match = await prisma.betMatch.findFirst({
    where: {
      OR: [
        { homeTeam: { contains: homeTeam, mode: "insensitive" } },
        { awayTeam: { contains: awayTeam, mode: "insensitive" } },
      ],
    },
    include: { odds: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!match?.odds?.length) return null;

  const odd1X2 = match.odds.find((o) => o.market === "RESULT_1X2");
  if (!odd1X2) return null;

  return {
    matchId: match.id,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    market: "1X2",
    homeOdd: odd1X2.odd,
    timestamp: match.updatedAt,
    source: "cache",
  };
}

/**
 * Limpa o cache (útil para forçar refresh)
 */
export function clearOddsCache() {
  memoryCache.clear();
}

/**
 * Retorna estatísticas do cache
 */
export function getCacheStats() {
  return {
    size: memoryCache.size,
    entries: Array.from(memoryCache.keys()),
  };
}
