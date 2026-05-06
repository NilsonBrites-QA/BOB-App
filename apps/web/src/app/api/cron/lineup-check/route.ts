/**
 * BOB — Cron T-1h: GET /api/cron/lineup-check
 *
 * Executado ~1h antes do primeiro jogo da rodada.
 * Re-busca dados frescos e regenera variações com dados atualizados.
 *
 * Pipeline:
 *   1. Detecta rodada atual
 *   2. fetchRoundMatchInputs() — dados atualizados
 *   3. Re-roda motor + persiste
 *   4. Revalida cache do dashboard
 *
 * Requer: Authorization: Bearer <CRON_SECRET>
 */

import { NextResponse }   from "next/server";
import { revalidatePath } from "next/cache";
import { getGatewayCurrentRound, getGatewayRoundDataset } from "@/lib/data/sports-data-gateway";
import { saveRound }            from "@/lib/bob/persist";
import { buildOfficialVariationsPipeline } from "@/lib/bob/analytics/official-variation-pipeline";

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  // Autenticação
  const authHeader = request.headers.get("Authorization");
  const secret     = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now    = new Date();
  const season = now.getFullYear();

  const { searchParams } = new URL(request.url);
  const forceRound = searchParams.get("round") ? parseInt(searchParams.get("round")!, 10) : null;

  // 1. Detectar rodada atual
  let round = forceRound;
  if (!round) {
    try {
      round = await getGatewayCurrentRound();
    } catch (err) {
      console.error("[BOB/lineup-check] Falha ao detectar rodada:", err);
    }
  }

  if (!round) {
    return NextResponse.json({
      ok:      false,
      message: "Sem rodada detectada — entressafra ou FOOTBALL_DATA_TOKEN ausente.",
    });
  }

  console.info(`[BOB/lineup-check] Verificação T-1h · rodada ${round}/${season}`);

  // 2. Buscar dados frescos via orquestrador
  const dataset = await getGatewayRoundDataset(season, round);
  const matchInputs = dataset?.matches ?? [];

  if (matchInputs.length === 0) {
    return NextResponse.json({
      ok:      false,
      message: "Dados indisponíveis.",
      round,
      season,
    });
  }

  // 3. Re-rodar motor oficial com dados frescos
  const pipeline = await buildOfficialVariationsPipeline({
    matches: matchInputs,
    source: "api",
    round,
    sourceSnapshotIds: [`lineup-check:${season}:${round}:gateway`],
  });
  if (!pipeline.ok || !pipeline.variationsResult) {
    return NextResponse.json({ ok: false, message: pipeline.reason ?? "Pipeline oficial bloqueou geração.", status: pipeline.status, round, season });
  }

  // 4. Upsert no DB (substitui rascunho T-48h)
  const { roundDbId } = await saveRound({
    season,
    round,
    anchors: pipeline.anchors,
    variations: pipeline.variationsResult.variations,
    source: "api",
    officialSnapshot: pipeline.snapshot ?? undefined,
  });

  // 5. Revalidar dashboard
  revalidatePath("/dashboard");

  return NextResponse.json({
    ok:            true,
    phase:         "T-1h",
    season,
    round,
    roundDbId,
    matchCount:    matchInputs.length,
    anchorCount:   pipeline.anchors.length,
    timestamp:     now.toISOString(),
  });
}
