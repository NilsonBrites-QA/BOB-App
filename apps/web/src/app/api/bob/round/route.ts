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
import { getGatewayRoundDataset } from "@/lib/data/sports-data-gateway";
import { buildOfficialVariationsPipeline } from "@/lib/bob/analytics/official-variation-pipeline";

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
    const dataset = await getGatewayRoundDataset(season, round);
    const matches = dataset?.matches ?? [];
    const meta = dataset?.meta ?? { season, round, warning: "Gateway sem dados para esta rodada." };

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

    // ── Motor Oficial de Variações ───────────────────────────────────────────
    const pipeline = await buildOfficialVariationsPipeline({
      matches,
      source: "api",
      round,
      sourceSnapshotIds: [`api-bob-round:${season}:${round}:gateway`],
    });
    if (!pipeline.ok || !pipeline.variationsResult) {
      return NextResponse.json(
        {
          anchors: [],
          variations: [],
          allScored: [],
          meta: { ...meta, status: pipeline.status, warning: pipeline.reason ?? "Dados insuficientes para gerar Variações oficiais." },
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { anchors: pipeline.anchors, variations: pipeline.variationsResult.variations, allScored: pipeline.anchorSelection?.allRanked ?? [], meta },
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
