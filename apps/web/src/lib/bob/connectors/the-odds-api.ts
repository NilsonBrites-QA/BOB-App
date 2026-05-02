/**
 * BOB — Conector The Odds API (theoddsapi.com)
 *
 * A fonte mais confiável de odds reais para o mercado brasileiro.
 * Agrega Bet365, Pinnacle, Betano, Betfair e mais de 80 bookmakers.
 *
 * Free tier: 500 requests/mês → ~2 req/dia → suficiente para atualização semanal.
 * Cache ISR: 3h (odds pré-jogo mudam lentamente).
 *
 * Documentação: https://the-odds-api.com/lando-odds-api/odds-api-documentation.html
 *
 * Liga: soccer_brazil_campeonato
 * Mercado: h2h (1X2 moneyline)
 * Região: eu (odds decimais europeias)
 */

import type { OddsMap, FixtureOdds } from "./oddspapi";
import { matchKey } from "./oddspapi";

const BASE_URL = "https://api.the-odds-api.com/v4";

/**
 * ID do esporte no The Odds API para o Brasileirão Série A.
 * Verificado em: https://api.the-odds-api.com/v4/sports/?apiKey=...
 */
const SPORT_KEY = "soccer_brazil_campeonato";

// ─── Tipos da API ─────────────────────────────────────────────────────────────

type TheOddsOutcome = {
  name:  string;  // ex: "Flamengo", "Draw", "Palmeiras"
  price: number;  // odds decimal, ex: 2.15
};

type TheOddsBookmaker = {
  key:       string;  // ex: "bet365", "pinnacle"
  title:     string;
  markets:   TheOddsMarket[];
};

type TheOddsMarket = {
  key:      string;  // "h2h" para 1X2
  outcomes: TheOddsOutcome[];
};

type TheOddsEvent = {
  id:            string;
  home_team:     string;
  away_team:     string;
  commence_time: string;  // ISO 8601
  bookmakers:    TheOddsBookmaker[];
};

// ─── Preferência de bookmakers (em ordem de confiança para Brasileirão) ─────

const PREFERRED_BOOKMAKERS = [
  "pinnacle",
  "bet365",
  "betano_br",
  "betfair",
  "unibet",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extrai as odds 1X2 de um evento priorizando o bookmaker mais confiável.
 * Se Pinnacle não disponível, usa bet365, etc.
 */
function extractBestOdds(event: TheOddsEvent): FixtureOdds | null {
  const h2hBookmakers = event.bookmakers.filter((b) =>
    b.markets.some((m) => m.key === "h2h")
  );

  if (h2hBookmakers.length === 0) return null;

  // Tentar preferred bookmakers em ordem
  for (const preferred of PREFERRED_BOOKMAKERS) {
    const bk = h2hBookmakers.find((b) => b.key === preferred);
    if (!bk) continue;

    const market = bk.markets.find((m) => m.key === "h2h");
    if (!market) continue;

    const parsed = parseH2H(market, event.home_team, event.away_team);
    if (parsed) return { ...parsed, source: "api-football" };
  }

  // Fallback: primeiro disponível
  const bk = h2hBookmakers[0]!;
  const market = bk.markets.find((m) => m.key === "h2h");
  if (!market) return null;

  const parsed = parseH2H(market, event.home_team, event.away_team);
  if (!parsed) return null;
  return { ...parsed, source: "api-football" };
}

/**
 * Parseia o mercado h2h extraindo Home, Draw, Away pelas posições relativas.
 * The Odds API retorna 3 outcomes: [homeTeam, awayTeam, "Draw"] em qualquer ordem.
 */
function parseH2H(
  market: TheOddsMarket,
  homeTeam: string,
  awayTeam: string,
): { homeOdd: number; drawOdd: number; awayOdd: number } | null {
  const draw = market.outcomes.find(
    (o) => o.name.toLowerCase() === "draw"
  );
  const home = market.outcomes.find(
    (o) => normalizeTOA(o.name) === normalizeTOA(homeTeam)
  );
  const away = market.outcomes.find(
    (o) => normalizeTOA(o.name) === normalizeTOA(awayTeam)
  );

  // Se não achou pelo nome exato, tenta parcial
  const homeFallback = !home
    ? market.outcomes.find((o) =>
        o.name !== "Draw" &&
        (normalizeTOA(o.name).includes(normalizeTOA(homeTeam)) ||
          normalizeTOA(homeTeam).includes(normalizeTOA(o.name)))
      )
    : null;

  const awayFallback = !away
    ? market.outcomes.find((o) =>
        o.name !== "Draw" &&
        o !== home &&
        o !== homeFallback
      )
    : null;

  const finalHome  = home  ?? homeFallback;
  const finalAway  = away  ?? awayFallback;

  if (!finalHome || !finalAway || !draw) return null;
  if (finalHome.price <= 1 || finalAway.price <= 1 || draw.price <= 1) return null;

  return {
    homeOdd: finalHome.price,
    drawOdd: draw.price,
    awayOdd: finalAway.price,
  };
}

/** Normalização para matching de nomes (TheOddsAPI usa nomes ligeiramente diferentes) */
function normalizeTOA(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+(fc|sc|ec|ca|se|cr|ac|af|rj|sp|mg|pr|rs|ba|ce|pe|go|pa|df|sc)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── API Principal ────────────────────────────────────────────────────────────

/**
 * Busca odds 1X2 do Brasileirão Série A no The Odds API.
 *
 * Retorna um OddsMap com chave "homeNorm|awayNorm" compatível com o lookup
 * do connectors/index.ts (mesma estrutura do OddsPapi).
 *
 * Headers de uso são logados para monitorar a quota free (500/mês).
 */
export async function getOddsFromTheOddsApi(): Promise<OddsMap> {
  const map: OddsMap = new Map();
  const key = process.env.THE_ODDS_API_KEY;

  if (!key) {
    console.warn("[TheOddsAPI] THE_ODDS_API_KEY não configurado. Pulando.");
    return map;
  }

  try {
    const url = `${BASE_URL}/sports/${SPORT_KEY}/odds?apiKey=${key}&regions=eu&markets=h2h&oddsFormat=decimal&bookmakers=${PREFERRED_BOOKMAKERS.join(",")}`;

    const res = await fetch(url, {
      next: { revalidate: 10800 }, // cache ISR 3h
    });

    // Logar consumo da quota free
    const remaining  = res.headers.get("x-requests-remaining");
    const used       = res.headers.get("x-requests-used");
    const lastUpdate = res.headers.get("x-requests-last");
    console.info(
      `[TheOddsAPI] Quota: ${used} usadas · ${remaining} restantes · última: ${lastUpdate}`
    );

    if (!res.ok) {
      console.warn(`[TheOddsAPI] HTTP ${res.status}`);
      return map;
    }

    const events = (await res.json()) as TheOddsEvent[];

    if (!Array.isArray(events)) {
      console.warn("[TheOddsAPI] Resposta inesperada (não é array)");
      return map;
    }

    for (const event of events) {
      const odds = extractBestOdds(event);
      if (!odds) continue;

      // Indexar por nome normalizado (mesmo formato do OddsPapi)
      const key = matchKey(event.home_team, event.away_team);
      map.set(key, odds);

      // Indexar também pelo ID do evento (para drill-down futuro)
      map.set(event.id, odds);
    }

    console.info(`[TheOddsAPI] ${map.size / 2} jogos com odds carregados`);
  } catch (err) {
    console.warn("[TheOddsAPI] Falha ao buscar odds:", err);
  }

  return map;
}
