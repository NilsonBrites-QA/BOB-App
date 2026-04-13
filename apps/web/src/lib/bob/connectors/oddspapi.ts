/**
 * BOB — Conector OddsPapi (Odds Reais via Pinnacle)
 *
 * OddsPapi serve como proxy da Pinnacle API (fechada ao público desde Jul/2025).
 * Fornece odds 1X2 reais para o Brasileirão Série A e Série B.
 *
 * Documentação: https://oddspapi.io/pt/docs
 *
 * Mercados:
 *   market 101 = 1X2 moneyline
 *     outcome 101 = Home win  → campo `price`
 *     outcome 102 = Draw      → campo `price`
 *     outcome 103 = Away win  → campo `price`
 *
 * Rate limit: 500ms cooldown obrigatório entre requests.
 * Cache: revalidate 3h (odds pré-jogo mudam lentamente).
 *
 * IDs de torneio:
 *   325 = Brasileiro Serie A
 *   390 = Brasileiro Serie B
 *   373 = Copa do Brasil
 */

const BASE_URL = "https://api.oddspapi.io/v4";

/** Cooldown entre requisições (ms) */
const RATE_LIMIT_MS = 520;

/** ID do torneio para odds */
export const TOURNAMENT_SERIE_A = 325;
export const TOURNAMENT_SERIE_B = 390;
export const TOURNAMENT_COPA_BR = 373;

// ─── Tipos da API ─────────────────────────────────────────────────────────────

type OddsOutcome = {
  id: number;       // 101=home, 102=draw, 103=away
  price: number;    // odds decimal, ex: 1.78
};

type OddsMarket = {
  id: number;     // 101 = 1X2
  outcomes: OddsOutcome[];
};

type OddsFixture = {
  id: number | string;
  homeTeamName?: string;
  awayTeamName?: string;
  startDate?: string;
  markets?: OddsMarket[];
  market?: OddsMarket[];
};

type FixtureOdds = {
  homeOdd:  number;
  drawOdd:  number;
  awayOdd:  number;
  source: "oddspapi";
};

// ─── Odds normalizadas por jogo ───────────────────────────────────────────────

export type OddsMap = Map<string, FixtureOdds>;

// ─── Fetch base ───────────────────────────────────────────────────────────────

let _lastRequest = 0;

async function opFetch<T>(path: string, revalidate = 10800): Promise<T> {
  const key = process.env.ODDSPAPI_KEY;
  if (!key) {
    throw new Error("ODDSPAPI_KEY não configurado. Adicione ao .env.local");
  }

  // Rate limit: aguardar 500ms desde a última requisição
  const now = Date.now();
  const elapsed = now - _lastRequest;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  _lastRequest = Date.now();

  const separator = path.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${path}${separator}apiKey=${key}`;

  const res = await fetch(url, {
    next: { revalidate },
  });

  if (!res.ok) {
    throw new Error(`OddsPapi HTTP ${res.status} em ${path}`);
  }

  return res.json() as Promise<T>;
}

// ─── Parse market 101 (1X2) ──────────────────────────────────────────────────

function parseMarket101(fixture: OddsFixture): FixtureOdds | null {
  const markets = fixture.markets ?? fixture.market ?? [];
  const m101 = markets.find((m) => m.id === 101);
  if (!m101) return null;

  const home = m101.outcomes.find((o) => o.id === 101)?.price ?? 0;
  const draw = m101.outcomes.find((o) => o.id === 102)?.price ?? 0;
  const away = m101.outcomes.find((o) => o.id === 103)?.price ?? 0;

  if (home <= 1 || draw <= 1 || away <= 1) return null; // odds inválidas

  return { homeOdd: home, drawOdd: draw, awayOdd: away, source: "oddspapi" };
}

// ─── Normalizar nome do time para matching ────────────────────────────────────

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // remove acentos
    .replace(/\s+(fc|sc|ec|ca|se|cr|ac|af)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Constrói uma chave de matching por nomes normalizados.
 * Ex: "Flamengo × Palmeiras" → "flamengo|palmeiras"
 */
function matchKey(home: string, away: string): string {
  return `${normalizeName(home)}|${normalizeName(away)}`;
}

// ─── Endpoint: odds por torneio ───────────────────────────────────────────────

/**
 * Busca odds 1X2 de todos os próximos jogos de um torneio.
 * Retorna um Map<"homeNorm|awayNorm", FixtureOdds>
 *
 * Cache: 3h (Next.js revalidate)
 */
export async function getOddsByTournament(
  tournamentId: number,
  bookmaker = "pinnacle"
): Promise<OddsMap> {
  const data = await opFetch<OddsFixture[]>(
    `/odds-by-tournaments?tournamentIds=${tournamentId}&bookmaker=${bookmaker}`,
    10800
  );

  const map: OddsMap = new Map();

  if (!Array.isArray(data)) return map;

  for (const fixture of data) {
    const parsed = parseMarket101(fixture);
    if (!parsed) continue;

    // Indexar por nomes normalizados dos times
    const home = fixture.homeTeamName ?? "";
    const away = fixture.awayTeamName ?? "";
    if (home && away) {
      map.set(matchKey(home, away), parsed);
    }

    // Indexar também por ID (como string) para drill-down
    if (fixture.id) {
      map.set(String(fixture.id), parsed);
    }
  }

  return map;
}

// ─── Endpoint: odds de um fixture específico ─────────────────────────────────

/**
 * Busca odds 1X2 de um fixture individual.
 * Usar para drill-down ou quando o torneio não retornu o fixture.
 *
 * Cache: 3h
 */
export async function getOddsForFixture(fixtureId: string | number): Promise<FixtureOdds | null> {
  try {
    const data = await opFetch<OddsFixture[]>(
      `/odds?fixtureId=${fixtureId}`,
      10800
    );

    if (!Array.isArray(data) || data.length === 0) return null;
    return parseMarket101(data[0]!);
  } catch {
    return null;
  }
}

// ─── Matching: football-data.org → OddsPapi ──────────────────────────────────

/**
 * Encontra odds para um jogo identificado pelos nomes dos times.
 * Tenta correspondência exata e parcial (prefixo de 6 chars).
 */
export function lookupOdds(
  homeTeam: string,
  awayTeam: string,
  oddsMap: OddsMap
): FixtureOdds | null {
  // Tentativa 1: chave exata
  const exactKey = matchKey(homeTeam, awayTeam);
  if (oddsMap.has(exactKey)) return oddsMap.get(exactKey)!;

  // Tentativa 2: busca parcial (nome contém substring)
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
