/**
 * BOB — Cliente HTTP para a API-Football (v3.football.api-sports.io)
 *
 * Estratégia de cache com Next.js fetch:
 *   standings/fixtures  → revalidate 86400 (24h)
 *   team stats          → revalidate 86400 (24h)
 *   H2H                 → revalidate 604800 (7 dias — resultado histórico não muda)
 *   odds                → revalidate 10800 (3h)
 *   injuries            → revalidate 14400 (4h)
 *
 * Budget free: 100 req/dia. Com o cache acima, o uso real fica em ~20-25 req/dia.
 * O header "x-ratelimit-requests-remaining" é logado para monitorar o consumo.
 */

import type {
  AFResponse,
  AFStandingsGroup,
  AFFixtureItem,
  AFTeamStatistics,
  AFInjuryItem,
  AFOddsItem,
} from "./api-football-types";

const BASE_URL = "https://v3.football.api-sports.io";

/** Liga Brasileirão Série A no API-Football */
export const BSA_LEAGUE = 71;

// ─── Fetch base ───────────────────────────────────────────────────────────────

async function afFetch<T>(
  path: string,
  revalidate: number
): Promise<AFResponse<T>> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    throw new Error(
      "API_FOOTBALL_KEY não configurado. Adicione a variável ao .env.local"
    );
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "x-apisports-key": key },
    next: { revalidate },
  });

  const remaining = res.headers.get("x-ratelimit-requests-remaining");
  if (remaining !== null && parseInt(remaining, 10) < 10) {
    console.warn(`[API-Football] Atenção: apenas ${remaining} requisições restantes hoje.`);
  }

  if (!res.ok) {
    throw new Error(
      `API-Football erro HTTP ${res.status} em ${path}. Restantes: ${remaining ?? "?"}`
    );
  }

  const data = (await res.json()) as AFResponse<T>;

  // A API retorna HTTP 200 mesmo em erro — verificar corpo
  if (
    !Array.isArray(data.errors) &&
    Object.keys(data.errors as Record<string, string>).length > 0
  ) {
    throw new Error(
      `API-Football erro de API em ${path}: ${JSON.stringify(data.errors)}`
    );
  }

  return data;
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

/**
 * Tabela de classificação do Brasileirão Série A.
 * Retorna 3 grupos: overall, home, away.
 * Cache: 24h
 */
export async function getStandings(season: number) {
  return afFetch<AFStandingsGroup>(
    `/standings?league=${BSA_LEAGUE}&season=${season}`,
    86400
  );
}

/**
 * Fixtures de uma rodada específica.
 * ex: round=15 → "Regular Season - 15"
 * Cache: 24h
 */
export async function getFixturesByRound(season: number, round: number) {
  const roundStr = encodeURIComponent(`Regular Season - ${round}`);
  return afFetch<AFFixtureItem>(
    `/fixtures?league=${BSA_LEAGUE}&season=${season}&round=${roundStr}`,
    86400
  );
}

/**
 * Fixtures de qualquer liga (para copa paralela).
 * Cache: 4h (pode ter jogos agendados esta semana)
 */
export async function getFixturesByLeague(leagueId: number, season: number) {
  return afFetch<AFFixtureItem>(
    `/fixtures?league=${leagueId}&season=${season}&next=20`,
    14400
  );
}

/**
 * Últimos N jogos de um time (todas as competições).
 * Cache: 24h
 */
export async function getTeamLastFixtures(
  teamId: number,
  season: number,
  last = 5
) {
  return afFetch<AFFixtureItem>(
    `/fixtures?team=${teamId}&league=${BSA_LEAGUE}&season=${season}&last=${last}`,
    86400
  );
}

/**
 * Histórico de confronto direto entre dois times.
 * Cache: 7 dias (resultado histórico é imutável)
 */
export async function getH2H(homeId: number, awayId: number, last = 10) {
  return afFetch<AFFixtureItem>(
    `/fixtures/headtohead?h2h=${homeId}-${awayId}&last=${last}&league=${BSA_LEAGUE}`,
    604800
  );
}

/**
 * Estatísticas de um time na temporada (form, home/away breakdown, gols).
 * Cache: 24h
 */
export async function getTeamStats(teamId: number, season: number) {
  return afFetch<AFTeamStatistics>(
    `/teams/statistics?league=${BSA_LEAGUE}&season=${season}&team=${teamId}`,
    86400
  );
}

/**
 * Lesões e suspensões por data.
 * Retorna todos os desfalques confirmados para jogos na data informada.
 * Cache: 4h
 */
export async function getInjuriesByDate(season: number, date: string) {
  return afFetch<AFInjuryItem>(
    `/injuries?league=${BSA_LEAGUE}&season=${season}&date=${date}`,
    14400
  );
}

/**
 * Odds pré-jogo por fictura.
 * Preferir API-Football bookmaker id=8 (Bet365) quando disponível, senão qualquer.
 * Cache: 3h
 */
export async function getOdds(fixtureId: number) {
  return afFetch<AFOddsItem>(
    `/odds?fixture=${fixtureId}&bookmaker=8`,
    10800
  );
}

/**
 * Detecta o número da rodada atual (próximo jogo agendado no BSA).
 * Retorna null se não houver jogos agendados (entressafra, etc.)
 * Cache: 1h
 */
export async function getCurrentRound(season: number): Promise<number | null> {
  const res = await afFetch<AFFixtureItem>(
    `/fixtures?league=${BSA_LEAGUE}&season=${season}&next=1`,
    3600
  );

  const next = res.response[0];
  if (!next) return null;

  const roundStr = next.league.round; // ex: "Regular Season - 15"
  const match = roundStr.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}
