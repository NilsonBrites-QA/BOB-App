/**
 * BOB — Cliente HTTP para TheSportsDB
 *
 * Fonte de assets visuais (logos, banners) e dados complementares.
 * API 100% gratuita — key "3" para patreon plan, funciona para o que precisamos.
 *
 * Rate limit: sem limite documentado.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type TSDBTeam = {
  idTeam: string;
  strTeam: string;
  strTeamShort: string | null;
  strAlternate: string | null;
  strStadium: string | null;
  strStadiumThumb: string | null;
  strStadiumLocation: string | null;
  intStadiumCapacity: string | null;
  strTeamBadge: string | null;   // logo/escudo PNG
  strTeamBanner: string | null;  // banner HD
  strTeamJersey: string | null;
  strTeamLogo: string | null;    // logo alternativo
  strTeamFanart1: string | null;
  strCountry: string | null;
  strLeague: string | null;
  strDescriptionEN: string | null;
  strDescriptionPT: string | null;
};

export type TSDBEvent = {
  idEvent: string;
  strEvent: string;
  strHomeTeam: string;
  strAwayTeam: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  dateEvent: string;       // "YYYY-MM-DD"
  strTime: string | null;  // "HH:MM:SS"
  strStatus: string | null;
  intRound: string | null;
  strLeague: string | null;
  strSeason: string | null;
  strThumb: string | null;
  strHomeTeamBadge: string | null;
  strAwayTeamBadge: string | null;
};

// ─── Fetch base ───────────────────────────────────────────────────────────────

const BASE = "https://www.thesportsdb.com/api/v1/json/3";

async function tsdbFetch<T>(path: string, revalidate: number): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    next: { revalidate },
  });

  if (!res.ok) {
    throw new Error(`TheSportsDB erro HTTP ${res.status} em ${path}`);
  }

  return (await res.json()) as T;
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

/** Nomes de liga aceitos pelo TheSportsDB para o Brasileirão */
const BSA_LEAGUE = "Brazilian Serie A";

/**
 * Todos os times da Série A com assets visuais.
 * Cache: 7 dias (badges/banners não mudam frequentemente)
 */
export async function getTeams(): Promise<TSDBTeam[]> {
  const data = await tsdbFetch<{ teams: TSDBTeam[] | null }>(
    `/search_all_teams.php?l=${encodeURIComponent(BSA_LEAGUE)}`,
    604800
  );
  return data.teams ?? [];
}

/**
 * Próximos 15 eventos (jogos) da Série A.
 * Cache: 4h
 */
export async function getNextEvents(): Promise<TSDBEvent[]> {
  const data = await tsdbFetch<{ events: TSDBEvent[] | null }>(
    `/eventsnextleague.php?id=4350`, // 4350 = Brazilian Serie A league ID in TheSportsDB
    14400
  );
  return data.events ?? [];
}

/**
 * Últimos 15 resultados da Série A.
 * Cache: 4h
 */
export async function getLastEvents(): Promise<TSDBEvent[]> {
  const data = await tsdbFetch<{ events: TSDBEvent[] | null }>(
    `/eventspastleague.php?id=4350`,
    14400
  );
  return data.events ?? [];
}

/**
 * Busca time por nome (para resolver IDs entre APIs).
 * Cache: 7 dias
 */
export async function searchTeam(name: string): Promise<TSDBTeam | null> {
  const data = await tsdbFetch<{ teams: TSDBTeam[] | null }>(
    `/searchteams.php?t=${encodeURIComponent(name)}`,
    604800
  );
  return data.teams?.[0] ?? null;
}

/**
 * Mapa de assets visuais indexado por nome do time.
 * Usa cache para evitar re-fetch. Função convenience para o dashboard.
 */
export async function getTeamAssetsMap(): Promise<
  Map<string, { badge: string | null; banner: string | null; jersey: string | null }>
> {
  const teams = await getTeams();
  const map = new Map<string, { badge: string | null; banner: string | null; jersey: string | null }>();

  for (const t of teams) {
    // Indexa por nome principal e aliases
    const entry = {
      badge: t.strTeamBadge,
      banner: t.strTeamBanner,
      jersey: t.strTeamJersey,
    };
    map.set(t.strTeam, entry);
    if (t.strAlternate) {
      for (const alt of t.strAlternate.split(", ")) {
        map.set(alt.trim(), entry);
      }
    }
  }

  return map;
}
