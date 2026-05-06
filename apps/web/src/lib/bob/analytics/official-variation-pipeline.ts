import { recordMemoryEvent } from "@/lib/data/data-gateway";
import { generateVariations as generateBeamSearchVariations } from "@/lib/bob/engine/beam-search";
import type { AnchorSelectionResult as BeamAnchorSelectionResult } from "@/lib/bob/engine/anchor-score";
import type { MatchInput } from "@/lib/bob/engine/scoring";
import type { DataGatewaySource } from "@/lib/data/data-gateway";
import { isForbiddenForOfficialGeneration, type OfficialDataSource } from "@/lib/bob/data/source-policy";
import { buildMatchFeatures } from "./feature-builder";
import { createMatchIntelligence } from "./match-intelligence";
import { calculateAnalyticsAnchorScore } from "./anchor-score";

const ENGINE_VERSION = "official-variations-v2";
const GENERATION_VERSION = "big-odds-official-v2";
const VALID_SOURCES = ["api", "database", "db", "cache", "cache_hit", "persisted_snapshot", "stale_valid", "stale"];

export type OfficialVariationPipelineResult = {
  ok: boolean;
  status: "generated" | "insufficient_data";
  source: DataGatewaySource | string;
  anchors: ReturnType<typeof calculateAnalyticsAnchorScore>["anchors"];
  anchorSelection: ReturnType<typeof calculateAnalyticsAnchorScore> | null;
  variationsResult: ReturnType<typeof generateBeamSearchVariations> | null;
  dataCoverageScore: number;
  confidencePenalty: number;
  missingFeatures: string[];
  sourceSnapshotIds: string[];
  engineVersion: typeof ENGINE_VERSION;
  generationVersion: typeof GENERATION_VERSION;
  snapshot: Record<string, unknown> | null;
  reason?: string;
};

function formatCoverage(value: number) {
  return Math.round(value * 1000) / 1000;
}

function buildVariationSnapshot(
  variationsResult: ReturnType<typeof generateBeamSearchVariations>,
  anchorSelection: ReturnType<typeof calculateAnalyticsAnchorScore>,
  featureCoverageByMatch: Map<string, { dataCoverageScore: number; missingFeatures: string[] }>,
) {
  const anchorsById = new Map(anchorSelection.anchors.map((anchor) => [anchor.id, anchor]));

  return variationsResult.variations.map((variation) => {
    const coverages = variation.legs
      .map((leg) => featureCoverageByMatch.get(leg.matchId)?.dataCoverageScore)
      .filter((value): value is number => typeof value === "number");
    const dataCoverage = coverages.length > 0
      ? coverages.reduce((sum, value) => sum + value, 0) / coverages.length
      : 0;
    const anchors = variation.legs
      .filter((leg) => leg.isAnchor)
      .map((leg) => ({
        matchId: leg.matchId,
        outcome: leg.pickOutcome,
        primary: anchorsById.get(leg.matchId)?.suggestedResult === (leg.pickOutcome === "Home" ? "1" : leg.pickOutcome === "Away" ? "2" : "X"),
      }));
    const hedges = anchors.filter((anchor) => !anchor.primary);
    const calculatedUnderdogs = variation.legs
      .filter((leg) => !leg.isAnchor && (leg.pickOutcome === "Away" || leg.cleanProb < 0.34))
      .map((leg) => ({ matchId: leg.matchId, outcome: leg.pickOutcome, cleanProb: leg.cleanProb, odd: leg.pickOdd }));
    const missing = variation.legs.flatMap((leg) => featureCoverageByMatch.get(leg.matchId)?.missingFeatures ?? []);
    const riskFlags = [
      ...new Set([
        ...variation.transparencyNotes,
        ...(variation.oddsClass === "big-odds" ? [] : [`odds_class_${variation.oddsClass}`]),
        ...(dataCoverage < 0.6 ? ["low_feature_coverage"] : []),
        ...(missing.length > 0 ? ["missing_features_present"] : []),
      ]),
    ];

    return {
      id: variation.id,
      method: "beam_search",
      combinedOdd: variation.combinedOdd,
      logCombinedOdd: variation.logCombinedOdd,
      estimatedProbability: variation.probabilityMass,
      probabilityMass: variation.probabilityMass,
      variationScore: variation.probabilityMass * Math.log(Math.max(variation.combinedOdd, 1)),
      legCount: variation.legCount,
      anchorPrimaryCount: variation.anchorPrimaryCount,
      oddsClass: variation.oddsClass,
      individualOdds: variation.legs.map((leg) => ({ matchId: leg.matchId, outcome: leg.pickOutcome, odd: leg.pickOdd, fairOdd: leg.fairOdd, cleanProb: leg.cleanProb })),
      anchors,
      hedges,
      calculatedUnderdogs,
      riskFlags,
      dataCoverage: formatCoverage(dataCoverage),
    };
  });
}

