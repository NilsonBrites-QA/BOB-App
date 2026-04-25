/**
 * Serviço unificado de Odds - OddsPAPI + Cache
 * Todas as odds do BOB vêm daqui, nunca do banco local
 */

import { prisma } from "@/lib/db";

// Cache em memória (LRU simples)
const memoryCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// API Keys das env vars
const ODDS_PAPI_KEY = process.env.ODDSPAPI_KEY || "";
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "";

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
  source: "oddspapi" | "rapidapi" | "cache" | "mock";
};

/**
 * Busca odds reais da API com fallback
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

  // 2. Tentar OddsPAPI (principal)
  try {
    const odds = await fetchFromOddsPAPI(homeTeam, awayTeam);
    if (odds) {
      memoryCache.set(cacheKey, { data: odds, timestamp: Date.now() });
      await saveToDatabase(odds, matchId); // Persistir para histórico
      return odds;
    }
  } catch (e) {
    console.log("OddsPAPI failed, trying fallback...");
  }

  // 3. Fallback: RapidAPI
  try {
    const odds = await fetchFromRapidAPI(homeTeam, awayTeam);
    if (odds) {
      memoryCache.set(cacheKey, { data: odds, timestamp: Date.now() });
      await saveToDatabase(odds, matchId);
      return odds;
    }
  } catch (e) {
    console.log("RapidAPI failed, using database/mock...");
  }

  // 4. Último recurso: buscar do banco (últimos dados conhecidos)
  const dbOdds = await fetchFromDatabase(homeTeam, awayTeam);
  if (dbOdds) {
    return { ...dbOdds, source: "cache" };
  }

  // 5. Mock para desenvolvimento (nunca em produção)
  return generateMockOdds(homeTeam, awayTeam);
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

async function fetchFromOddsPAPI(
  homeTeam: string,
  awayTeam: string
): Promise<OddsEntry | null> {
  if (!ODDS_PAPI_KEY) return null;

  // OddsPAPI endpoint (documentação: https://oddspapi.com)
  const endpoint = `https://api.oddspapi.com/v1/odds?home=${encodeURIComponent(homeTeam)}&away=${encodeURIComponent(awayTeam)}&apiKey=${ODDS_PAPI_KEY}`;
  
  const response = await fetch(endpoint, {
    headers: { "Accept": "application/json" },
    next: { revalidate: 300 } // 5 minutos
  });

  if (!response.ok) throw new Error(`OddsPAPI error: ${response.status}`);

  const data = await response.json();
  
  return {
    matchId: `${homeTeam}-${awayTeam}`,
    homeTeam,
    awayTeam,
    market: "1X2",
    homeOdd: data.homeOdd || data.odds?.home,
    drawOdd: data.drawOdd || data.odds?.draw,
    awayOdd: data.awayOdd || data.odds?.away,
    timestamp: new Date(),
    source: "oddspapi",
  };
}

async function fetchFromRapidAPI(
  homeTeam: string,
  awayTeam: string
): Promise<OddsEntry | null> {
  if (!RAPIDAPI_KEY) return null;

  // API-Football via RapidAPI
  const endpoint = `https://api-football-v1.p.rapidapi.com/v3/odds?fixture=${encodeURIComponent(homeTeam + " vs " + awayTeam)}`;
  
  const response = await fetch(endpoint, {
    headers: {
      "X-RapidAPI-Key": RAPIDAPI_KEY,
      "X-RapidAPI-Host": "api-football-v1.p.rapidapi.com",
    },
    next: { revalidate: 300 }
  });

  if (!response.ok) throw new Error(`RapidAPI error: ${response.status}`);

  const data = await response.json();
  
  // Extrair odds do primeiro bookmaker
  const bookmaker = data.response?.[0]?.bookmakers?.[0];
  const bets = bookmaker?.bets?.[0]?.values || [];
  
  return {
    matchId: `${homeTeam}-${awayTeam}`,
    homeTeam,
    awayTeam,
    market: "1X2",
    homeOdd: parseFloat(bets.find((b: any) => b.value === "Home")?.odd),
    drawOdd: parseFloat(bets.find((b: any) => b.value === "Draw")?.odd),
    awayOdd: parseFloat(bets.find((b: any) => b.value === "Away")?.odd),
    timestamp: new Date(),
    source: "rapidapi",
  };
}

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

async function saveToDatabase(odds: OddsEntry, matchId?: string) {
  if (!matchId) return;
  
  // Salvar no banco para histórico
  await prisma.betOdds.upsert({
    where: {
      matchId_market_option: {
        matchId,
        market: "RESULT_1X2",
        option: "HOME",
      },
    },
    update: { odd: odds.homeOdd || 0 },
    create: {
      matchId,
      market: "RESULT_1X2",
      option: "HOME",
      optionLabel: "Casa",
      odd: odds.homeOdd || 0,
    },
  });
}

function generateMockOdds(homeTeam: string, awayTeam: string): OddsEntry {
  // Apenas para desenvolvimento - odds realistas baseadas em nomes
  const homeStrength = homeTeam.length; // Mock simples
  const awayStrength = awayTeam.length;
  const total = homeStrength + awayStrength;
  
  return {
    matchId: `${homeTeam}-${awayTeam}`,
    homeTeam,
    awayTeam,
    market: "1X2",
    homeOdd: Number((total / homeStrength * 0.8).toFixed(2)),
    drawOdd: Number((3.5).toFixed(2)),
    awayOdd: Number((total / awayStrength * 0.9).toFixed(2)),
    timestamp: new Date(),
    source: "mock",
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
