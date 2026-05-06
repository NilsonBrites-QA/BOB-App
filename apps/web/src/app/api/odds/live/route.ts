/**
 * API: /api/odds/live
 * Retorna odds reais das partidas atuais
 */

import { NextResponse } from "next/server";
import { fetchOddsBatch } from "@/lib/odds/odds-service";
import { prisma } from "@/lib/db";

type LiveOddsResponseEntry = {
  home?: number;
  draw?: number;
  away?: number;
  source: string;
  updatedAt: Date;
};

export async function GET() {
  try {
    // Buscar partidas dos próximos 7 dias
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const matches = await prisma.betMatch.findMany({
      where: {
        scheduledAt: {
          gte: new Date(),
          lte: sevenDaysFromNow,
        },
        status: {
          in: ["SCHEDULED", "LIVE"],
        },
      },
      select: {
        id: true,
        homeTeam: true,
        awayTeam: true,
        scheduledAt: true,
      },
      take: 50, // Limitar para performance
    });

    // Buscar odds em batch
    const oddsMap = await fetchOddsBatch(
      matches.map((m) => ({
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        matchId: m.id,
      }))
    );

    // Formatar resposta
    const odds: Record<string, LiveOddsResponseEntry> = {};
    matches.forEach((match) => {
      const matchOdds = oddsMap.get(`${match.homeTeam}:${match.awayTeam}`);
      if (matchOdds) {
        odds[match.id] = {
          home: matchOdds.homeOdd,
          draw: matchOdds.drawOdd,
          away: matchOdds.awayOdd,
          source: matchOdds.source,
          updatedAt: matchOdds.timestamp,
        };
      }
    });

    return NextResponse.json({
      success: true,
      odds,
      count: Object.keys(odds).length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching live odds:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch odds" },
      { status: 500 }
    );
  }
}
