/**
 * API Route: /api/cron/update-odds
 * Atualiza odds de todas as partidas a cada 15 minutos
 * Chamada via cron job (Vercel Cron ou external scheduler)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchOddsBatch } from "@/lib/odds/odds-service";

// Segredo para autenticar chamadas cron
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Verificar autenticação do cron
  const authHeader = request.headers.get("authorization");
  const urlToken = request.nextUrl.searchParams.get("token");
  
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && urlToken !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  
  try {
    // Buscar todas as partidas futuras (próximas 7 dias)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    
    const matches = await prisma.betMatch.findMany({
      where: {
        scheduledAt: {
          gte: new Date(),
          lte: sevenDaysFromNow,
        },
        status: {
          in: ["SCHEDULED", "LIVE", "POSTPONED"],
        },
      },
      select: {
        id: true,
        homeTeam: true,
        awayTeam: true,
        externalId: true,
      },
    });

    if (matches.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Nenhuma partida para atualizar",
        updated: 0,
        duration: Date.now() - startTime,
      });
    }

    // Buscar odds em batch
    const oddsPromises = matches.map(async (match) => {
      try {
        const odds = await fetchOddsBatch([{
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          matchId: match.id,
        }]);
        
        const matchOdds = odds.get(`${match.homeTeam}:${match.awayTeam}`);
        
        if (matchOdds) {
          // Salvar odds no banco
          await Promise.all([
            // Home
            prisma.betOdds.upsert({
              where: {
                matchId_market_option: {
                  matchId: match.id,
                  market: "RESULT_1X2",
                  option: "HOME",
                },
              },
              update: { odd: matchOdds.homeOdd || 0 },
              create: {
                matchId: match.id,
                market: "RESULT_1X2",
                option: "HOME",
                optionLabel: "Casa",
                odd: matchOdds.homeOdd || 0,
              },
            }),
            // Draw
            prisma.betOdds.upsert({
              where: {
                matchId_market_option: {
                  matchId: match.id,
                  market: "RESULT_1X2",
                  option: "DRAW",
                },
              },
              update: { odd: matchOdds.drawOdd || 0 },
              create: {
                matchId: match.id,
                market: "RESULT_1X2",
                option: "DRAW",
                optionLabel: "Empate",
                odd: matchOdds.drawOdd || 0,
              },
            }),
            // Away
            prisma.betOdds.upsert({
              where: {
                matchId_market_option: {
                  matchId: match.id,
                  market: "RESULT_1X2",
                  option: "AWAY",
                },
              },
              update: { odd: matchOdds.awayOdd || 0 },
              create: {
                matchId: match.id,
                market: "RESULT_1X2",
                option: "AWAY",
                optionLabel: "Visitante",
                odd: matchOdds.awayOdd || 0,
              },
            }),
          ]);
          
          return { matchId: match.id, success: true, source: matchOdds.source };
        }
        
        return { matchId: match.id, success: false, reason: "no_odds" };
      } catch (error) {
        return { 
          matchId: match.id, 
          success: false, 
          reason: "error",
          error: error instanceof Error ? error.message : "Unknown"
        };
      }
    });

    const results = await Promise.all(oddsPromises);
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      message: `Odds atualizadas: ${successful}/${matches.length}`,
      total: matches.length,
      updated: successful,
      failed,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("Cron update odds error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      duration: Date.now() - startTime,
    }, { status: 500 });
  }
}