function buildSnapshot(args: {
  round?: number | null;
  source: string;
  sourceSnapshotIds: string[];
  featureResult: ReturnType<typeof buildMatchFeatures>;
  anchorSelection: ReturnType<typeof calculateAnalyticsAnchorScore>;
  variationsResult: ReturnType<typeof generateBeamSearchVariations>;
}) {
  const featureCoverageByMatch = new Map(args.featureResult.features.map((feature) => [
    feature.matchId,
    { dataCoverageScore: feature.dataCoverageScore, missingFeatures: feature.missingFeatures },
  ]));
  const anchors = args.anchorSelection.anchors.map((anchor) => ({
    matchId: anchor.id,
    teamId: anchor.homeTeam,
    probabilityWin: anchor.pW,
    gap: anchor.gap,
    entropy: anchor.entropy,
    marketDivergence: anchor.marketDivergence,
    injuryRobustness: anchor.injuryRobustness,
    finalScore: anchor.finalScore,
    confidence: anchor.confidence,
    reason: anchor.reason,
    sourceSnapshotIds: anchor.sourceSnapshotIds,
  }));
  const variations = buildVariationSnapshot(args.variationsResult, args.anchorSelection, featureCoverageByMatch);
  const riskFlags = [
    ...new Set([
      ...args.featureResult.missingFeatures.map((feature) => `missing:${feature}`),
      ...args.variationsResult.meta.warnings,
    ]),
  ];

  return {
    roundId: args.round ?? null,
    generatedAt: args.variationsResult.meta.generatedAt,
    generationVersion: GENERATION_VERSION,
    dataSourcePolicy: {
      source: args.source,
      validSources: VALID_SOURCES,
      forbiddenSources: ["demo", "mock", "fallback_fake", "synthetic", "empty", "insufficient"],
      confidencePenalty: args.featureResult.confidencePenalty,
    },
    sourceSnapshotIds: args.sourceSnapshotIds,
    anchors,
    variations,
    oddsSnapshots: args.featureResult.features.flatMap((feature) => feature.features.oddsSnapshots?.value ?? []),
    featureCoverage: args.featureResult.features.map((feature) => ({
      matchId: feature.matchId,
      dataCoverageScore: formatCoverage(feature.dataCoverageScore),
      missingFeatures: feature.missingFeatures,
    })),
    riskFlags,
    engineVersion: ENGINE_VERSION,
    explanation: `Variações geradas por Feature Builder, Match Intelligence, Anchor Score e Beam Search com cobertura média ${formatCoverage(args.featureResult.dataCoverageScore)}.`,
    status: "generated",
  };
}

