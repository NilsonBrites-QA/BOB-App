/**
 * BOB — Cron T-48h: GET /api/cron/pre-round
 *
 * Executado 48h antes do primeiro jogo da rodada (sexta ~12h).
 * Busca dados antecipados, roda o motor e persiste o rascunho da rodada.
 *
 * Pipeline:
 *   1. Detecta rodada atual via getCurrentRound()
 *   2. fetchRoundMatchInputs() — orquestrador multi-API
 *   3. Feature Builder → Match Intelligence → Anchor Score → Beam Search
 *   4. Persiste via saveRound() (idempotente)
 *   5. Revalida cache do dashboard
 *
 * Requer: Authorization: Bearer <CRON_SECRET>
 */

import { NextResponse }        from "next/server";
import { revalidatePath }      from "next/cache";
import { saveRound }            from "@/lib/bob/persist";
import { loadRoundData } from "@/lib/bob/round-loader";
import { getRoundDataset } from "@/lib/data/data-gateway";
import { buildOfficialVariationsPipeline } from "@/lib/bob/analytics/official-variation-pipeline";
import { isRealDataSource } from "@/lib/bob/data/source-policy";

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

  // Permitir override manual de rodada via query param
  const { searchParams } = new URL(request.url);
  const forceRound = searchParams.get("round") ? parseInt(searchParams.get("round")!, 10) : null;

  const roundData = await loadRoundData(season, forceRound);
  const round = roundData.meta?.round ?? forceRound ?? null;

  console.info(`[BOB/pre-round] Processando T-48h · rodada ${round}/${season}`);

  if (!round || !isRealDataSource(roundData.source)) {
    return NextResponse.json({ ok: false, message: "Fonte insuficiente para geração oficial.", round, season, source: roundData.source });
  }

  const dataset = await getRoundDataset(season, round);
  const matchInputs = dataset.data ?? roundData.matches;

  if (matchInputs.length === 0) {
    return NextResponse.json({
      ok:      false,
      message: "Dados de jogos indisponíveis para esta rodada.",
      round,
      season,
    });
  }

  const pipeline = await buildOfficialVariationsPipeline({
    matches: matchInputs,
    source: dataset.ok ? dataset.source : roundData.source,
    round,
    sourceSnapshotIds: [`round:${season}:${round}:${dataset.ok ? dataset.source : roundData.source}`],
  });
  if (!pipeline.ok || !pipeline.variationsResult) {
    return NextResponse.json({ ok: false, message: pipeline.reason ?? "Pipeline oficial bloqueou geração.", round, season });
  }
  const anchors = pipeline.anchors;
  const variations = pipeline.variationsResult.variations;

  // 4. Persistir rascunho (idempotente)
  const { roundDbId } = await saveRound({
    season,
    round,
    anchors,
    variations,
    source: "api",
    officialSnapshot: pipeline.snapshot ?? undefined,
  });

  // 5. Revalidar cache do dashboard
  revalidatePath("/dashboard");

  return NextResponse.json({
    ok:          true,
    phase:       "T-48h",
    season,
    round,
    roundDbId,
    matchCount:  matchInputs.length,
    anchorCount: anchors.length,
    timestamp:   now.toISOString(),
  });
}
