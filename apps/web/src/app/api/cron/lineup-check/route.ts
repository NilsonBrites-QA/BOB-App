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
import { fetchRoundMatchInputs, getCurrentRound } from "@/lib/bob/connectors";
import { scoreMatch, selectAnchorsFromScored, generateVariations } from "@/lib/bob/engine";
import { saveRound }            from "@/lib/bob/persist";

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
      round = await getCurrentRound();
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
  const { matches: matchInputs, meta } = await fetchRoundMatchInputs(season, round);

  if (matchInputs.length === 0) {
    return NextResponse.json({
      ok:      false,
      message: "Dados indisponíveis.",
      round,
      season,
    });
  }

  // 3. Re-rodar motor com dados frescos
  const scored     = matchInputs.map(scoreMatch);
  const anchors    = selectAnchorsFromScored(scored);
  const anchorIds  = new Set(anchors.map((a) => a.id));
  const pool       = scored.filter((m) => !anchorIds.has(m.id));
  const variationsResult = generateVariations({ anchors, pool });
  
  // Extrair array de variações do resultado (compatibilidade com beam-search)
  const variations = variationsResult.variations || [];

  // 4. Upsert no DB (substitui rascunho T-48h)
  const { roundDbId } = await saveRound({
    season,
    round,
    anchors,
    variations,
    source: meta.source,
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
    anchorCount:   anchors.length,
    timestamp:     now.toISOString(),
  });
}
