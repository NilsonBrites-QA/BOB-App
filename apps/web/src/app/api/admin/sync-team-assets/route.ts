/**
 * POST /api/admin/sync-team-assets
 *
 * Força re-sincronização de todos os times da Série A com o TheSportsDB.
 * Usa `syncAllTeams()` (upsert idempotente) — seguro executar múltiplas vezes.
 *
 * Pós-condição: tabela team_assets terá badge_url = strTeamBadge (escudo real).
 *
 * Requer: header Authorization: Bearer <CRON_SECRET>
 */

import { NextResponse } from "next/server";
import { syncAllTeams } from "@/lib/bob/connectors/thesportsdb";
import { revalidateTag } from "next/cache";

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncAllTeams();

    revalidateTag("team-assets");
    revalidateTag("round-data");

    return NextResponse.json({
      ok: true,
      synced: result.synced,
      skipped: result.skipped,
      failed: result.failed,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[sync-team-assets]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
