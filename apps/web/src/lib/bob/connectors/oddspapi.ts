/**
 * BOB — Connector OddsPapi v4 (Betano, EstrelaBet, bet365, Betnacional, etc.)
 *
 * OddsPapi agrega bookmakers brasileiros e globais via API unificada.
 * Endpoint principal: GET /v4/odds
 *
 * Bookmakers brasileiros disponíveis:
 *   betano       — patrocinadora oficial do Brasileirão (fonte primária)
 *   betnacional  — bookmaker nacional
 *   betplay      — mercado BR
 *   estrelabet   — mercado BR
 *   bet365       — global, alta liquidez
 *   pinnacle     — sharp market (margem baixa)
 *
 * Documentação: https://oddspapi.io/pt/docs
 *
 * Chave: process.env.ODDSPAPI_KEY
 */

import { fetchJsonWithTimeout } from "@/lib/bob/data/external-guard";

const BASE_URL = "https://api.oddspapi.com/v4";

// ─── Constantes ────────────────────────────────────────────────────────────────

/** sportId=10 = Futebol */
const SOCCER_SPORT_ID = 10;

/**
 * Torneio IDs (tournamentId) para o Brasileirão.
 * tournamentId=325 = Brasileirão Série A
 */
export const TOURNAMENT_SERIE_A = 325;
export const TOURNAMENT_SERIE_B = 390;
export const TOURNAMENT_COPA_BR = 373;

/**
 * Ordem de preferência de bookmakers para o Brasileirão.
 * Betano é a patrocinadora oficial — odds mais relevantes para o mercado BR.
 */
const PREFERRED_BOOKMAKERS = [
  "betano",
  "betnacional",
  "estrelabet",
  "bet365",
  "pinnacle",
];

// ─── Tipos da API (formato real do /v4/odds) ──────────────────────────────────

type ParticipantInfo = {
  name: string;
  id?:  number | string;
};

type OddsParticipants = {
  home: ParticipantInfo;
  away: ParticipantInfo;
};

/**
 * Estrutura de mercado dentro de bookmakerOdds.
 * Para 1X2: market keys podem ser "1x2", "match_winner", "ft_result" etc.
 */
type MarketOutcome = {
  name:  string;   // "Home", "Draw", "Away" (ou "1", "X", "2")
  price: number;   // odds decimal, ex: 2.15
  id?:   number | string;
};

type Market = {
  id?:      number | string;
  name?:    string;
  outcomes?: MarketOutcome[];
  values?:   MarketOutcome[];  // formato alternativo da API
};

type BookmakerOddsEntry = {
  markets?: Record<string, Market | MarketOutcome[]>;
};

type OddsApiFixture = {
  id:              number | string;
  participants:    OddsParticipants;
  startDate?:      string;
  tournamentId?:   number;
  bookmakerOdds?:  Record<string, BookmakerOddsEntry>;
};

type OddsApiResponse = {
  data?:    OddsApiFixture[];
  success?: boolean;
  error?:   string;
};

// ─── Tipos exportados (compatíveis com o pipeline de connectors/index.ts) ─────

export type FixtureOdds = {
  homeOdd:  number;
  drawOdd:  number;
  awayOdd:  number;
  source:   "oddspapi" | "api-football";
};

export type OddsMap = Map<string, FixtureOdds>;

// ─── Normalização de nomes ────────────────────────────────────────────────────

/** Normaliza nomes de times para matching (remove acentos, sufixos de clube) */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+(fc|sc|ec|ca|se|cr|ac|af|fbc)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Chave de matching para o OddsMap */
export function matchKey(home: string, away: string): string {
  return `${normalizeName(home)}|${normalizeName(away)}`;
}

// ─── Parse de mercado 1X2 ─────────────────────────────────────────────────────

/**
 * Extrai odds Home/Draw/Away de uma entrada de bookmaker.
 * Suporta os múltiplos formatos retornados pelo OddsPapi.
 */
function parse1X2(entry: BookmakerOddsEntry): { homeOdd: number; drawOdd: number; awayOdd: number } | null {
  if (!entry.markets) return null;

  // Tentar chaves conhecidas para o mercado 1X2
  const marketKeys = ["1x2", "match_winner", "ft_result", "fulltime_result", "result"];
  let outcomes: MarketOutcome[] | null = null;

  for (const key of marketKeys) {
    const market = entry.markets[key];
    if (!market) continue;

    // Formato array direto
    if (Array.isArray(market)) {
      outcomes = market as MarketOutcome[];
      break;
    }

    // Formato objeto com outcomes ou values
    if (typeof market === "object") {
      const m = market as Market;
      if (Array.isArray(m.outcomes) && m.outcomes.length > 0) {
        outcomes = m.outcomes;
        break;
      }
      if (Array.isArray(m.values) && m.values.length > 0) {
        outcomes = m.values;
        break;
      }
    }
  }

  // Se não encontrou por chave, tentar o primeiro mercado disponível
  if (!outcomes) {
    for (const value of Object.values(entry.markets)) {
      if (Array.isArray(value) && value.length >= 3) {
        outcomes = value as MarketOutcome[];
        break;
      }
      if (typeof value === "object" && !Array.isArray(value)) {
        const m = value as Market;
        const arr = m.outcomes ?? m.values ?? [];
        if (arr.length >= 3) {
          outcomes = arr;
          break;
        }
      }
    }
  }

  if (!outcomes || outcomes.length < 3) return null;

  // Identificar home, draw, away pelos nomes dos outcomes
  const homeLabels = ["home", "1", "home win"];
  const drawLabels = ["draw", "x", "tie"];
  const awayLabels = ["away", "2", "away win"];

  const findOdd = (labels: string[]) =>
    outcomes!.find((o) => {
      const n = (o.name ?? "").toLowerCase().trim();
      return labels.some((l) => n === l || n.startsWith(l));
    })?.price ?? 0;

  const homeOdd = findOdd(homeLabels);
  const drawOdd = findOdd(drawLabels);
  const awayOdd = findOdd(awayLabels);

  // Fallback posicional se o matching por nome falhar (ordem padrão: Home, Draw, Away)
  const homeF  = homeOdd || outcomes[0]?.price || 0;
  const drawF  = drawOdd || outcomes[1]?.price || 0;
  const awayF  = awayOdd || outcomes[2]?.price || 0;

  if (homeF <= 1 || drawF <= 1 || awayF <= 1) return null;

  return { homeOdd: homeF, drawOdd: drawF, awayOdd: awayF };
}

