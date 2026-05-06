/**
 * BOB — Diagnóstico de Odds
 *
 * GET /api/debug/odds
 * Testa TODAS as fontes de odds e retorna dados reais para comparação visual.
 *
 * Sem auth em localhost; requer Bearer CRON_SECRET em produção.
 */

import { NextResponse } from "next/server";
import { getGatewayOddsDiagnostics } from "@/lib/data/sports-data-gateway";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = await getGatewayOddsDiagnostics();

  // ── Status das env vars (sem expor valores) ────────────────────────────────
  results.envVars = {
    THE_ODDS_API_KEY:    !!process.env.THE_ODDS_API_KEY,
    ODDSPAPI_KEY:        !!process.env.ODDSPAPI_KEY,
    API_FOOTBALL_KEY:    !!process.env.API_FOOTBALL_KEY,
    FOOTBALL_DATA_TOKEN: !!process.env.FOOTBALL_DATA_TOKEN,
  };

  return NextResponse.json(results, { status: 200 });
}
