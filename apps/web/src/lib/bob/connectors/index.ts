/**
 * BOB — Orquestrador do pipeline de dados
 *
 * Ponto de entrada único para buscar e normalizar todos os dados de uma rodada.
 * Executa as chamadas em paralelo (Promise.all) onde possível para minimizar
 * latência, e em série onde há dependência (ex: precisamos dos IDs dos fixtures
 * da rodada antes de buscar H2H e odds).
 *
 * Budget API-Football (100 req/dia):
 *   - standings:          1 req / 24h
 *   - fixtures da rodada: 1 req / 24h
 *   - últimos 10 jogos:  ~2× times únicos / 24h (home + away, sem sobreposição)
 *   - H2H:                1 req por par / 7 dias
 *   - injuries:           1 req por data / 4h
 *   - odds:               1 req por fixture / 3h
 *
 * Total típico: 20–30 req/dia. Bem dentro do limite free.
 */

import {
  getStandings,
  getFixturesByRound,
  getTeamLastFixtures,
  getH2H,
  getInjuriesByDate,
  getOdds,
} from "./api-football";

import { normalizeMatchInputs } from "./normalize";

import type { AFFixtureItem, AFInjuryItem, AFOddsItem } from "./api-football-types";
import type { MatchInput } from "@/lib/bob/engine/scoring";

// ─── Tipos exportados ─────────────────────────────────────────────────────────

export type FetchRoundResult = {
  matches: MatchInput[];
  meta: {
    season: number;
    round: number;
    fixtureCount: number;
    generatedAt: string;
    /** IDs dos times sem standings na API (dados incompletos de temporada nova) */
    missingStandings: number[];
  };
};

// ─── Helpers internos ─────────────────────────────────────────────────────────

/** Extrai datas únicas (YYYY-MM-DD) de uma lista de fixtures */
function uniqueDates(fixtures: AFFixtureItem[]): string[] {
  const dates = new Set<string>();
  for (const f of fixtures) {
    const date = f.fixture.date.split("T")[0];
    if (date) dates.add(date);
  }
  return Array.from(dates);
}

/** Extrai IDs de times únicos de uma lista de fixtures (home + away sem repetição) */
function uniqueTeamIds(fixtures: AFFixtureItem[]): number[] {
  const ids = new Set<number>();
  for (const f of fixtures) {
    ids.add(f.teams.home.id);
    ids.add(f.teams.away.id);
  }
  return Array.from(ids);
}

// ─── Pipeline principal ───────────────────────────────────────────────────────

/**
 * Busca todos os dados necessários para uma rodada e retorna MatchInput[]
 * normalizado e pronto para o motor de scoring.
 *
 * @param season - Ano da temporada (ex: 2026)
 * @param round  - Número da rodada (ex: 15)
 */
export async function fetchRoundMatchInputs(
  season: number,
  round: number
): Promise<FetchRoundResult> {
  // ── Etapa 1: dados independentes em paralelo ──────────────────────────────
  const [standingsRes, fixturesRes] = await Promise.all([
    getStandings(season),
    getFixturesByRound(season, round),
  ]);

  const roundFixtures = fixturesRes.response;

  if (roundFixtures.length === 0) {
    return {
      matches: [],
      meta: {
        season,
        round,
        fixtureCount: 0,
        generatedAt: new Date().toISOString(),
        missingStandings: [],
      },
    };
  }

  // standings: a resposta tem 3 grupos (overall, home, away) — usar overall (index 0)
  const standingsData = standingsRes.response[0];
  const standings = standingsData?.league?.standings?.[0] ?? [];

  // IDs de times e datas da rodada
  const teamIds = uniqueTeamIds(roundFixtures);
  const matchDates = uniqueDates(roundFixtures);

  // ── Etapa 2: dados dependentes dos fixtures (em paralelo entre si) ─────────
  const [teamLastFixturesArr, h2hArr, injuriesArr, oddsArr] = await Promise.all([
    // Últimos 10 jogos de cada time (fase 10: janela estendida para momentum)
    // cacheados 24h — dentro do budget de 100 req/dia
    Promise.all(
      teamIds.map((id) =>
        getTeamLastFixtures(id, season, 10).then((r) => ({ id, fixtures: r.response }))
      )
    ),

    // H2H por par de times (10 chamadas cacheadas 7 dias)
    Promise.all(
      roundFixtures.map((f) =>
        getH2H(f.teams.home.id, f.teams.away.id, 10).then((r) => ({
          key: `${f.teams.home.id}-${f.teams.away.id}`,
          fixtures: r.response,
        }))
      )
    ),

    // Injuries por data (1 chamada por data da rodada, cacheada 4h)
    Promise.all(matchDates.map((date) => getInjuriesByDate(season, date))).then(
      (results) =>
        results.flatMap((r): AFInjuryItem[] => r.response)
    ),

    // Odds por fixture (1 chamada por fixture, cacheada 3h)
    Promise.all(
      roundFixtures.map((f) =>
        getOdds(f.fixture.id)
          .then((r) => ({ id: f.fixture.id, data: r.response[0] as AFOddsItem | undefined }))
          .catch(() => ({ id: f.fixture.id, data: undefined as AFOddsItem | undefined }))
      )
    ),
  ]);

  // ── Indexar resultados ─────────────────────────────────────────────────────

  const teamLastFixtures: Record<number, AFFixtureItem[]> = {};
  for (const { id, fixtures } of teamLastFixturesArr) {
    teamLastFixtures[id] = fixtures;
  }

  const h2hByKey: Record<string, AFFixtureItem[]> = {};
  for (const { key, fixtures } of h2hArr) {
    h2hByKey[key] = fixtures;
  }

  // Não temos teamStats em v1 (poupa quota) — o normalize.ts usa teamLastFixtures
  const teamStats = {};

  const oddsMap: Record<number, AFOddsItem> = {};
  for (const { id, data } of oddsArr) {
    if (data) oddsMap[id] = data;
  }

  // Verificar times sem standings (início de temporada / nova temporada)
  const missingStandings = teamIds.filter(
    (id) => !standings.some((s) => s.team.id === id)
  );

  // ── Normalização ───────────────────────────────────────────────────────────

  const matches = normalizeMatchInputs(
    {
      roundFixtures,
      standings,
      teamLastFixtures,
      h2hByKey,
      teamStats,
      injuries: injuriesArr,
      oddsMap,
    },
    round
  );

  return {
    matches,
    meta: {
      season,
      round,
      fixtureCount: roundFixtures.length,
      generatedAt: new Date().toISOString(),
      missingStandings,
    },
  };
}
