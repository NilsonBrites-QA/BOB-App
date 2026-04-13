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
 */

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

async function fdFetch<T>(path: string, revalidate: number): Promise<T> {
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

// ─── Endpoints ────────────────────────────────────────────────────────────────

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
