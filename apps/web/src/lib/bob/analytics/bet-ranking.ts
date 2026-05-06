import { recordMemoryEvent } from "@/lib/data/data-gateway";
import type { MatchInput } from "@/lib/bob/engine/scoring";
import { isForbiddenForOfficialGeneration, type OfficialDataSource } from "@/lib/bob/data/source-policy";
import { buildMatchFeatures } from "./feature-builder";
import { createMatchIntelligence, type MarketRecommendation } from "./match-intelligence";

export type RankedBetOpportunity = MarketRecommendation & {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  score: number;
  dataCoverageScore: number;
  sourceSnapshotIds: string[];
};

export type BetRankingResult = {
  ok: boolean;
  opportunities: RankedBetOpportunity[];
  reason?: string;
};

export async function rankBetOpportunities(args: {
  matches: MatchInput[];
  source: OfficialDataSource;
  sourceSnapshotIds?: string[];
}): Promise<BetRankingResult> {
  const source = String(args.source ?? "insufficient");
  if (isForbiddenForOfficialGeneration(source)) {
    await recordMemoryEvent("BET_CREATION_BLOCKED", { source, reason: "invalid-source" }, source);
    return { ok: false, opportunities: [], reason: `invalid-source:${source}` };
  }

  const featureResult = buildMatchFeatures({ matches: args.matches, source, sourceSnapshotIds: args.sourceSnapshotIds });
  if (!featureResult.ok) return { ok: false, opportunities: [], reason: featureResult.reason ?? "feature-builder-insufficient" };

  const intelligence = createMatchIntelligence(featureResult.features);
  if (!intelligence.ok) return { ok: false, opportunities: [], reason: intelligence.reason ?? "match-intelligence-insufficient" };

  const opportunities = intelligence.items.flatMap((item) =>
    item.recommendedMarkets.map((market) => ({
      ...market,
      matchId: item.matchId,
      homeTeam: item.homeTeam,
      awayTeam: item.awayTeam,
      dataCoverageScore: item.dataCoverageScore,
      sourceSnapshotIds: item.sourceSnapshotIds,
      score: market.probability * 100 + market.confidence + item.dataCoverageScore * 20 - market.riskFlags.length * 5,
    })),
  ).sort((a, b) => b.score - a.score);

  await recordMemoryEvent("BET_CREATED", {
    source,
    opportunities: opportunities.length,
    top: opportunities.slice(0, 5).map((item) => ({ matchId: item.matchId, market: item.market, probability: item.probability, confidence: item.confidence })),
  }, source);

  return { ok: opportunities.length > 0, opportunities, reason: opportunities.length > 0 ? undefined : "no-ranked-opportunities" };
}