// ─── Lookup de odds no mapa ───────────────────────────────────────────────────

/**
 * Encontra odds para um jogo pelos nomes dos times.
 * Tenta matching exato e depois parcial (substring).
 */
export function lookupOdds(
  homeTeam: string,
  awayTeam: string,
  oddsMap:  OddsMap,
): FixtureOdds | null {
  const exactKey = matchKey(homeTeam, awayTeam);
  if (oddsMap.has(exactKey)) return oddsMap.get(exactKey)!;

  const homeNorm = normalizeName(homeTeam);
  const awayNorm = normalizeName(awayTeam);

  for (const [key, odds] of oddsMap) {
    if (!key.includes("|")) continue; // pular keys de ID numérico
    const [h, a] = key.split("|");
    if (!h || !a) continue;

    const homeMatch = h.includes(homeNorm) || homeNorm.includes(h);
    const awayMatch = a.includes(awayNorm) || awayNorm.includes(a);

    if (homeMatch && awayMatch) return odds;
  }

  return null;
}

// ─── Fetch principal ──────────────────────────────────────────────────────────

/**
 * Busca odds 1X2 do Brasileirão Série A no OddsPapi.
 *
 * Pipeline de bookmakers (em ordem de preferência):
 *   1. Betano  — patrocinadora oficial, odds relevantes para o mercado BR
 *   2. Betnacional — bookmaker nacional
 *   3. EstrelaBet — mercado BR
 *   4. Bet365  — global, alta liquidez
 *   5. Pinnacle — sharp, sem margem (referência)
 *
 * Retorna OddsMap com chave "homeNorm|awayNorm" e também por ID do fixture.
 */
export async function getOddsByTournament(
  tournamentId: number = TOURNAMENT_SERIE_A,
): Promise<OddsMap> {
  const map: OddsMap = new Map();
  const key = process.env.ODDSPAPI_KEY;

  if (!key) {
    console.warn("[OddsPapi] ODDSPAPI_KEY não configurado. Pulando.");
    return map;
  }

  // Tentar cada bookmaker em ordem de preferência
  for (const bookmaker of PREFERRED_BOOKMAKERS) {
    try {
      const url = `${BASE_URL}/odds?apiKey=${key}&bookmakers=${bookmaker}&sportId=${SOCCER_SPORT_ID}`;

      const json = await fetchJsonWithTimeout<OddsApiResponse>({
        url,
        init: { next: { revalidate: 10800 } },
        timeoutMs: 8_000,
        providerKey: `oddspapi:${bookmaker}`,
        cacheKey: `ODDSPAPI-${tournamentId}-${bookmaker}`,
      });
      const fixtures = json.data ?? [];

      if (!Array.isArray(fixtures) || fixtures.length === 0) {
        console.warn(`[OddsPapi/${bookmaker}] Resposta vazia`);
        continue;
      }

      // Filtrar pelo torneio (Brasileirão = 325) se disponível
      const brazilFixtures = fixtures.filter((f) =>
        !f.tournamentId || f.tournamentId === tournamentId
      );

      let count = 0;
      for (const fixture of brazilFixtures) {
        const bookmakerData = fixture.bookmakerOdds?.[bookmaker];
        if (!bookmakerData) continue;

        const parsed = parse1X2(bookmakerData);
        if (!parsed) continue;

        const home = fixture.participants.home.name;
        const away = fixture.participants.away.name;
        if (!home || !away) continue;

        const odds: FixtureOdds = { ...parsed, source: "oddspapi" };

        // Indexar por nomes normalizados
        map.set(matchKey(home, away), odds);

        // Indexar por ID para drill-down
        if (fixture.id) map.set(String(fixture.id), odds);

        count++;
      }

      if (count > 0) {
        console.info(`[OddsPapi/${bookmaker}] ${count} jogos com odds`);
        return map; // Primeira fonte com dados → retorna
      }

      console.info(`[OddsPapi/${bookmaker}] Sem jogos do Brasileirão — tentando próximo`);

    } catch (err) {
      console.warn(`[OddsPapi/${bookmaker}] Erro:`, err);
      // Continua para o próximo bookmaker
    }
  }

  console.warn("[OddsPapi] Nenhum bookmaker retornou dados. Retornando insufficient sem fallback sintético.");
  return map;
}
