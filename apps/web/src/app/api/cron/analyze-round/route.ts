/**
 * GET /api/cron/analyze-round
 *
 * Dispara a análise BOB para todas as partidas SCHEDULED da rodada/competição.
 * Deve ser chamado antes do início da rodada (ex: 2h antes do 1º jogo).
 *
 * Query params:
 *   competition: "Série A" | "Série B" (obrigatório)
 *   season:      number (padrão: ano corrente)
 *   round:       number (padrão: próxima rodada com partidas SCHEDULED)
 *
 * Requer: Authorization: Bearer <CRON_SECRET>
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeBetMatch } from "@/lib/bob/bet-analyzer";
import { BetMatchStatus } from "@/generated/prisma";

export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  const secret     = process.env.CRON_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parâmetros ───────────────────────────────────────────────────────────────
  const { searchParams } = req.nextUrl;
  const competition = searchParams.get("competition");
  const seasonParam = searchParams.get("season");
  const roundParam  = searchParams.get("round");

  if (!competition || !["Série A", "Série B"].includes(competition)) {
    return NextResponse.json(
      { error: "competition obrigatório: 'Série A' ou 'Série B'" },
      { status: 400 },
    );
  }

  const season = seasonParam ? parseInt(seasonParam, 10) : new Date().getFullYear();

  // ── Busca partidas ────────────────────────────────────────────────────────────
  let matches;
  if (roundParam) {
    const round = parseInt(roundParam, 10);
    matches = await prisma.betMatch.findMany({
      where: {
        competition,
        season,
        round,
        status: { in: [BetMatchStatus.SCHEDULED, BetMatchStatus.LIVE] },
      },
      select: { id: true, homeTeam: true, awayTeam: true, competition: true, season: true, round: true },
    });
  } else {
    // Próxima rodada com partidas agendadas
    const nextMatch = await prisma.betMatch.findFirst({
      where: { competition, season, status: BetMatchStatus.SCHEDULED },
      orderBy: { scheduledAt: "asc" },
      select: { round: true },
    });

    if (!nextMatch?.round) {
      return NextResponse.json({ ok: true, message: "Nenhuma rodada agendada encontrada.", analyzed: 0 });
    }

    matches = await prisma.betMatch.findMany({
      where: { competition, season, round: nextMatch.round, status: { in: [BetMatchStatus.SCHEDULED, BetMatchStatus.LIVE] } },
      select: { id: true, homeTeam: true, awayTeam: true, competition: true, season: true, round: true },
    });
  }

  if (matches.length === 0) {
    return NextResponse.json({ ok: true, message: "Nenhuma partida encontrada.", analyzed: 0 });
  }

  // ── Analisa sequencialmente (respeita rate limits das APIs) ───────────────────
  const results: Array<{ matchId: string; match: string; source: string; error?: string }> = [];

  for (const m of matches) {
    try {
      const analysis = await analyzeBetMatch({
        matchId:     m.id,
        homeTeam:    m.homeTeam,
        awayTeam:    m.awayTeam,
        competition: m.competition,
        season:      m.season,
        round:       m.round,
      });

      results.push({
        matchId: m.id,
        match:   `${m.homeTeam} x ${m.awayTeam}`,
        source:  analysis.source,
      });
    } catch (err) {
      console.error(`[cron/analyze-round] Erro em ${m.homeTeam} x ${m.awayTeam}:`, err);
      results.push({
        matchId: m.id,
        match:   `${m.homeTeam} x ${m.awayTeam}`,
        source:  "error",
        error:   err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  const analyzed = results.filter((r) => !r.error).length;
  const errors   = results.filter((r) => r.error).length;

  return NextResponse.json({
    ok:           true,
    competition,
    season,
    analyzed,
    errors,
    results,
  });
}
