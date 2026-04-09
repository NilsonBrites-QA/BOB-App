/**
 * BOB — Route Handler: POST /api/bob/betslip
 *
 * Persiste uma rodada gerada no Supabase via Prisma.
 * Chamado pelo dashboard imediatamente após a geração com dados reais.
 *
 * Body (JSON):
 *   season    number
 *   round     number
 *   source    "api" | "demo"
 *   anchors   ScoredMatch[]
 *   variations Variation[]
 *
 * Response:
 *   { roundDbId: string }          — 201 Created
 *   { roundDbId: string, existing: true } — 200 (já existia)
 */

import { NextResponse } from "next/server";
import { saveRound }   from "@/lib/bob/persist";
import type { ScoredMatch } from "@/lib/bob/engine/scoring";
import type { Variation }   from "@/lib/bob/types";

type RequestBody = {
  season:     number;
  round:      number;
  source:     "api" | "demo";
  anchors:    ScoredMatch[];
  variations: Variation[];
};

export async function POST(request: Request) {
  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { error: "Body JSON inválido." },
      { status: 400 }
    );
  }

  const { season, round, source, anchors, variations } = body;

  if (!season || !round || !anchors || !variations) {
    return NextResponse.json(
      { error: "Campos obrigatórios: season, round, anchors, variations." },
      { status: 400 }
    );
  }

  try {
    const result = await saveRound({ season, round, source: source ?? "demo", anchors, variations });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[/api/bob/betslip POST]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
