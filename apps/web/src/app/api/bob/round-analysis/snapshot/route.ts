/**
 * POST /api/bob/round-analysis/snapshot
 * 
 * Endpoint de ESCRITA/GERAÇÃO — chamado apenas via:
 *   1. Cron job (Authorization: Bearer CRON_SECRET)
 *   2. Admin dashboard (validação de sessão BOB admin)
 * 
 * Este é o ÚNICO lugar onde ocorrem chamadas externas de API.
 * Resultado é persistido no banco com versionamento explícito.
 * A UI consome somente via GET /api/bob/round-analysis (read-only).
 * 
 * Body:
 *   { season: number, round: number, force?: boolean }
 * 
 * Returns:
 *   200: GenerateRoundAnalysisResponse com sucesso
 *   401: Unauthorized (sem CRON_SECRET ou sem permissão admin)
 *   400: Bad request
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { loadRoundData } from "@/lib/bob/round-loader";
import { scoreMatch } from "@/lib/bob/engine/scoring";
import { getFactorBreakdown } from "@/lib/bob/engine/factor-breakdown";
import type {
  RoundAnalysisEnvelope,
  MatchAnalysisCardData,
  RiskFlag,
  InsightBlock,
} from "@/features/round-analysis/types/round-analysis.types";

function normalizeSecret(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  const isDoubleQuoted = trimmed.startsWith('"') && trimmed.endsWith('"');
  const isSingleQuoted = trimmed.startsWith("'") && trimmed.endsWith("'");

  if ((isDoubleQuoted || isSingleQuoted) && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;

  const parts = authHeader.trim().split(" ");
  if (parts.length < 2) return null;

  const [scheme, ...tokenParts] = parts;
  if (!scheme || scheme.toLowerCase() !== "bearer") return null;

  const token = tokenParts.join(" ").trim();
  return token.length > 0 ? token : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toStableUuid(source: string): string {
  if (isUuid(source)) return source;

  const hex = createHash("sha256").update(source).digest("hex").slice(0, 32);
  const chars = hex.split("");

  // Força versão 4 e variante RFC4122 para garantir formato UUID aceito.
  chars[12] = "4";
  chars[16] = ["8", "9", "a", "b"][parseInt(chars[16] ?? "0", 16) % 4] ?? "8";

  const normalized = chars.join("");
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20, 32)}`;
}

export async function POST(req: NextRequest) {
  try {
    // ── Autenticação via CRON_SECRET ou validação admin ────────────────────
    const authHeader = req.headers.get("Authorization");
    const cronSecret = normalizeSecret(process.env.CRON_SECRET);
    const bearerToken = normalizeSecret(extractBearerToken(authHeader));

    let isAdmin = false;

    // Verificação 1: CRON_SECRET
    if (cronSecret && bearerToken && bearerToken === cronSecret) {
      // OK, job autorizado
    } else {
      // Verificação 2: Usuário admin logado
      const cookieStore = await cookies();
      const supabase = await createClient(cookieStore);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const dbUser = await prisma.user.findUnique({
        where: { email: user.email!.toLowerCase() },
        select: { role: true, active: true },
      }).catch(() => null);

      if (!dbUser?.active || dbUser.role !== "ADMIN") {
        return NextResponse.json(
          { error: "Permissão de admin necessária" },
          { status: 403 },
        );
      }

      isAdmin = true;
    }

    // ── Parse body ─────────────────────────────────────────────────────────
    const body = await req.json();
    const { season, round, force } = body as Record<string, unknown>;

    if (!season || !round || typeof season !== "number" || typeof round !== "number") {
      return NextResponse.json(
        { error: "season e round (números) são obrigatórios" },
        { status: 400 },
      );
    }

    if (season < 2025 || round < 1 || round > 38) {
      return NextResponse.json(
        { error: "season/round inválidos" },
        { status: 400 },
      );
    }

    // ── Lógica de geração ──────────────────────────────────────────────────

    console.log(
      `[POST /api/bob/round-analysis/snapshot] Iniciando geração para season=${season} round=${round} (force=${force})`,
    );

    // 1. Busca versão mais recente (sempre — force não reseta para 1)
    let nextVersion = 1;
    const latest = await prisma.bobRoundAnalysis.findFirst({
      where: { season, round },
      select: { roundVersion: true },
      orderBy: { roundVersion: "desc" },
    });
    if (latest) {
      nextVersion = latest.roundVersion + 1;
    }

    // 2. Busca dados da rodada via round-loader (pode chamar APIs externas nesta etapa)
    console.log(`[snapshot] Carregando dados da rodada ${season}/${round}...`);
    const roundData = await loadRoundData(season, round);

    if (!roundData || roundData.matches.length === 0) {
      return NextResponse.json(
        {
          success: false,
          season,
          round,
          roundVersion: nextVersion,
          matchesAnalyzed: 0,
          error: "Nenhuma partida encontrada para esta rodada",
        },
        { status: 400 },
      );
    }

    // 3. Analisa cada jogo (scoring + insights)
    const matches: MatchAnalysisCardData[] = [];

    for (const match of roundData.matches) {
      const scored = scoreMatch(match);
      const breakdown = getFactorBreakdown(match);

      // Classificação de completude das odds 1X2
      const hasCompleteOdds =
        match.homeOdd != null && match.drawOdd != null && match.awayOdd != null;
      const hasPartialOdds =
        !hasCompleteOdds &&
        (match.homeOdd != null || match.drawOdd != null || match.awayOdd != null);
      const missingOdds = !hasCompleteOdds;

      // Constrói card de análise
      const card: MatchAnalysisCardData = {
        id: match.id,
        matchId: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeBadgeUrl: null,
        awayBadgeUrl: null,

        scheduledAt: match.scheduledAt ? new Date(match.scheduledAt).toISOString() : new Date().toISOString(),
        status: "SCHEDULED",
        homeScore: undefined,
        awayScore: undefined,

        // Confiança do BOB
        confidence: scored.score,
        recommendation: buildRecommendation(scored),

        // Riscos identificados (inclui flags de odds ausentes/parciais quando aplicável)
        riskFlags: buildRiskFlags(roundData, match, missingOdds, hasPartialOdds),

        // Insights por categoria
        insightBlocks: buildInsights(scored, breakdown, match),

        // Odds do snapshot — apenas valores reais; null se ausente
        odds: {
          home: match.homeOdd ?? undefined,
          draw: match.drawOdd ?? undefined,
          away: match.awayOdd ?? undefined,
        },
      };

      matches.push(card);
    }

    console.log(`[snapshot] Análise de ${matches.length} jogos concluída`);

    // 4. Persiste snapshot no banco com versionamento
    console.log(`[snapshot] Persistindo versão ${nextVersion}...`);

    await prisma.$transaction(async (tx) => {
      const roundAnalysis = await tx.bobRoundAnalysis.create({
        data: {
          season,
          round,
          roundVersion: nextVersion,
          dataSource: roundData.source === "api" ? "live" : "cached",
          analysisStatus: "completed",
          analyzedAt: new Date(),
          apiStatus: JSON.stringify(
            roundData.meta?.integrations || { default: "ok" },
          ),
        },
      });

      for (const card of matches) {
        const createdMatch = await tx.bobMatchAnalysis.create({
          data: {
            roundAnalysisId: roundAnalysis.id,
            matchId: toStableUuid(card.id),
            fixtureId: card.matchId ?? card.id,
            homeTeam: card.homeTeam,
            awayTeam: card.awayTeam,
            homeBadgeUrl: card.homeBadgeUrl,
            awayBadgeUrl: card.awayBadgeUrl,
            scheduledAt: new Date(card.scheduledAt),
            status: card.status,
            homeScore: card.homeScore,
            awayScore: card.awayScore,
            confidence: card.confidence,
            recommendation: card.recommendation,
            riskFlags: card.riskFlags as any,
            insightBlocks: card.insightBlocks as any,
          },
          select: { id: true },
        });

        const hasAllOdds =
          card.odds?.home != null && card.odds?.draw != null && card.odds?.away != null;
        const hasSomeOdds =
          !hasAllOdds &&
          (card.odds?.home != null || card.odds?.draw != null || card.odds?.away != null);
        const computedOddSource = hasAllOdds ? "live" : hasSomeOdds ? "partial" : "missing";

        await tx.bobMatchMarketSnapshot.create({
          data: {
            matchAnalysisId: createdMatch.id,
            homeOdd: card.odds?.home ?? null,
            drawOdd: card.odds?.draw ?? null,
            awayOdd: card.odds?.away ?? null,
            oddSource: computedOddSource,
            snapshotAt: new Date(),
          },
        });
      }
    });

    console.log(`[snapshot] Versão ${nextVersion} persistida com sucesso (${matches.length} jogos)`);

    return NextResponse.json(
      {
        success: true,
        season,
        round,
        roundVersion: nextVersion,
        matchesAnalyzed: matches.length,
        message: `Snapshot v${nextVersion} gerado e persistido com sucesso`,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[POST /api/bob/round-analysis/snapshot] Erro:", err);
    return NextResponse.json(
      {
        success: false,
        season: 0,
        round: 0,
        roundVersion: 0,
        matchesAnalyzed: 0,
        error: err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}

// ─── Helpers para construção de análise ────────────────────────────────────

function buildRecommendation(scored: any): string {
  if (scored.score >= 70) {
    return `Alta confiança (${scored.score}). Jogo bem estruturado para análise.`;
  }
  if (scored.score >= 50) {
    return `Confiança intermediária (${scored.score}). Existem fatores de incerteza — observe.`;
  }
  return `Baixa confiança (${scored.score}). Faltam dados ou sinais contraditórios.`;
}

function buildRiskFlags(
  roundData: any,
  match: any,
  missingOdds = false,
  partialOdds = false,
): RiskFlag[] {
  const risks: RiskFlag[] = [];

  // Cobertura parcial da rodada
  if (roundData.source !== "api" || roundData.meta?.integrations?.odds !== "live") {
    risks.push({
      type: "MISSING_DATA",
      message: "Dados incompletos nesta rodada — odds ou contexto parcial.",
      severity: "warning",
    });
  }

  // Odds completamente ausentes para este jogo
  if (missingOdds && !partialOdds) {
    risks.push({
      type: "MISSING_DATA",
      message: "Odds 1X2 indisponíveis ou incompletas no momento do snapshot.",
      severity: "warning",
    });
  }

  // Odds parciais (pelo menos uma presente, mas não todas as 3)
  if (partialOdds) {
    risks.push({
      type: "MISSING_DATA",
      message: "Odds 1X2 parciais; leitura de mercado rebaixada.",
      severity: "warning",
    });
  }

  // Dúvida de escalação
  if (!match.homeLineup || !match.awayLineup) {
    risks.push({
      type: "LINEUP_DOUBT",
      message: "Escalação confirmada ainda não disponível.",
      severity: "info",
    });
  }

  // Impacto de lesão
  if (match.homeInjuries?.length || match.awayInjuries?.length) {
    risks.push({
      type: "INJURY_IMPACT",
      message: `${match.homeTeam !== undefined ? "Mandante" : ""} ${match.awayTeam !== undefined ? "Visitante" : ""} com desfalques confirmados.`.trim(),
      severity: "warning",
    });
  }

  return risks;
}

function buildInsights(scored: any, breakdown: any, match: any): InsightBlock[] {
  const insights: InsightBlock[] = [];

  // MARKET insight
  insights.push({
    category: "MARKET",
    headline: `Odds disponíveis`,
    detail: `1: ${match.homeOdd?.toFixed(2) || "–"}, X: ${match.drawOdd?.toFixed(2) || "–"}, 2: ${match.awayOdd?.toFixed(2) || "–"}`,
    confidence: 85,
  });

  // FORM insight
  const homeFormStr = match.homeForm?.join("") || "SSSSS";
  const awayFormStr = match.awayForm?.join("") || "SSSSS";
  insights.push({
    category: "FORM",
    headline: `Forma recente`,
    detail: `${match.homeTeam}: ${homeFormStr} | ${match.awayTeam}: ${awayFormStr}`,
    confidence: breakdown?.recentFormWeight || 60,
  });

  // FIXTURE insight
  if (match.scheduledAt) {
    const date = new Date(match.scheduledAt);
    const day = date.toLocaleDateString("pt-BR", { weekday: "short" });
    const time = date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    insights.push({
      category: "FIXTURE",
      headline: `Agendamento`,
      detail: `${day} às ${time} (Brasília)`,
      confidence: 100,
    });
  }

  return insights;
}
