/**
 * BOB — Cliente HTTP para football-data.org (v4)
 *
 * FONTE PRIMÁRIA do Brasileirão 2026.
 * API-Football free NÃO cobre 2025+; football-data.org cobre BSA no plano free.
 *
 * Rate limit: 10 req/min (free tier).
 * Cache: Next.js fetch revalidate.
 *
 * Competition code: BSA (id 2013) — Campeonato Brasileiro Série A.
 *
 * ─── Arquitetura de Cache (PRD §9) ───────────────────────────────────────────
 *
 * As funções deste módulo existem em dois sabores:
 *
 *   RAW (sem sufixo):    Acesso direto à API — sem validação de throttle.
 *                        Usadas por cron jobs (post-round, chat) que precisam
 *                        de dados frescos independente do intervalo.
 *
 *   GATED (sufixo *Gated): Acesso controlado — bloqueado se já houve sync
 *                           nas últimas 24h para o mesmo endpoint.
 *                           Retornam `T | null` (null = throttle ativo).
 *
 * Taxa máxima: 10 req/min (free tier). O padrão Gated garante ~4 req/rodada.
 */

import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { checkFootballData, recordSync } from "./cache-gate";
import { blockCircuit, fetchJsonWithTimeout, isCircuitBlocked } from "@/lib/bob/data/external-guard";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type FDTeam = {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
};

export type FDStandingEntry = {
  position: number;
  team: FDTeam;
  playedGames: number;
  form: string | null; // ex: "W,D,L,W,W"
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
};

export type FDStandingsResponse = {
  competition: { id: number; name: string; code: string };
  season: {
    id: number;
    startDate: string;
    endDate: string;
    currentMatchday: number;
  };
  standings: Array<{
    stage: string;
    type: string; // "TOTAL" | "HOME" | "AWAY"
    group: string | null;
    table: FDStandingEntry[];
  }>;
};

export type FDScore = {
  winner: string | null;
  duration: string;
  fullTime: { home: number | null; away: number | null };
  halfTime: { home: number | null; away: number | null };
};

export type FDMatch = {
  id: number;
  utcDate: string;
  status: string; // "SCHEDULED" | "TIMED" | "IN_PLAY" | "PAUSED" | "FINISHED" | "POSTPONED" | "CANCELLED"
  matchday: number;
  stage: string;
  homeTeam: FDTeam;
  awayTeam: FDTeam;
  score: FDScore;
  odds?: { msg?: string; homeWin?: number; draw?: number; awayWin?: number };
  referees: Array<{ id: number; name: string; type: string; nationality: string }>;
};

export type FDMatchesResponse = {
  competition: { id: number; name: string };
  matches: FDMatch[];
  resultSet: { count: number };
};

export type FDH2HAggregates = {
  numberOfMatches: number;
  totalGoals: number;
  homeTeam: { id: number; name: string; wins: number; draws: number; losses: number };
  awayTeam: { id: number; name: string; wins: number; draws: number; losses: number };
};

export type FDH2HResponse = {
  aggregates: FDH2HAggregates;
  matches: FDMatch[];
};

export type FDTeamsResponse = {
  competition: { id: number; name: string };
  season: { id: number; currentMatchday: number };
  teams: Array<FDTeam & {
    address: string;
    website: string;
    founded: number;
    clubColors: string;
    venue: string;
    squad: Array<{ id: number; name: string; position: string; nationality: string }>;
  }>;
};

// ─── Fetch base ───────────────────────────────────────────────────────────────

