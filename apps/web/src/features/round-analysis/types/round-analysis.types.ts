/**
 * Contrato da feature "Análises da Rodada" (Radar BOB v2)
 * 
 * Arquitetura DB-first imutável:
 * - Snapshots persistidos por season+round+roundVersion+matchId
 * - Leitura da UI sempre do banco (sem chamada externa por F5 ou request)
 * - Geração de dados externa acontece 1x via job controlado (cron/admin)
 * - Valores "confidence" sempre 0-100 (%), nunca 0-1 na API
 * 
 * @see apps/web/prisma/schema.prisma — modelos bob_round_analysis, bob_match_analysis, etc.
 * @see apps/web/src/app/api/bob/round-analysis/route.ts — endpoint GET (read-only)
 */

// ─── Enumerações ──────────────────────────────────────────────────────

export type MatchStatus = "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | "CANCELLED";
export type RiskSeverity = "info" | "warning" | "error";
export type RiskType =
  | "MISSING_DATA"
  | "LOW_CONFIDENCE"
  | "LINEUP_DOUBT"
  | "INJURY_IMPACT"
  | "ODDS_MOVEMENT"
  | "MARKET_ANOMALY"
  | "WEATHER_IMPACT";

export type InsightCategory =
  | "MARKET"
  | "FORM"
  | "ODDS"
  | "LINEUP"
  | "FIXTURE"
  | "WEATHER"
  | "HEAD_TO_HEAD"
  | "TABLE_CONTEXT";

export type DataSourceType = "live" | "partial" | "cached" | "fallback";

// ─── Tipos estruturais ────────────────────────────────────────────────

/**
 * Alerta/risco associado a um jogo.
 * Exemplo: baixa confiança, dados faltando, dúvida de escalação.
 */
export interface RiskFlag {
  type: RiskType;
  message: string;
  severity: RiskSeverity; // "info" = notificação, "warning" = observar, "error" = bloqueador
}

/**
 * Bloco de insight sobre uma dimensão do jogo.
 * Exemplo: "Mercado mais curto pagando 1.50", "Equipe em forma descendente".
 */
export interface InsightBlock {
  category: InsightCategory;
  headline: string; // Título curto (< 60 chars)
  detail: string; // Detalhe/justificativa (< 150 chars)
  confidence: number; // 0-100 (%)
}

/**
 * Metadados de qualidade/cobertura dos dados da rodada.
 */
export interface DataFreshness {
  source: DataSourceType; // "live" = tudo pronto, "partial" = falta alguns dados, "fallback" = demo
  lastUpdateAt: string; // ISO 8601
  matchesCovered: number;
  matchesTotal: number;
  apiStatus: Record<string, "ok" | "partial" | "failed">; // ex: { "odds": "ok", "lineups": "partial" }
}

/**
 * Dados de um único jogo para exibir no card de análise.
 * Persistido em bob_match_analysis e bob_match_market_snapshot.
 */
export interface MatchAnalysisCardData {
  // Identificação
  id: string; // BetMatch UUID (chave primária no banco)
  matchId: string | null; // Fixture ID externo (api-football)
  homeTeam: string;
  awayTeam: string;
  homeBadgeUrl?: string | null;
  awayBadgeUrl?: string | null;

  // Agendamento e status do jogo
  scheduledAt: string; // ISO 8601
  status: MatchStatus;
  homeScore?: number | null;
  awayScore?: number | null;

  // Análise BOB
  confidence: number; // 0-100 (%) — escala de confiança geral do jogo
  recommendation: string; // 1-2 frases recomendando ação ou ressalva
  riskFlags: RiskFlag[]; // Alertas associados a este jogo
  insightBlocks: InsightBlock[]; // Blocos de insight sobre dimensões do jogo

  // Odds de mercado (snapshot do momento do snapshot)
  odds?: {
    home?: number;
    draw?: number;
    away?: number;
  };

  // UI state (não persistido, preenchido no client)
  isExpanded?: boolean;
}

/**
 * Resposta do endpoint GET /api/bob/round-analysis.
 * Envelope contendo todos os dados analíticos da rodada.
 */
export interface RoundAnalysisEnvelope {
  // Identificação da rodada
  season: number;
  round: number;
  roundVersion: number; // Versão do snapshot (incrementa ao regenerar)

  // Dados
  matches: MatchAnalysisCardData[];

  // Metadados
  loadedAt: string; // ISO 8601 — quando foi carregado do banco para esta resposta
  coverage: DataFreshness;

  // Resumo da rodada
  summary: {
    totalMatches: number;
    averageConfidence: number; // 0-100 (%)
    highConfidenceCount: number; // Matches com conf >= 70
    riskFlags: RiskFlag[]; // Riscos globais da rodada (ex: cobertura parcial)
  };
}

/**
 * Payload para POST /api/bob/round-analysis/snapshot (gerar novo snapshot).
 * Somente acessível via CRON_SECRET ou autenticação admin.
 */
export interface GenerateRoundAnalysisRequest {
  season: number;
  round: number;
  force?: boolean; // true = regenera mesmo se versão atual estiver completa
}

export interface GenerateRoundAnalysisResponse {
  success: boolean;
  season: number;
  round: number;
  roundVersion: number;
  matchesAnalyzed: number;
  message?: string;
  error?: string;
}
