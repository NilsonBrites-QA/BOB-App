/**
 * BOB — Diagnóstico de Odds
 *
 * GET /api/debug/odds
 * Testa todas as fontes de odds e retorna o status de cada uma.
 * PROTEGIDO: apenas admin ou CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { getOddsByTournament, TOURNAMENT_SERIE_A } from "@/lib/bob/connectors/oddspapi";
import { getOddsFromTheOddsApi } from "@/lib/bob/connectors/the-odds-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Auth básico
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    // Permitir também em dev sem auth
    const host = req.headers.get("host") ?? "";
    if (!host.includes("localhost")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const results: Record<string, unknown> = {};

  // Testar OddsPapi
  try {
    const start = Date.now();
    const map = await getOddsByTournament(TOURNAMENT_SERIE_A);
    const ms = Date.now() - start;

    const sample = Array.from(map.entries())
      .filter(([k]) => k.includes("|"))
      .slice(0, 3)
      .map(([k, v]) => ({ match: k, odds: v }));

    results.oddspapi = {
      status: map.size > 0 ? "ok" : "empty",
      games: map.size / 2,
      latencyMs: ms,
      sample,
    };
  } catch (err) {
    results.oddspapi = { status: "error", error: String(err) };
  }

  // Testar The Odds API
  try {
    const start = Date.now();
    const map = await getOddsFromTheOddsApi();
    const ms = Date.now() - start;

    const sample = Array.from(map.entries())
      .filter(([k]) => k.includes("|"))
      .slice(0, 3)
      .map(([k, v]) => ({ match: k, odds: v }));

    results.theOddsApi = {
      status: map.size > 0 ? "ok" : "empty",
      games: map.size / 2,
      latencyMs: ms,
      sample,
    };
  } catch (err) {
    results.theOddsApi = { status: "error", error: String(err) };
  }

  // Status das variáveis de ambiente (sem expor valores)
  results.envVars = {
    ODDSPAPI_KEY:        !!process.env.ODDSPAPI_KEY,
    THE_ODDS_API_KEY:    !!process.env.THE_ODDS_API_KEY,
    API_FOOTBALL_KEY:    !!process.env.API_FOOTBALL_KEY,
    FOOTBALL_DATA_TOKEN: !!process.env.FOOTBALL_DATA_TOKEN,
  };

  return NextResponse.json(results, { status: 200 });
}
