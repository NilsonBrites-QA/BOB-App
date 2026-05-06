import { recordMemoryEvent } from "@/lib/data/data-gateway";
import type { MatchInput } from "@/lib/bob/engine/scoring";
import { LEVERAGE_BASE_STAKE, LEVERAGE_ODD_MAX, LEVERAGE_ODD_MIN, LEVERAGE_TOTAL_STEPS, calculateStake } from "@/lib/bob/engine/leverage";
import { isForbiddenForOfficialGeneration, type OfficialDataSource } from "@/lib/bob/data/source-policy";
import { rankBetOpportunities, type RankedBetOpportunity } from "@/lib/bob/analytics/bet-ranking";

export type LeverageEngineDecision = {
  selectedPick: RankedBetOpportunity;
  market: string;
  odd: number;
  probability: number;
  confidence: number;
  reason: string;
  supportingStats: string[];
  riskFlags: string[];
  dataCoverageScore: number;
  step: number;
  stakePlan: {
    stake: number;
    projectedPayout: number;
    totalSteps: number;
    baseStake: number;
  };
  resetRule: "RED_RESET_TO_STEP_1";
};

export type LeverageEngineResult = {
  ok: boolean;
  decision: LeverageEngineDecision | null;
  reason?: string;
};

export async function createLeveragePick(args: {
  matches: MatchInput[];
  source: OfficialDataSource;
  step: number;
  sourceSnapshotIds?: string[];
}): Promise<LeverageEngineResult> {
  const source = String(args.source ?? "insufficient");
  if (isForbiddenForOfficialGeneration(source)) {
    await recordMemoryEvent("LEVERAGE_PICK_BLOCKED", { source, step: args.step, reason: "invalid-source" }, source);
    return { ok: false, decision: null, reason: `invalid-source:${source}` };
  }

  const ranking = await rankBetOpportunities({ matches: args.matches, source, sourceSnapshotIds: args.sourceSnapshotIds });
  if (!ranking.ok) return { ok: false, decision: null, reason: ranking.reason };

  const candidates = ranking.opportunities
    .filter((item) => item.odd >= LEVERAGE_ODD_MIN && item.odd <= LEVERAGE_ODD_MAX)
    .filter((item) => item.dataCoverageScore >= 0.55)
    .sort((a, b) => b.probability * b.confidence - a.probability * a.confidence);

  const selectedPick = candidates[0];
  if (!selectedPick) return { ok: false, decision: null, reason: "no-low-risk-pick-in-target-odd" };

  const stake = calculateStake(args.step);
  const decision: LeverageEngineDecision = {
    selectedPick,
    market: selectedPick.market,
    odd: selectedPick.odd,
    probability: selectedPick.probability,
    confidence: selectedPick.confidence,
    reason: selectedPick.reason,
    supportingStats: selectedPick.supportingStats,
    riskFlags: selectedPick.riskFlags,
    dataCoverageScore: selectedPick.dataCoverageScore,
    step: args.step,
    stakePlan: {
      stake,
      projectedPayout: Number((stake * selectedPick.odd).toFixed(2)),
      totalSteps: LEVERAGE_TOTAL_STEPS,
      baseStake: LEVERAGE_BASE_STAKE,
    },
    resetRule: "RED_RESET_TO_STEP_1",
  };

  await recordMemoryEvent("LEVERAGE_PICK_CREATED", {
    source,
    step: args.step,
    matchId: selectedPick.matchId,
    market: selectedPick.market,
    odd: selectedPick.odd,
    probability: selectedPick.probability,
    confidence: selectedPick.confidence,
    dataCoverageScore: selectedPick.dataCoverageScore,
  }, source);

  return { ok: true, decision };
}
