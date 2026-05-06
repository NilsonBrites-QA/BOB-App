import { devig } from "@/lib/bob/engine/devigging";
import type { MatchInput, ScoredMatch } from "@/lib/bob/engine/scoring";
import { scoreMatch } from "@/lib/bob/engine/scoring";
import type { MatchIntelligence } from "./match-intelligence";

export type AnalyticsAnchorCandidate = ScoredMatch & {
  anchorRank: number;
  isAnchor: boolean;
  anchorScore: number;
  pW: number;
  gap: number;
  entropy: number;
  marketDivergence: number;
  injuryRobustness: number;
  finalScore: number;
  confidence: number;
  reason: string;
  sourceSnapshotIds: string[];
};

export type AnalyticsAnchorSelection = {
  anchors: AnalyticsAnchorCandidate[];
  allRanked: AnalyticsAnchorCandidate[];
  meta: {
    round: number | null;
    totalMatches: number;
    anchorCount: number;
    selectionMode: "primary" | "fallback";
    generatedAt: string;
  };
};

const WEIGHTS = {
  pW: 1.0,
  gap: 0.8,
  entropy: 0.5,
  injury: 1.2,
  divergence: 0.5,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function entropy3(a: number, b: number, c: number) {
  const safe = (v: number) => Math.max(v, 1e-9);
  return -(safe(a) * Math.log(safe(a)) + safe(b) * Math.log(safe(b)) + safe(c) * Math.log(safe(c))) / Math.log(3);
}

function mapById(intelligence: MatchIntelligence[]) {
  return new Map(intelligence.map((item) => [item.matchId, item]));
}

export function calculateAnalyticsAnchorScore(args: {
  matches: MatchInput[];
  intelligence: MatchIntelligence[];
  round?: number | null;
}): AnalyticsAnchorSelection {
  const intelligenceById = mapById(args.intelligence);

  const ranked = args.matches.flatMap((match) => {
    const scored = scoreMatch(match);
    const intel = intelligenceById.get(match.id);
    const devigged = devig({ homeOdd: match.homeOdd, drawOdd: match.drawOdd, awayOdd: match.awayOdd });
    if (!intel || intel.confidence <= 0 || !devigged.ok) return [];
    if (
      typeof intel.probabilities.homeWin !== "number" ||
      typeof intel.probabilities.draw !== "number" ||
      typeof intel.probabilities.awayWin !== "number"
    ) return [];

    const pHome = devigged.pHome;
    const pDraw = devigged.pDraw;
    const pAway = devigged.pAway;
    const probs = [pHome, pDraw, pAway].sort((a, b) => b - a);
    const gap = clamp((probs[0] ?? 0) - (probs[1] ?? 0), 0, 1);
    const entropy = entropy3(pHome, pDraw, pAway);
    const pW = clamp(intel.probabilities.homeWin, 0, 1);
    const marketDivergence = Math.abs(pW - pHome);
    const injuryDelta = clamp(Math.max(match.homeAbsenceRate ?? 0, match.awayAbsenceRate ?? 0), 0, 1);
    const injuryRobustness = clamp(1 - injuryDelta, 0, 1);
    const anchorScore =
      WEIGHTS.pW * pW +
      WEIGHTS.gap * gap -
      WEIGHTS.entropy * entropy -
      WEIGHTS.injury * injuryDelta -
      WEIGHTS.divergence * marketDivergence;
    const confidence = clamp((intel?.confidence ?? scored.score) - entropy * 12 - marketDivergence * 20, 0, 95);

    return {
      ...scored,
      anchorRank: 0,
      isAnchor: false,
      anchorScore,
      pW,
      gap,
      entropy,
      marketDivergence,
      injuryRobustness,
      finalScore: anchorScore,
      confidence,
      reason: `Score por pW ${(pW * 100).toFixed(1)}%, gap ${(gap * 100).toFixed(1)}%, entropia ${(entropy * 100).toFixed(1)}% e divergência mercado ${(marketDivergence * 100).toFixed(1)}%.`,
      sourceSnapshotIds: intel.sourceSnapshotIds,
    } satisfies AnalyticsAnchorCandidate;
  }).sort((a, b) => b.anchorScore - a.anchorScore);

  const allRanked = ranked.map((item, index) => ({ ...item, anchorRank: index + 1, isAnchor: index < 4 }));
  const anchors = allRanked.slice(0, 4).map((item) => ({ ...item, isAnchor: true }));

  return {
    anchors,
    allRanked,
    meta: {
      round: args.round ?? null,
      totalMatches: args.matches.length,
      anchorCount: anchors.length,
      selectionMode: anchors.length >= 4 ? "primary" : "fallback",
      generatedAt: new Date().toISOString(),
    },
  };
}
