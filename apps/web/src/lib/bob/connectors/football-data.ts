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

import { prisma } from "@/lib/db";
import { checkFootballData, recordSync } from "./cache-gate";

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

export async function fdFetch<T>(path: string, revalidate: number): Promise<T> {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    throw new Error(
      "FOOTBALL_DATA_TOKEN não configurado. Adicione a variável ao .env.local"
    );
  }

  const res = await fetch(`${BASE}${path}`, {
    headers: { "X-Auth-Token": token },
    next: { revalidate },
  });

  if (res.status === 429) {
    throw new Error("football-data.org rate limit atingido (10 req/min). Aguarde e tente novamente.");
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`football-data.org erro HTTP ${res.status} em ${path}: ${body.slice(0, 200)}`);
  }

  return (await res.json()) as T;
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
 * Rodada (matchday) atual.
 * Cache: 1h
 */
export async function getCurrentMatchday(): Promise<number> {
  const data = await fdFetch<FDStandingsResponse>("/competitions/BSA/standings", 3600);
  return data.season.currentMatchday;
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
  const lastSyncedAt = await _getLastSyncFD(cacheKey);
  const decision = checkFootballData(cacheKey, lastSyncedAt);

  console.info(`[Football-Data/Gated] ${decision.reason}`);
  if (!decision.allowed) return null;

  const result = await getStandings();
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
  const lastSyncedAt = await _getLastSyncFD(cacheKey);
  const decision = checkFootballData(cacheKey, lastSyncedAt);

  console.info(`[Football-Data/Gated] ${decision.reason}`);
  if (!decision.allowed) return null;

  const result = await getMatchesByMatchday(matchday);
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
  const lastSyncedAt = await _getLastSyncFD(cacheKey);
  const decision = checkFootballData(cacheKey, lastSyncedAt);

  console.info(`[Football-Data/Gated] ${decision.reason}`);
  if (!decision.allowed) return null;

  const result = await getFinishedMatches(limit);
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
  const lastSyncedAt = await _getLastSyncFD(cacheKey);
  const decision = checkFootballData(cacheKey, lastSyncedAt);

  console.info(`[Football-Data/Gated] ${decision.reason}`);
  if (!decision.allowed) return null;

  const result = await getTeams();
  await _logSyncFD(cacheKey, result.teams.length);
  return result;
}