const BASE = "https://api.football-data.org/v4";
const FD_TIMEOUT_MS = 10_000;
const FD_PROVIDER_KEY = "football-data";
const FD_STALE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function keyId(token: string): string {
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

async function recordFdFailure(path: string, statusCode: number | null, errorType: string): Promise<void> {
  try {
    await prisma.apiSyncLog.create({
      data: {
        source: "football-data",
        cacheKey: path,
        statusCode,
        recordCount: 0,
        notes: JSON.stringify({
          error_type: errorType,
          used_cache: false,
          fallback_used: false,
        }),
      },
    });
  } catch {
  }
}

function providerCacheKey(path: string): string {
  return `provider:football-data:${path}`;
}

async function readProviderCache<T>(
  path: string,
  ttlSeconds: number,
  options?: { allowStale?: boolean },
): Promise<{ data: T; stale: boolean } | null> {
  const cacheKey = providerCacheKey(path);
  const cached = await prisma.chatContextCache.findUnique({ where: { cacheKey } }).catch(() => null);
  if (!cached?.data) return null;

  const ageMs = Date.now() - new Date(cached.updatedAt).getTime();
  const fresh = ttlSeconds <= 0 || ageMs <= ttlSeconds * 1000;
  if (fresh) {
    console.info(`[DataGateway] cache_hit key=${cacheKey}`);
    return { data: cached.data as T, stale: false };
  }

  if (options?.allowStale && ageMs <= FD_STALE_MAX_AGE_MS) {
    console.info(`[DataGateway] stale_used key=${cacheKey}`);
    return { data: cached.data as T, stale: true };
  }

  console.info(`[DataGateway] cache_miss key=${cacheKey}`);
  return null;
}

async function writeProviderCache<T>(path: string, ttlSeconds: number, data: T): Promise<void> {
  const cacheKey = providerCacheKey(path);
  await prisma.chatContextCache.upsert({
    where: { cacheKey },
    create: {
      cacheKey,
      data: data as Prisma.InputJsonValue,
      ttlSeconds,
    },
    update: {
      data: data as Prisma.InputJsonValue,
      ttlSeconds,
    },
  }).catch(() => null);
}

export async function fdFetch<T>(path: string, revalidate: number): Promise<T> {
  const cached = await readProviderCache<T>(path, revalidate);
  if (cached) return cached.data;
  return fdFetchUncoalesced<T>(path, revalidate);
}

async function fdFetchUncoalesced<T>(path: string, revalidate: number): Promise<T> {
  const raw = (process.env.FOOTBALL_DATA_TOKEN ?? "").replace(/['"]/g, "");
  const keys = raw.split(",").map((k) => k.trim()).filter(Boolean);

  if (keys.length === 0) {
    throw new Error(
      "FOOTBALL_DATA_TOKEN não configurado. Adicione a variável ao .env.local"
    );
  }

  const availableKeys = keys.filter((token) => !isCircuitBlocked(`${FD_PROVIDER_KEY}:${keyId(token)}`));
  if (availableKeys.length === 0) {
    await recordFdFailure(path, null, "all-keys-in-cooldown");
    const stale = await readProviderCache<T>(path, revalidate, { allowStale: true });
    if (stale) return stale.data;
    throw new Error(
      `football-data.org: todas as ${keys.length} chave(s) estão em cooldown por 401/403/429.`
    );
  }

  const token = availableKeys[0]!;
  const providerKey = `${FD_PROVIDER_KEY}:${keyId(token)}`;

  try {
    const data = await fetchJsonWithTimeout<T>({
        url: `${BASE}${path}`,
        init: {
          headers: { "X-Auth-Token": token },
          next: { revalidate },
        },
        timeoutMs: FD_TIMEOUT_MS,
        providerKey,
        cacheKey: `football-data:${path}`,
      });
    await writeProviderCache(path, revalidate, data);
    return data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("provider-auth-blocked")) {
      blockCircuit(providerKey, "auth_blocked", message.includes("403") ? 403 : 401);
      await recordFdFailure(path, message.includes("403") ? 403 : 401, "auth_blocked");
    } else if (message.includes("provider-rate-limited")) {
      blockCircuit(providerKey, "rate_limited", 429);
      await recordFdFailure(path, 429, "rate_limited");
    } else if (message.includes("provider-circuit-open")) {
      await recordFdFailure(path, null, "provider-circuit-open");
    } else if (message.includes("api-lock-held") || message.includes("api-lock-skipped")) {
      await recordFdFailure(path, null, message.includes("api-lock-skipped") ? "api-lock-skipped" : "api-lock-held");
    } else if (message.includes("provider-temporary-error")) {
      await recordFdFailure(path, null, "temporary_error");
    } else if (message.includes("provider-http-error")) {
      await recordFdFailure(path, null, "http-error");
    } else {
      await recordFdFailure(path, null, message.includes("timeout") ? "timeout" : "network-error");
    }

    const stale = await readProviderCache<T>(path, revalidate, { allowStale: true });
    if (stale) return stale.data;
    throw new Error(`insufficient:football-data:${path}:${message}`);
  }
}

// ─── Helpers internos: Log de Sync (L1 + L2) ─────────────────────────────────

/**
 * Consulta o banco (L2) para obter o timestamp da última sincronização
 * de um endpoint do football-data.org. Passado ao cache-gate para que ele
 * decida se o throttle de 24h foi respeitado.
 */
async function _getLastSyncFD(cacheKey: string): Promise<Date | null> {
  const row = await prisma.apiSyncLog.findFirst({
    where: { source: "football-data", cacheKey },
    orderBy: { syncedAt: "desc" },
    select: { syncedAt: true },
  });
  return row?.syncedAt ?? null;
}

/**
 * Registra uma sincronização bem-sucedida:
 *   L1 → Map em memória do cache-gate (imediato, sem I/O)
 *   L2 → Tabela api_sync_log no banco (Event Sourcing, assíncrono)
 *
 * Chamado APENAS após confirmação de resposta 2xx da API.
 * Falhas no log não interrompem o fluxo principal.
 */
async function _logSyncFD(cacheKey: string, recordCount: number): Promise<void> {
  recordSync("football-data", cacheKey);
  try {
    await prisma.apiSyncLog.create({
      data: {
        source:      "football-data",
        cacheKey,
        windowLabel: null,
        statusCode:  200,
        recordCount,
        notes:       "Throttle 24h — sync autorizado pelo cache-gate.",
      },
    });
  } catch (err) {
    console.error(`[Football-Data] Falha ao registrar api_sync_log (${cacheKey}):`, err);
  }
}

// ─── Endpoints RAW (sem controle de throttle) ─────────────────────────────────

/**
 * Classificação atual do Brasileirão Série A.
 * Retorna TOTAL, HOME e AWAY standings.
 * Cache: 4h (dados mudam a cada rodada)
 */
export async function getStandings(): Promise<FDStandingsResponse> {
  return fdFetch<FDStandingsResponse>("/competitions/BSA/standings", 14400);
}

/**
 * Classificação atual do Brasileirão Série B.
 * Retorna null se não disponível no plano free ou se BSB não estiver cadastrado.
 * Cache: 4h
 */
export async function getSerieBStandings(): Promise<FDStandingsResponse | null> {
  try {
    return await fdFetch<FDStandingsResponse>("/competitions/BSB/standings", 14400);
  } catch {
    return null;
  }
}

/**
 * Jogos de uma rodada específica.
 * Cache: 4h
 */
export async function getMatchesByMatchday(matchday: number): Promise<FDMatchesResponse> {
  return fdFetch<FDMatchesResponse>(
    `/competitions/BSA/matches?matchday=${matchday}`,
    14400
  );
}

/**
 * Todos os jogos finalizados da temporada atual (para cálculo de forma).
 * Cache: 4h
 */
export async function getFinishedMatches(limit = 100): Promise<FDMatchesResponse> {
  return fdFetch<FDMatchesResponse>(
    `/competitions/BSA/matches?status=FINISHED&limit=${limit}`,
    14400
  );
}

/**
 * Head-to-head entre dois times (por matchId do football-data.org).
 * Cache: 7 dias
 */
export async function getH2H(matchId: number, limit = 10): Promise<FDH2HResponse> {
  return fdFetch<FDH2HResponse>(
    `/matches/${matchId}/head2head?limit=${limit}`,
    604800
  );
}

/**
 * Rodada (matchday) atual segundo o ponteiro do football-data.
 *
 * ⚠️ Não confie cegamente neste valor — ele pode avançar uma rodada quando jogos
 * são adiados/remarcados. Para detectar a próxima rodada com jogos ABERTOS use
 * `detectNextOpenRound()` em `./index.ts`. Mantido para compat e como fallback.
 *
 * Cache: 1h
 */
export async function getCurrentMatchday(): Promise<number> {
  const data = await fdFetch<FDStandingsResponse>("/competitions/BSA/standings", 3600);
  return data.season.currentMatchday;
}

/**
 * Todos os jogos AINDA NÃO ENCERRADOS (status ≠ FINISHED).
 * Útil para detectar a próxima rodada real com jogos abertos.
 *
 * Cache: 1h (precisa atualizar conforme jogos terminam)
 */
export async function getScheduledMatches(limit = 200): Promise<FDMatchesResponse> {
  return fdFetch<FDMatchesResponse>(
    `/competitions/BSA/matches?status=SCHEDULED,TIMED,IN_PLAY,PAUSED,POSTPONED&limit=${limit}`,
    3600,
  );
}

/**
 * Times do Brasileirão com elenco (squad).
 * Cache: 24h
 */
export async function getTeams(): Promise<FDTeamsResponse> {
  return fdFetch<FDTeamsResponse>("/competitions/BSA/teams", 86400);
}

// ─── Endpoints GATED (pipeline oficial — throttle 24h obrigatório) ────────────
//
// Usados exclusivamente pelo connectors/index.ts (orquestrador oficial).
// Retornam null quando o throttle de 24h está ativo para o cacheKey.
// Cada função possui um cacheKey fixo e único que identifica o endpoint.

/**
 * [GATED — 24h] Classificação do Brasileirão Série A.
 *
 * cacheKey: "FD-BSA-standings"
 * Objetivo: fornecer a tabela de pontos para o Anchor Score e UI.
 */
export async function getStandingsGated(): Promise<FDStandingsResponse | null> {
  const cacheKey = "FD-BSA-standings";
  const path = "/competitions/BSA/standings";
  const lastSyncedAt = await _getLastSyncFD(cacheKey);
  const decision = checkFootballData(cacheKey, lastSyncedAt);

  console.info(`[Football-Data/Gated] ${decision.reason}`);
  if (!decision.allowed) {
    return (await readProviderCache<FDStandingsResponse>(path, 14400, { allowStale: true }))?.data ?? null;
  }

  const result = await fdFetch<FDStandingsResponse>(path, 14400);
  // standings retorna um objeto com standings[].table[] — contar entradas do TOTAL
  const totalGroup = result.standings.find((s) => s.type === "TOTAL");
  const recordCount = totalGroup?.table.length ?? 0;
  await _logSyncFD(cacheKey, recordCount);
  return result;
}

/**
 * [GATED — 24h] Jogos de uma rodada específica.
 *
 * cacheKey: `FD-BSA-matchday-${matchday}`
 * Objetivo: calendário da rodada para exibição + triggers do orquestrador.
 */
export async function getMatchesByMatchdayGated(
  matchday: number
): Promise<FDMatchesResponse | null> {
  const cacheKey = `FD-BSA-matchday-${matchday}`;
  const path = `/competitions/BSA/matches?matchday=${matchday}`;
  const lastSyncedAt = await _getLastSyncFD(cacheKey);
  const decision = checkFootballData(cacheKey, lastSyncedAt);

  console.info(`[Football-Data/Gated] ${decision.reason}`);
  if (!decision.allowed) {
    return (await readProviderCache<FDMatchesResponse>(path, 14400, { allowStale: true }))?.data ?? null;
  }

  const result = await fdFetch<FDMatchesResponse>(path, 14400);
  await _logSyncFD(cacheKey, result.matches.length);
  return result;
}

/**
 * [GATED — 24h] Todos os jogos finalizados da temporada.
 *
 * cacheKey: "FD-BSA-finished"
 * Objetivo: cálculo de forma e histórico de resultados recentes.
 */
export async function getFinishedMatchesGated(
  limit = 100
): Promise<FDMatchesResponse | null> {
  const cacheKey = "FD-BSA-finished";
  const path = `/competitions/BSA/matches?status=FINISHED&limit=${limit}`;
  const lastSyncedAt = await _getLastSyncFD(cacheKey);
  const decision = checkFootballData(cacheKey, lastSyncedAt);

  console.info(`[Football-Data/Gated] ${decision.reason}`);
  if (!decision.allowed) {
    return (await readProviderCache<FDMatchesResponse>(path, 14400, { allowStale: true }))?.data ?? null;
  }

  const result = await fdFetch<FDMatchesResponse>(path, 14400);
  await _logSyncFD(cacheKey, result.matches.length);
  return result;
}

/**
 * [GATED — 24h] Times do Brasileirão com elenco (squad).
 *
 * cacheKey: "FD-BSA-teams"
 * Objetivo: mapeamento de times para enriquecer assets do TheSportsDB.
 */
export async function getTeamsGated(): Promise<FDTeamsResponse | null> {
  const cacheKey = "FD-BSA-teams";
  const path = "/competitions/BSA/teams";
  const lastSyncedAt = await _getLastSyncFD(cacheKey);
  const decision = checkFootballData(cacheKey, lastSyncedAt);

  console.info(`[Football-Data/Gated] ${decision.reason}`);
  if (!decision.allowed) {
    return (await readProviderCache<FDTeamsResponse>(path, 86400, { allowStale: true }))?.data ?? null;
  }

  const result = await fdFetch<FDTeamsResponse>(path, 86400);
  await _logSyncFD(cacheKey, result.teams.length);
  return result;
}
