/**
 * BOB — Conector The Odds API (theoddsapi.com)
 *
 * FONTE PRIMÁRIA de odds reais do Brasileirão Série A.
 *
 * Vantagens sobre OddsPapi:
 *   ✓ Endpoint dedicado ao esporte (sem filtro de torneio complexo)
 *   ✓ Suporta casas brasileiras: betano_br, estrelabet, bet365, pinnacle
 *   ✓ 500 créditos/mês gratuitos → ~2 chamadas/dia
 *   ✓ Formato limpo e documentado
 *
 * Chave: process.env.THE_ODDS_API_KEY
 * Documentação: https://the-odds-api.com/lando-odds-api/odds-api-documentation.html
 *
 * Sport key: soccer_brazil_campeonato = Brasileirão Série A
 * Mercado: h2h = 1X2
 * Região: eu = odds decimais (padrão europeu/brasil)
 */

import type { OddsMap, FixtureOdds } from "./oddspapi";
import { matchKey } from "./oddspapi";

const BASE_URL = "https://api.the-odds-api.com/v4";

/**
 * Sport key do Brasileirão Série A no The Odds API.
 * Verificado em: https://api.the-odds-api.com/v4/sports/?apiKey=KEY
 */
const SPORT_KEY = "soccer_brazil_campeonato";

// ─── Tipos da API ─────────────────────────────────────────────────────────────

type TheOddsOutcome = {
  name:  string;  // "Flamengo", "Draw", "Palmeiras"
  price: number;  // odds decimal: 2.15
};

type TheOddsMarket = {
  key:      string;      // "h2h"
  outcomes: TheOddsOutcome[];
};

type TheOddsBookmaker = {
  key:     string;       // "bet365", "pinnacle", "betano_br"
  title:   string;
  markets: TheOddsMarket[];
};

type TheOddsEvent = {
  id:            string;
  home_team:     string;
  away_team:     string;
  commence_time: string; // ISO 8601
  bookmakers:    TheOddsBookmaker[];
};

// ─── Preferência de bookmakers ────────────────────────────────────────────────

/**
 * Ordem de preferência — Betano é a patrocinadora oficial do Brasileirão,
 * então suas odds são as mais relevantes para o usuário brasileiro.
 * Pinnacle é o sharp book (sem margem) — referência de mercado.
 */
const PREFERRED_BOOKMAKERS = [
  "betano_br",
  "pinnacle",
  "bet365",
  "unibet",
  "williamhill",
];

// ─── Normalização de nomes ────────────────────────────────────────────────────

