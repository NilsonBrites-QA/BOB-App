/**
 * API: Análise de Partida para BOB Bet Analyzer
 * 
 * GET /api/bob/analyze-match/[matchId]?season=2026
 * Retorna análise completa com sugestões por perfil
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateMatchProbabilities, scoreMarketsForProfile, type ProfileScore, type ProfileSlug } from "@/lib/bob/bet-analyzer/engine";
import { generateAISuggestions, type MatchSuggestions } from "@/lib/bob/bet-analyzer/ai-suggestions";
import type { MatchInput } from "@/lib/bob/engine/scoring";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;
    const { searchParams } = new URL(request.url);
    const season = parseInt(searchParams.get("season") || "2026", 10);

    // 1. Buscar análise existente
    // const existingAnalysis = await prisma.matchAnalysis.findFirst({
    //   where: { matchId, season },
    //   include: {
    //     suggestions: {
    //       include: { profile: true },
    //     },
    //   },
    // });

    // // Se existe e está completo, retornar
    // if (existingAnalysis && existingAnalysis.status === "completed") {
    //   return NextResponse.json({
    //     matchId,
    //     season,
    //     status: "completed",
    //     data: existingAnalysis,
    //     cached: true,
    //   });
    // }

    // 2. Buscar dados reais da partida em memória/banco
    const matchData = await getMatchData(matchId, season);
    
    if (!matchData) {
      return NextResponse.json(
        {
          error: "dados insuficientes para geração responsável",
          reason: "A partida não possui snapshot estatístico real no banco. O BOB não cria análise com dados inventados.",
        },
        { status: 422 }
      );
    }

    // 3. Calcular probabilidades
    const probabilities = calculateMatchProbabilities(matchData);

    // 4. Perfis mockados (TODO: buscar do banco quando migration for aplicada)
    type MockProfile = { id: string; slug: ProfileSlug; name: string; riskLevel: string };
    const mockProfiles: MockProfile[] = [
      { id: "1", slug: "conservador", name: "Conservador", riskLevel: "baixo" },
      { id: "2", slug: "moderado", name: "Moderado", riskLevel: "medio" },
      { id: "3", slug: "agressivo", name: "Agressivo", riskLevel: "alto" },
      { id: "4", slug: "matematico", name: "Matemático/Sistema", riskLevel: "extremo" },
    ];

    // 5. Gerar sugestões para cada perfil
    const suggestionsByProfile: Record<string, { profile: MockProfile; suggestions: MatchSuggestions; topScores: ProfileScore[] }> = {};
    
    for (const profile of mockProfiles) {
      const profileSlug = profile.slug as ProfileSlug;
      
      // Calcular scores para este perfil
      const scores = scoreMarketsForProfile(probabilities, profileSlug);
      
      // Gerar sugestão com IA
      const aiSuggestion = await generateAISuggestions(
        matchData,
        probabilities,
        scores,
        profileSlug
      );
      
      suggestionsByProfile[profileSlug] = {
        profile,
        suggestions: aiSuggestion,
        topScores: scores.slice(0, 5),
      };
    }

    // 6. TODO: Salvar análise no banco quando migration for aplicada
    // saveAnalysis(matchId, season, matchData, probabilities, suggestionsByProfile)
    //   .catch(err => console.error("[Analyze Match] Failed to save:", err));

    return NextResponse.json({
      matchId,
      season,
      status: "completed",
      match: {
        homeTeam: matchData.homeTeam,
        awayTeam: matchData.awayTeam,
        scheduledAt: matchData.scheduledAt,
      },
      probabilities: {
        homeWin: probabilities.probabilities.homeWin,
        draw: probabilities.probabilities.draw,
        awayWin: probabilities.probabilities.awayWin,
        bttsYes: probabilities.probabilities.bttsYes,
        over25: probabilities.probabilities.over2_5,
      },
      suggestionsByProfile,
      generatedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error("[Analyze Match] Error:", error);
    return NextResponse.json(
      { error: "Falha ao analisar partida" },
      { status: 500 }
    );
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function getMatchData(matchId: string, season: number): Promise<MatchInput | null> {
  // Buscar de rounds existentes (usar season via relacionamento)
  const seasonData = await prisma.season.findFirst({
    where: { year: season },
    include: {
      rounds: {
        include: {
          anchors: true,
          variations: {
            include: { picks: true },
          },
        },
        orderBy: { number: "desc" },
        take: 1,
      },
    },
  });
  
  const round = seasonData?.rounds[0];

  if (!round) return null;

  // Encontrar a partida nas picks
  for (const variation of round.variations) {
    for (const pick of variation.picks) {
      if (pick.fixtureId === matchId || pick.id === matchId) {
        return null;
      }
    }
  }

  return null;
}

// TODO: Reativar quando migration for aplicada
// async function createDefaultProfiles() {
//   const defaults = [
//     { slug: "conservador", name: "Conservador", description: "...", minOdd: 1.20, maxOdd: 1.70, riskLevel: "baixo", strategy: "..." },
//     { slug: "moderado", name: "Moderado", description: "...", minOdd: 1.75, maxOdd: 4.50, riskLevel: "medio", strategy: "..." },
//     { slug: "agressivo", name: "Agressivo", description: "...", minOdd: 3.00, maxOdd: 15.00, riskLevel: "alto", strategy: "..." },
//     { slug: "matematico", name: "Matemático/Sistema", description: "...", minOdd: 1.50, maxOdd: 20.00, riskLevel: "extremo", strategy: "..." },
//   ];
//   for (const profile of defaults) {
//     await prisma.betProfile.create({ data: profile });
//   }
// }

// async function saveAnalysis(...) {
//   // Criar ou atualizar análise no banco
//   // ...
// }
