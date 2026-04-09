/**
 * BOB — Route Handler: GET /api/bob/round
 *
 * Busca os dados da rodada via pipeline de conectores, aplica o motor de scoring
 * e retorna âncoras + variações prontas para exibição no dashboard.
 *
 * Query params:
 *   season (number, obrigatório) — ex: 2026
 *   round  (number, obrigatório) — ex: 15
 *
 * Exemplo: GET /api/bob/round?season=2026&round=15
 */

import { NextResponse }  from "next/server";
import { fetchRoundMatchInputs } from "@/lib/bob/connectors";
import { scoreMatch, selectAnchors } from "@/lib/bob/engine";
import { generateVariations } from "@/lib/bob/engine";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const seasonParam = searchParams.get("season");
  const roundParam  = searchParams.get("round");

  // Validação de parâmetros
  if (!seasonParam || !roundParam) {
    return NextResponse.json(
      { error: "Parâmetros 'season' e 'round' são obrigatórios." },
      { status: 400 }
    );
  }

  const season = parseInt(seasonParam, 10);
  const round  = parseInt(roundParam, 10);

  if (isNaN(season) || isNaN(round) || season < 2000 || round < 1 || round > 38) {
    return NextResponse.json(
      { error: "Parâmetros inválidos. 'season' deve ser >= 2000 e 'round' entre 1 e 38." },
      { status: 400 }
    );
  }

  try {
    // ── Pipeline de dados ────────────────────────────────────────────────────
    const { matches, meta } = await fetchRoundMatchInputs(season, round);

    if (matches.length === 0) {
      return NextResponse.json(
        {
          anchors: [],
          variations: [],
          allScored: [],
          meta: { ...meta, warning: "Nenhum jogo encontrado para esta rodada." },
        },
        { status: 200 }
      );
    }

    // ── Motor de scoring ─────────────────────────────────────────────────────
    const allScored  = matches.map(scoreMatch);
    const anchors    = selectAnchors(matches); // selectAnchors recebe MatchInput[]
    const anchorIds  = new Set(anchors.map((a) => a.id));
    const pool       = allScored.filter((m) => !anchorIds.has(m.id));

    // ── Variações ────────────────────────────────────────────────────────────
    const variations = generateVariations({ anchors, pool });

    return NextResponse.json(
      { anchors, variations, allScored, meta },
      {
        status: 200,
        headers: {
          // Permite que o CDN/browser cache por 30 min, revalida em background
          "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno do servidor";

    // Retorna 503 quando o erro é de quota/rate limit da API externa
    const isQuotaError =
      message.includes("429") ||
      message.includes("Rate limit") ||
      message.includes("restantes hoje");

    console.error("[/api/bob/round]", message);

    return NextResponse.json(
      { error: message },
      { status: isQuotaError ? 503 : 500 }
    );
  }
}
