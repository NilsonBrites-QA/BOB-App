/**
 * Zod schemas para validação em runtime da feature "Análises da Rodada".
 */

import { z } from "zod";
import type {
  RoundAnalysisEnvelope,
  MatchAnalysisCardData,
  RiskFlag,
  InsightBlock,
  DataFreshness,
} from "./round-analysis.types";

export const DataSourceTypeSchema = z.enum(["live", "partial", "cached", "fallback"]);
export const MatchStatusSchema = z.enum(["SCHEDULED", "LIVE", "FINISHED", "POSTPONED", "CANCELLED"]);
export const RiskTypeSchema = z.enum([
  "MISSING_DATA",
  "LOW_CONFIDENCE",
  "LINEUP_DOUBT",
  "INJURY_IMPACT",
  "ODDS_MOVEMENT",
  "MARKET_ANOMALY",
  "WEATHER_IMPACT",
]);
export const RiskSeveritySchema = z.enum(["info", "warning", "error"]);
export const InsightCategorySchema = z.enum([
  "MARKET",
  "FORM",
  "ODDS",
  "LINEUP",
  "FIXTURE",
  "WEATHER",
  "HEAD_TO_HEAD",
  "TABLE_CONTEXT",
]);

export const RiskFlagSchema = z.object({
  type: RiskTypeSchema,
  message: z.string(),
  severity: RiskSeveritySchema,
}) satisfies z.ZodType<RiskFlag>;

export const InsightBlockSchema = z.object({
  category: InsightCategorySchema,
  headline: z.string(),
  detail: z.string(),
  confidence: z.number().min(0).max(100),
}) satisfies z.ZodType<InsightBlock>;

 export const ApiStatusValueSchema = z.enum(["ok", "partial", "failed"]);

 export const DataFreshnessSchema = z.object({
  source: DataSourceTypeSchema,
  lastUpdateAt: z.string().datetime(),
  matchesCovered: z.number().int().nonnegative(),
  matchesTotal: z.number().int().positive(),
 apiStatus: z.record(z.string(), ApiStatusValueSchema),
}) satisfies z.ZodType<DataFreshness>;

export const MatchAnalysisCardDataSchema = z.object({
  id: z.string(),
  matchId: z.string().nullable(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  homeBadgeUrl: z.string().nullable().optional(),
  awayBadgeUrl: z.string().nullable().optional(),
  scheduledAt: z.string().datetime(),
  status: MatchStatusSchema,
  homeScore: z.number().nullable().optional(),
  awayScore: z.number().nullable().optional(),
  confidence: z.number().min(0).max(100),
  recommendation: z.string(),
  riskFlags: z.array(RiskFlagSchema),
  insightBlocks: z.array(InsightBlockSchema),
  odds: z.object({
    home: z.number().optional(),
    draw: z.number().optional(),
    away: z.number().optional(),
  }).optional(),
  isExpanded: z.boolean().optional(),
}) satisfies z.ZodType<MatchAnalysisCardData>;

export const RoundAnalysisEnvelopeSchema = z.object({
  season: z.number().int(),
  round: z.number().int().positive(),
  roundVersion: z.number().int().nonnegative(),
  matches: z.array(MatchAnalysisCardDataSchema),
  loadedAt: z.string().datetime(),
  coverage: DataFreshnessSchema,
  summary: z.object({
    totalMatches: z.number().int().nonnegative(),
    averageConfidence: z.number().min(0).max(100),
    highConfidenceCount: z.number().int().nonnegative(),
    riskFlags: z.array(RiskFlagSchema),
  }),
}) satisfies z.ZodType<RoundAnalysisEnvelope>;
