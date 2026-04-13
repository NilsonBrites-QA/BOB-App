/**
 * GET /api/bob/suggestions?matchIds=id1,id2,...
 *
 * Retorna sugestões BOB para uma ou mais partidas.
 * Agrupa por matchId → profile → selections[].
 *
 * Query params:
 *   matchIds: string   — IDs separados por vírgula (máx. 50)
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSuggestionsForMatches } from "@/lib/bob/bet-analyzer";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("matchIds") ?? "";
  const matchIds = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);

  if (matchIds.length === 0) {
    return NextResponse.json({ error: "matchIds obrigatório" }, { status: 400 });
  }

  const rows = await getSuggestionsForMatches(matchIds);

  // Agrupa: matchId → profile → selections[]
  const grouped: Record<
    string,
    Record<
      string,
      Array<{
        market: string;
        option: string;
        optionLabel: string;
        odd: number;
        confidence: number | null;
        justification: string | null;
        result: string | null;
      }>
    >
  > = {};

  for (const row of rows) {
    if (!grouped[row.matchId]) grouped[row.matchId] = {};
    const profileKey = row.profile.toLowerCase();
    if (!grouped[row.matchId][profileKey]) grouped[row.matchId][profileKey] = [];
    grouped[row.matchId][profileKey].push({
      market:        row.market,
      option:        row.option,
      optionLabel:   row.optionLabel,
      odd:           row.odd,
      confidence:    row.confidence ?? null,
      justification: row.justification ?? null,
      result:        row.result ?? null,
    });
  }

  return NextResponse.json({ suggestions: grouped });
}
