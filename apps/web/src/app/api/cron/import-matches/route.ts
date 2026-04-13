/**
 * GET /api/cron/import-matches
 *
 * Cron diário: busca partidas do Brasileirão Série A e Série B no
 * football-data.org e persiste/atualiza na tabela bet_matches.
 *
 * Requer: Authorization: Bearer <CRON_SECRET>
 */

import { NextResponse } from "next/server";
import { importMatches } from "@/lib/bob/bet-importer";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const season = new Date().getFullYear();

  try {
    const results = await importMatches(season);
    return NextResponse.json({ ok: true, season, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/import-matches]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