function normalizeTOA(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // remove acentos
    .replace(/\s+(fc|sc|ec|ca|se|cr|ac|af|fbc|rj|sp|mg|pr|rs|ba|ce|pe|go|pa|df)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Parse de odds h2h ────────────────────────────────────────────────────────

function extractOddsFromBookmaker(
  bookmaker: TheOddsBookmaker,
  homeTeam:  string,
  awayTeam:  string,
): { homeOdd: number; drawOdd: number; awayOdd: number } | null {
  const h2hMarket = bookmaker.markets.find((m) => m.key === "h2h");
  if (!h2hMarket || h2hMarket.outcomes.length < 3) return null;

  const homeN = normalizeTOA(homeTeam);
  const awayN = normalizeTOA(awayTeam);

  // Identificar cada outcome pelo nome
  const draw    = h2hMarket.outcomes.find((o) => o.name.toLowerCase() === "draw");
  const homeOut = h2hMarket.outcomes.find((o) => {
    const n = normalizeTOA(o.name);
    return n === homeN || homeN.includes(n) || n.includes(homeN);
  });
  const awayOut = h2hMarket.outcomes.find((o) => {
    const n = normalizeTOA(o.name);
    return o !== homeOut && (n === awayN || awayN.includes(n) || n.includes(awayN));
  });

  // Fallback posicional: The Odds API retorna [home, away, draw] ou [home, draw, away]
  // Ordem mais comum: outcome[0]=home, outcome[1]=away, outcome[2]=draw
  const finalHome  = homeOut ?? h2hMarket.outcomes.find((o) => o.name !== "Draw" && o !== awayOut);
  const finalAway  = awayOut ?? h2hMarket.outcomes.find((o) => o !== finalHome && o.name !== "Draw");
  const finalDraw  = draw    ?? h2hMarket.outcomes.find((o) => o !== finalHome && o !== finalAway);

  if (!finalHome || !finalAway || !finalDraw) return null;
  if (finalHome.price <= 1 || finalAway.price <= 1 || finalDraw.price <= 1) return null;

  return {
    homeOdd: finalHome.price,
    drawOdd: finalDraw.price,
    awayOdd: finalAway.price,
  };
}

function getBestOdds(
  event: TheOddsEvent,
): { homeOdd: number; drawOdd: number; awayOdd: number } | null {
  // Tentar bookmakers em ordem de preferência
  for (const preferred of PREFERRED_BOOKMAKERS) {
    const bk = event.bookmakers.find((b) => b.key === preferred);
    if (!bk) continue;
    const odds = extractOddsFromBookmaker(bk, event.home_team, event.away_team);
    if (odds) return odds;
  }
  // Fallback: primeiro bookmaker disponível
  for (const bk of event.bookmakers) {
    const odds = extractOddsFromBookmaker(bk, event.home_team, event.away_team);
    if (odds) return odds;
  }
  return null;
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Busca odds 1X2 do Brasileirão Série A no The Odds API.
 *
 * Uma única chamada busca todos os jogos com odds de múltiplas casas.
 * Consome ~1 crédito de API (de 500/mês gratuitos).
 *
 * Retorna OddsMap compatível com o lookupOdds() do connectors/index.ts.
 */
export async function getOddsFromTheOddsApi(): Promise<OddsMap> {
  const map: OddsMap = new Map();
  const apiKey = process.env.THE_ODDS_API_KEY;

  if (!apiKey) {
    console.warn("[TheOddsAPI] THE_ODDS_API_KEY não configurado.");
    return map;
  }

  try {
    // Buscar os bookmakers preferidos num único request
    // regions=eu → odds decimais (padrão Brasil)
    const bookmakersParam = PREFERRED_BOOKMAKERS.join(",");
    const url = `${BASE_URL}/sports/${SPORT_KEY}/odds/?apiKey=${apiKey}&regions=eu&markets=h2h&oddsFormat=decimal&bookmakers=${bookmakersParam}`;

    const res = await fetch(url, {
      next: { revalidate: 10800 }, // cache 3h (odds pré-jogo não mudam muito)
    });

    // ── Log da quota (500/mês gratuitos) ──────────────────────────────────
    const remaining  = res.headers.get("x-requests-remaining") ?? "?";
    const used       = res.headers.get("x-requests-used") ?? "?";
    console.info(`[TheOddsAPI] Créditos: ${used} usados, ${remaining} restantes`);

    if (res.status === 401) {
      console.error("[TheOddsAPI] Chave inválida ou não autorizada.");
      return map;
    }

    if (res.status === 429) {
      console.warn("[TheOddsAPI] Quota atingida (500/mês). Usando fallback.");
      return map;
    }

    if (!res.ok) {
      console.warn(`[TheOddsAPI] HTTP ${res.status}`);
      return map;
    }

    const events = (await res.json()) as TheOddsEvent[];

    if (!Array.isArray(events)) {
      console.warn("[TheOddsAPI] Resposta inesperada (não é array)");
      return map;
    }

    if (events.length === 0) {
      console.info("[TheOddsAPI] Nenhum evento retornado — fora de temporada ou sem jogos próximos.");
      return map;
    }

    let count = 0;
    for (const event of events) {
      const odds = getBestOdds(event);
      if (!odds) continue;

      const fixture: FixtureOdds = { ...odds, source: "oddspapi" };

      // Indexar por nomes normalizados (para lookup pelo nome do time)
      const key = matchKey(event.home_team, event.away_team);
      map.set(key, fixture);

      // Indexar também pelo ID do evento (para debug)
      map.set(event.id, fixture);

      count++;

      // Log detalhado para os primeiros 3 jogos (diagnóstico)
      if (count <= 3) {
        console.info(
          `[TheOddsAPI] ${event.home_team} x ${event.away_team}: ` +
          `H=${odds.homeOdd} X=${odds.drawOdd} A=${odds.awayOdd}`
        );
      }
    }

    console.info(`[TheOddsAPI] ✓ ${count} jogos com odds reais carregados`);

  } catch (err) {
    console.error("[TheOddsAPI] Falha:", err);
  }

  return map;
}

/**
 * Lista os esportes disponíveis no The Odds API (diagnóstico).
 * Use para confirmar o sport_key do Brasileirão.
 */
export async function listAvailableSports(): Promise<Array<{ key: string; title: string; active: boolean }>> {
  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch(`${BASE_URL}/sports/?apiKey=${apiKey}`);
    if (!res.ok) return [];
    const data = await res.json() as Array<{ key: string; title: string; active: boolean }>;
    return data.filter((s) => s.key.includes("brazil") || s.title.toLowerCase().includes("brazil"));
  } catch {
    return [];
  }
}
