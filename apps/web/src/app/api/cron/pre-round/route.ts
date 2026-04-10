/**
 * BOB — Cron T-48h: GET /api/cron/pre-round
 *
 * Executado 48h antes do primeiro jogo da rodada (sexta ~12h).
 * Busca dados antecipados, roda o motor e persiste o rascunho da rodada.
 *
 * Pipeline:
 *   1. Detecta rodada atual via getCurrentRound()
 *   2. fetchRoundMatchInputs() — orquestrador multi-API
 *   3. scoreMatch() → selectAnchors() → generateVariations()
 *   4. Persiste via saveRound() (idempotente)
 *   5. Revalida cache do dashboard
 *
 * Requer: Authorization: Bearer <CRON_SECRET>
 */

import { NextResponse }        from "next/server";
import { revalidatePath }      from "next/cache";
import { fetchRoundMatchInputs, getCurrentRound } from "@/lib/bob/connectors";
import { scoreMatch, selectAnchors, generateVariations } from "@/lib/bob/engine";
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

  // Permitir override manual de rodada via query param
  const { searchParams } = new URL(request.url);
  const forceRound = searchParams.get("round") ? parseInt(searchParams.get("round")!, 10) : null;

  // 1. Detectar rodada atual (ou usar override)
  let round: number | null = forceRound;
  if (!round) {
    try {
      round = await getCurrentRound();
    } catch (err) {
      console.error("[BOB/pre-round] Falha ao detectar rodada:", err);
    }
  }

  if (!round) {
    return NextResponse.json({
      ok:      false,
      message: "Sem rodada detectada — possível entressafra ou FOOTBALL_DATA_TOKEN ausente.",
    });
  }

  console.info(`[BOB/pre-round] Processando T-48h · rodada ${round}/${season}`);

  // 2. Buscar dados via orquestrador multi-API
  const { matches: matchInputs, meta } = await fetchRoundMatchInputs(season, round);

  if (matchInputs.length === 0) {
    return NextResponse.json({
      ok:      false,
      message: "Dados de jogos indisponíveis para esta rodada.",
      round,
      season,
    });
  }

  // 3. Motor de scoring + variações
  const scored     = matchInputs.map(scoreMatch);
  const anchors    = selectAnchors(matchInputs);
  const anchorIds  = new Set(anchors.map((a) => a.id));
  const pool       = scored.filter((m) => !anchorIds.has(m.id));
  const variations = generateVariations({ anchors, pool });

  // 4. Persistir rascunho (idempotente)
  const { roundDbId } = await saveRound({
    season,
    round,
    anchors,
    variations,
    source: meta.source,
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
