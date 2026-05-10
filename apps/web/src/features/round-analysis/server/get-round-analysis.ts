/**
 * Agregador servidor para "Análises da Rodada".
 * 
 * Responsabilidades:
 * 1. Buscar snapshots persistidos no banco por season+round+roundVersion
 * 2. Compor RoundAnalysisEnvelope com dados já calculados
 * 3. Garantir resposta rápida O(1) sem chamada externa
 * 4. Implementar fallback para versão anterior se versão atual incompleta
 * 
 * CRÍTICO: Esta função LE APENAS DO BANCO. Sem chamadas de API.
 * Atualização dos dados ocorre via endpoint POST /api/bob/round-analysis/snapshot
 * controlado por job cron ou ação admin.
 */

import { prisma } from "@/lib/db";
import type {
  MatchAnalysisCardData,
  RoundAnalysisEnvelope,
  DataFreshness,
} from "../types/round-analysis.types";

interface GetRoundAnalysisOptions {
  season: number;
  round: number;
  roundVersion?: number;
  allowFallback?: boolean;
}

/**
 * Busca análises da rodada serializadas no banco.
 * Implementa read-only com fallback automático para versão anterior se necessário.
 */
export async function getRoundAnalysis(
  options: GetRoundAnalysisOptions,
): Promise<RoundAnalysisEnvelope | null> {
  const { season, round, roundVersion, allowFallback = true } = options;

  try {
    let analysis = await prisma.bobRoundAnalysis.findFirst({
      where: {
        season,
        round,
        ...(roundVersion !== undefined && { roundVersion }),
      },
      orderBy: { roundVersion: "desc" },
      include: {
        matchAnalyses: {
          include: {
            marketSnapshot: true,
          },
          orderBy: { scheduledAt: "asc" },
        },
      },
    });

    if (!analysis && allowFallback) {
      const previousVersion = await prisma.bobRoundAnalysis.findFirst({
        where: { season, round },
        orderBy: { roundVersion: "desc" },
        skip: 1,
        include: {
          matchAnalyses: {
            include: {
              marketSnapshot: true,
            },
            orderBy: { scheduledAt: "asc" },
          },
        },
      });

      if (previousVersion) {
        analysis = previousVersion;
        console.warn(
          `[getRoundAnalysis] Versão ${roundVersion || "current"} não encontrada; usando versão anterior ${analysis.roundVersion}`,
        );
      }
    }

    if (!analysis) {
      return null;
    }

    const envelope = buildRoundAnalysisEnvelope(analysis);
    return envelope as RoundAnalysisEnvelope;
  } catch (err) {
    console.error(
      `[getRoundAnalysis] Erro ao buscar análise de season=${season} round=${round}:`,
      err,
    );
    return null;
  }
}

/**
 * Compõe o RoundAnalysisEnvelope a partir dos dados persistidos.
 */
function buildRoundAnalysisEnvelope(analysis: any): RoundAnalysisEnvelope {
  const matches = analysis.matchAnalyses.map(
    (m: any): MatchAnalysisCardData => ({
      id: m.id,
      matchId: m.fixtureId ?? null,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      homeBadgeUrl: m.homeBadgeUrl ?? null,
      awayBadgeUrl: m.awayBadgeUrl ?? null,
      scheduledAt: m.scheduledAt.toISOString(),
      status: m.status,
      homeScore: m.homeScore ?? null,
      awayScore: m.awayScore ?? null,
      confidence: m.confidence,
      recommendation: m.recommendation,
      riskFlags: m.riskFlags ? (Array.isArray(m.riskFlags) ? m.riskFlags : []) : [],
      insightBlocks: m.insightBlocks
        ? Array.isArray(m.insightBlocks)
          ? m.insightBlocks
          : []
        : [],
      odds: m.marketSnapshot
        ? {
            home: m.marketSnapshot.homeOdd || undefined,
            draw: m.marketSnapshot.drawOdd || undefined,
            away: m.marketSnapshot.awayOdd || undefined,
          }
        : undefined,
    }),
  ) as MatchAnalysisCardData[];

  const totalMatches = matches.length;
  const highConfidenceCount = matches.filter((m) => m.confidence >= 70).length;
  const averageConfidence =
    totalMatches > 0 ? Math.round(matches.reduce((sum, m) => sum + m.confidence, 0) / totalMatches) : 0;

  const allRiskFlags = matches.flatMap((m) => m.riskFlags);
  const uniqueRiskFlags = allRiskFlags.filter(
    (flag, idx, arr) =>
      arr.findIndex((f) => f.type === flag.type && f.message === flag.message) === idx,
  );

  const coverage: DataFreshness = {
    source: analysis.dataSource || "cached",
    lastUpdateAt: analysis.analyzedAt
      ? new Date(analysis.analyzedAt).toISOString()
      : new Date().toISOString(),
    matchesCovered: matches.filter((m) => m.confidence > 0).length,
    matchesTotal: totalMatches,
    apiStatus: (() => {
      if (!analysis.apiStatus) return {};
      if (typeof analysis.apiStatus !== "string") return analysis.apiStatus as Record<string, "ok" | "partial" | "failed">;
      try {
        return JSON.parse(analysis.apiStatus) as Record<string, "ok" | "partial" | "failed">;
      } catch {
        console.warn("[getRoundAnalysis] apiStatus JSON inválido, usando fallback vazio.");
        return {};
      }
    })(),
  };

  return {
    season: analysis.season,
    round: analysis.round,
    roundVersion: analysis.roundVersion,
    matches,
    loadedAt: new Date().toISOString(),
    coverage,
    summary: {
      totalMatches,
      averageConfidence,
      highConfidenceCount,
      riskFlags: uniqueRiskFlags,
    },
  };
}

/**
 * Busca apenas metadados de disponibilidade.
 */
export async function getRoundAnalysisMetadata(
  season: number,
  round: number,
): Promise<{ hasData: boolean; versions: number[]; latestVersion: number | null } | null> {
  try {
    const versions = await prisma.bobRoundAnalysis.findMany({
      where: { season, round },
      select: { roundVersion: true },
      orderBy: { roundVersion: "desc" },
    });

    if (versions.length === 0) {
      return { hasData: false, versions: [], latestVersion: null };
    }

    return {
      hasData: true,
      versions: versions.map((v) => v.roundVersion),
      latestVersion: versions[0]!.roundVersion,
    };
  } catch (err) {
    console.error(
      `[getRoundAnalysisMetadata] Erro ao buscar metadados de season=${season} round=${round}:`,
      err,
    );
    return null;
  }
}
