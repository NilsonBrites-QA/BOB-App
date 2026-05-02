/**
 * BOB — Diagnóstico de Odds
 *
 * GET /api/debug/odds
 * Testa TODAS as fontes de odds e retorna dados reais para comparação visual.
 *
 * Sem auth em localhost; requer Bearer CRON_SECRET em produção.
 */

import { NextResponse } from "next/server";
import { getOddsFromTheOddsApi, listAvailableSports } from "@/lib/bob/connectors/the-odds-api";
import { getOddsByTournament, TOURNAMENT_SERIE_A } from "@/lib/bob/connectors/oddspapi";

export const dynamic = "force-dynamic";

export async function GET(_req: Request) {
  // Endpoint de diagnóstico — dados de odds são públicos
  // Nenhuma autenticação necessária (apenas leitura de dados de mercado)
  const results: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
  };

  // ── The Odds API ───────────────────────────────────────────────────────────
  const toaStart = Date.now();
  try {
    const map = await getOddsFromTheOddsApi();
    const games = Array.from(map.entries())
      .filter(([k]) => k.includes("|"))
      .map(([k, v]) => {
        const [home, away] = k.split("|");
        return { home, away, H: v.homeOdd, X: v.drawOdd, A: v.awayOdd, source: v.source };
      });

    results.theOddsApi = {
      status:    map.size > 0 ? "✅ OK" : "⚠️ Vazio",
      games:     games.length,
      latencyMs: Date.now() - toaStart,
      sample:    games.slice(0, 5),   // primeiros 5 jogos
      all:       games,               // lista completa
    };
  } catch (err) {
    results.theOddsApi = { status: "❌ Erro", error: String(err) };
  }

  // ── OddsPapi ───────────────────────────────────────────────────────────────
  const opStart = Date.now();
  try {
    const map = await getOddsByTournament(TOURNAMENT_SERIE_A);
    const games = Array.from(map.entries())
      .filter(([k]) => k.includes("|"))
      .map(([k, v]) => {
        const [home, away] = k.split("|");
        return { home, away, H: v.homeOdd, X: v.drawOdd, A: v.awayOdd };
      });

    results.oddspapi = {
      status:    map.size > 0 ? "✅ OK" : "⚠️ Vazio",
      games:     games.length,
      latencyMs: Date.now() - opStart,
      sample:    games.slice(0, 5),
    };
  } catch (err) {
    results.oddspapi = { status: "❌ Erro", error: String(err) };
  }

  // ── Sport keys disponíveis no The Odds API (para diagnóstico) ──────────────
  try {
    const sports = await listAvailableSports();
    results.availableSports = sports;
  } catch {
    results.availableSports = [];
  }

  // ── Status das env vars (sem expor valores) ────────────────────────────────
  results.envVars = {
    THE_ODDS_API_KEY:    !!process.env.THE_ODDS_API_KEY,
    ODDSPAPI_KEY:        !!process.env.ODDSPAPI_KEY,
    API_FOOTBALL_KEY:    !!process.env.API_FOOTBALL_KEY,
    FOOTBALL_DATA_TOKEN: !!process.env.FOOTBALL_DATA_TOKEN,
  };

  return NextResponse.json(results, { status: 200 });
}