export async function buildOfficialVariationsPipeline(args: {
  matches: MatchInput[];
  source: OfficialDataSource;
  round?: number | null;
  sourceSnapshotIds?: string[];
}): Promise<OfficialVariationPipelineResult> {
  const source = String(args.source ?? "insufficient");
  const receivedRound = args.round ?? null;
  const block = async (
    reason: string,
    extra?: {
      anchors?: ReturnType<typeof calculateAnalyticsAnchorScore>["anchors"];
      anchorSelection?: ReturnType<typeof calculateAnalyticsAnchorScore> | null;
      dataCoverageScore?: number;
      confidencePenalty?: number;
      missingFeatures?: string[];
      sourceSnapshotIds?: string[];
      logReason?: "insufficient_data" | "missing_round_dataset" | "invalid_round_context";
    },
  ): Promise<OfficialVariationPipelineResult> => {
    const missing = extra?.missingFeatures ?? ["valid_real_source"];
    if (extra?.logReason === "invalid_round_context") {
      console.warn(`[BOB/Variacoes] blocked reason=invalid_round_context received_round=${receivedRound ?? "missing"}`);
    } else if (extra?.logReason === "missing_round_dataset") {
      console.warn(`[BOB/Variacoes] blocked reason=missing_round_dataset round=${args.round ?? "unknown"}`);
    } else {
      console.warn(`[BOB/Variacoes] blocked reason=insufficient_data missing=${missing.join(",")} round=${args.round ?? "unknown"} detail=${reason}`);
    }
    await recordMemoryEvent("OFFICIAL_VARIATIONS_BLOCKED_INSUFFICIENT_DATA", {
      round: args.round,
      source,
      status: "insufficient_data",
      reason,
      missingFeatures: missing,
      logReason: extra?.logReason ?? "insufficient_data",
      engineVersion: ENGINE_VERSION,
      generationVersion: GENERATION_VERSION,
    }, source);
    return {
      ok: false,
      status: "insufficient_data",
      source,
      anchors: extra?.anchors ?? [],
      anchorSelection: extra?.anchorSelection ?? null,
      variationsResult: null,
      dataCoverageScore: extra?.dataCoverageScore ?? 0,
      confidencePenalty: extra?.confidencePenalty ?? 1,
      missingFeatures: missing,
      sourceSnapshotIds: extra?.sourceSnapshotIds ?? args.sourceSnapshotIds ?? [],
      engineVersion: ENGINE_VERSION,
      generationVersion: GENERATION_VERSION,
      snapshot: null,
      reason,
    };
  };

  if (!Number.isInteger(args.round) || Number(args.round) < 1 || Number(args.round) > 38) {
    return block("invalid_round_context", {
      missingFeatures: ["valid_round_context"],
      logReason: "invalid_round_context",
    });
  }

  if (isForbiddenForOfficialGeneration(source)) {
    return block(`invalid-source:${source}`, { missingFeatures: ["valid_real_source"] });
  }

  if (args.matches.length === 0) {
    return block("missing_round_dataset", {
      missingFeatures: ["round_dataset"],
      logReason: "missing_round_dataset",
    });
  }

  const featureResult = buildMatchFeatures({ matches: args.matches, source, sourceSnapshotIds: args.sourceSnapshotIds });
  console.info(`[BOB/Variacoes] engine=feature_builder matches=${args.matches.length} coverage=${formatCoverage(featureResult.dataCoverageScore)} round=${args.round ?? "unknown"}`);
  await recordMemoryEvent("FEATURE_BUILT", {
    round: args.round,
    source,
    matches: args.matches.length,
    dataCoverageScore: featureResult.dataCoverageScore,
    missingFeatures: featureResult.missingFeatures,
  }, source);

  if (!featureResult.ok) {
    return block(featureResult.reason ?? "feature-builder-insufficient", {
      dataCoverageScore: featureResult.dataCoverageScore,
      confidencePenalty: featureResult.confidencePenalty,
      missingFeatures: featureResult.missingFeatures,
      sourceSnapshotIds: featureResult.sourceSnapshotIds,
    });
  }

  const intelligence = createMatchIntelligence(featureResult.features);
  const avgConfidence = intelligence.items.length > 0
    ? intelligence.items.reduce((sum, item) => sum + item.confidence, 0) / intelligence.items.length
    : 0;
  console.info(`[BOB/Variacoes] engine=match_intelligence matches=${intelligence.items.length} avg_confidence=${formatCoverage(avgConfidence)} round=${args.round ?? "unknown"}`);
  await recordMemoryEvent("MATCH_INTELLIGENCE_CREATED", {
    round: args.round,
    source,
    matches: intelligence.items.length,
    avgConfidence,
    actionable: intelligence.items.filter((item) => item.recommendedMarkets.length > 0).length,
  }, source);

  if (!intelligence.ok) {
    return block(intelligence.reason ?? "match-intelligence-insufficient", {
      dataCoverageScore: featureResult.dataCoverageScore,
      confidencePenalty: featureResult.confidencePenalty,
      missingFeatures: featureResult.missingFeatures,
      sourceSnapshotIds: featureResult.sourceSnapshotIds,
    });
  }

  const anchorSelection = calculateAnalyticsAnchorScore({ matches: args.matches, intelligence: intelligence.items, round: args.round });
  await recordMemoryEvent("ANCHOR_SCORE_CALCULATED", {
    round: args.round,
    source,
    candidates: anchorSelection.allRanked.length,
    method: "anchor_score",
    ranked: anchorSelection.allRanked.map((anchor) => ({
      matchId: anchor.id,
      pW: anchor.pW,
      gap: anchor.gap,
      entropy: anchor.entropy,
      injuryRobustness: anchor.injuryRobustness,
      marketDivergence: anchor.marketDivergence,
      finalScore: anchor.finalScore,
      confidence: anchor.confidence,
      sourceSnapshotIds: anchor.sourceSnapshotIds,
    })),
  }, source);
  await recordMemoryEvent("ANCHORS_SELECTED", {
    round: args.round,
    source,
    method: "anchor_score",
    anchors: anchorSelection.anchors.map((anchor) => ({
      matchId: anchor.id,
      teamId: anchor.homeTeam,
      probabilityWin: anchor.pW,
      gap: anchor.gap,
      entropy: anchor.entropy,
      marketDivergence: anchor.marketDivergence,
      injuryRobustness: anchor.injuryRobustness,
      finalScore: anchor.finalScore,
      confidence: anchor.confidence,
      reason: anchor.reason,
      sourceSnapshotIds: anchor.sourceSnapshotIds,
    })),
  }, source);
  console.info(`[BOB/Variacoes] anchors_selected count=${anchorSelection.anchors.length} method=anchor_score round=${args.round ?? "unknown"}`);

  if (anchorSelection.anchors.length < 4) {
    return block("insufficient-anchor-count", {
      anchors: anchorSelection.anchors,
      anchorSelection,
      dataCoverageScore: featureResult.dataCoverageScore,
      confidencePenalty: featureResult.confidencePenalty,
      missingFeatures: featureResult.missingFeatures,
      sourceSnapshotIds: featureResult.sourceSnapshotIds,
    });
  }

  const variationsResult = generateBeamSearchVariations(
    anchorSelection as unknown as BeamAnchorSelectionResult,
    args.matches,
  );
  const invalidVariations = variationsResult.variations.filter((variation) => variation.oddsClass !== "big-odds" || variation.legCount < 5);
  const fingerprints = variationsResult.variations.map((variation) =>
    variation.legs.map((leg) => `${leg.matchId}:${leg.pickOutcome}`).sort().join("|"),
  );
  const hasDuplicateTickets = new Set(fingerprints).size !== fingerprints.length;
  if (variationsResult.variations.length !== 5 || invalidVariations.length > 0 || hasDuplicateTickets) {
    const reason = variationsResult.variations.length !== 5
      ? "variation-count-not-five"
      : hasDuplicateTickets
        ? "beam-search-duplicate-ticket"
        : "beam-search-insufficient-big-odds";
    return block(reason, {
      anchors: anchorSelection.anchors,
      anchorSelection,
      dataCoverageScore: featureResult.dataCoverageScore,
      confidencePenalty: featureResult.confidencePenalty,
      missingFeatures: [
        ...featureResult.missingFeatures,
        ...invalidVariations.map((variation) => `${variation.id}:${variation.oddsClass}`),
        ...(hasDuplicateTickets ? ["duplicate_tickets"] : []),
      ],
      sourceSnapshotIds: featureResult.sourceSnapshotIds,
    });
  }

  const snapshot = buildSnapshot({
    round: args.round,
    source,
    sourceSnapshotIds: featureResult.sourceSnapshotIds,
    featureResult,
    anchorSelection,
    variationsResult,
  });
  await recordMemoryEvent("VARIATIONS_GENERATED", {
    round: args.round,
    source,
    method: "beam_search",
    engineVersion: ENGINE_VERSION,
    generationVersion: GENERATION_VERSION,
    variations: variationsResult.variations.length,
    anchorIds: anchorSelection.anchors.map((anchor) => anchor.id),
    dataCoverageScore: featureResult.dataCoverageScore,
    snapshot,
  }, source);
  console.info(`[BOB/Variacoes] variations_generated count=${variationsResult.variations.length} method=beam_search round=${args.round ?? "unknown"}`);

  return {
    ok: true,
    status: "generated",
    source,
    anchors: anchorSelection.anchors,
    anchorSelection,
    variationsResult,
    dataCoverageScore: featureResult.dataCoverageScore,
    confidencePenalty: featureResult.confidencePenalty,
    missingFeatures: featureResult.missingFeatures,
    sourceSnapshotIds: featureResult.sourceSnapshotIds,
    engineVersion: ENGINE_VERSION,
    generationVersion: GENERATION_VERSION,
    snapshot,
  };
}
