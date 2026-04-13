/**
 * POST /api/bob/analyze-match
 *
 * Dispara a análise BOB para uma partida específica.
 * Gera sugestões para os 4 perfis (CONSERVADOR, MODERADO, AGRESSIVO, MATEMÁTICO)
 * e salva na tabela bob_suggestions.
 *
 * Body: { matchId: string }
 *
 * Protegido por CRON_SECRET ou Bearer token de admin.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeBetMatch } from "@/lib/bob/bet-analyzer";

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const auth   = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET ?? "";
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ───────────────────────────────────────────────────────────────
  let matchId: string;
  try {
    const body = (await req.json()) as { matchId?: unknown };
    if (typeof body.matchId !== "string" || !body.matchId) {
      return NextResponse.json({ error: "matchId obrigatório" }, { status: 400 });
    }
    matchId = body.matchId;
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  // ── Busca a partida ──────────────────────────────────────────────────────────
  const match = await prisma.betMatch.findUnique({
    where:  { id: matchId },
    select: { id: true, homeTeam: true, awayTeam: true, competition: true, season: true, round: true, status: true },
  });

  if (!match) {
    return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
  }

  // ── Analisa ──────────────────────────────────────────────────────────────────
  try {
    const analysis = await analyzeBetMatch({
      matchId:     match.id,
      homeTeam:    match.homeTeam,
      awayTeam:    match.awayTeam,
      competition: match.competition,
      season:      match.season,
      round:       match.round,
    });

    return NextResponse.json({
      ok:     true,
      source: analysis.source,
      counts: {
        conservador: analysis.conservador.selections.length,
        moderado:    analysis.moderado.selections.length,
        agressivo:   analysis.agressivo.selections.length,
        matematico:  analysis.matematico.selections.length,
      },
    });
  } catch (err) {
    console.error("[bob/analyze-match] Erro:", err);
    return NextResponse.json({ error: "Falha na análise" }, { status: 500 });
  }
}
