import type { MatchInput } from "@/lib/bob/engine/scoring";
import { confidencePenaltyForSource, isForbiddenForOfficialGeneration, type OfficialDataSource } from "@/lib/bob/data/source-policy";

export type FeatureValue<T> = {
  value: T;
  status: "real" | "stale_valid";
  source: string;
};

export type MatchFeatures = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  features: {
    last5?: FeatureValue<{ home: string[]; away: string[] }>;
    last10?: FeatureValue<{ home: string[]; away: string[] }>;
    homeAtHomePoints?: FeatureValue<number>;
    awayAtAwayPoints?: FeatureValue<number>;
    goalsLast5?: FeatureValue<{ homeFor: number; homeAgainst: number; awayFor: number; awayAgainst: number }>;
    goalsByHalf?: FeatureValue<{
      homeFirstHalfFor: number;
      homeFirstHalfAgainst: number;
      homeSecondHalfFor: number;
      homeSecondHalfAgainst: number;
      awayFirstHalfFor: number;
      awayFirstHalfAgainst: number;
      awaySecondHalfFor: number;
      awaySecondHalfAgainst: number;
    }>;
    shots?: FeatureValue<{ homeFor: number; homeAgainst: number; awayFor: number; awayAgainst: number }>;
    shotsOnTarget?: FeatureValue<{ homeFor: number; homeAgainst: number; awayFor: number; awayAgainst: number }>;
    corners?: FeatureValue<{ homeFor: number; homeAgainst: number; awayFor: number; awayAgainst: number }>;
    cards?: FeatureValue<{ homeFor: number; homeAgainst: number; awayFor: number; awayAgainst: number }>;
    absences?: FeatureValue<{ homeRate: number; awayRate: number }>;
    homeField?: FeatureValue<boolean>;
    restCalendar?: FeatureValue<{ homeBigGameAhead: boolean; awayBigGameAhead: boolean }>;
    odds1x2?: FeatureValue<{ homeOdd: number; drawOdd: number; awayOdd: number; homeOddDropped: boolean }>;
    oddsSnapshots?: FeatureValue<Array<{ market: "RESULT_1X2"; homeOdd: number; drawOdd: number; awayOdd: number; sourceSnapshotIds: string[] }>>;
    tableContext?: FeatureValue<{ homePosition: number; awayPosition: number; homeNeedsWin: boolean; awayNeedsWin: boolean }>;
    momentum?: FeatureValue<{ home?: number; away?: number }>;
    contextualFlags?: FeatureValue<{ isClassico?: boolean; weatherRain?: boolean; weatherIntensity?: string }>;
  };
  missingFeatures: string[];
  dataCoverageScore: number;
  sourceSnapshotIds: string[];
  confidencePenalty: number;
  source: string;
};

export type FeatureBuilderResult = {
  ok: boolean;
  features: MatchFeatures[];
  missingFeatures: string[];
  dataCoverageScore: number;
  sourceSnapshotIds: string[];
  confidencePenalty: number;
  reason?: string;
};

function hasNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasValidOdds(match: MatchInput) {
  return match.homeOdd > 1 && match.drawOdd > 1 && match.awayOdd > 1;
}

function readNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (hasNumber(value)) return value;
  }
  return undefined;
}

function featureStatus(source: string): "real" | "stale_valid" {
  return source === "stale" || source === "stale_valid" ? "stale_valid" : "real";
}

export function buildMatchFeatures(args: {
  matches: MatchInput[];
  source: OfficialDataSource;
  sourceSnapshotIds?: string[];
}): FeatureBuilderResult {
  const source = String(args.source ?? "insufficient");
  if (isForbiddenForOfficialGeneration(source)) {
    return {
      ok: false,
      features: [],
      missingFeatures: ["valid_real_source"],
      dataCoverageScore: 0,
      sourceSnapshotIds: args.sourceSnapshotIds ?? [],
      confidencePenalty: 1,
      reason: `invalid-source:${source}`,
    };
  }

  const status = featureStatus(source);
  const allMissing = new Set<string>();
  const sourceSnapshotIds = args.sourceSnapshotIds ?? [`round-source:${source}`];

  const features = args.matches.map((match) => {
    const missing: string[] = [];
    const raw = match as unknown as Record<string, unknown>;
    const out: MatchFeatures = {
      matchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      features: {},
      missingFeatures: missing,
      dataCoverageScore: 0,
      sourceSnapshotIds,
      confidencePenalty: confidencePenaltyForSource(source),
      source,
    };

    if (Array.isArray(match.homeForm) && Array.isArray(match.awayForm) && match.homeForm.length > 0 && match.awayForm.length > 0) {
      out.features.last5 = { value: { home: match.homeForm.slice(0, 5), away: match.awayForm.slice(0, 5) }, status, source };
    } else missing.push("last5");

    if (Array.isArray(match.homeForm10) && Array.isArray(match.awayForm10) && match.homeForm10.length > 0 && match.awayForm10.length > 0) {
      out.features.last10 = { value: { home: match.homeForm10.slice(0, 10), away: match.awayForm10.slice(0, 10) }, status, source };
    } else missing.push("last10");

    if (hasNumber(match.homeHomePoints)) out.features.homeAtHomePoints = { value: match.homeHomePoints, status, source };
    else missing.push("home_home_points");

    if (hasNumber(match.awayAwayPoints)) out.features.awayAtAwayPoints = { value: match.awayAwayPoints, status, source };
    else missing.push("away_away_points");

    if ([match.homeGoalsScored5, match.homeGoalsConceded5, match.awayGoalsScored5, match.awayGoalsConceded5].every(hasNumber)) {
      out.features.goalsLast5 = {
        value: {
          homeFor: match.homeGoalsScored5,
          homeAgainst: match.homeGoalsConceded5,
          awayFor: match.awayGoalsScored5,
          awayAgainst: match.awayGoalsConceded5,
        },
        status,
        source,
      };
    } else missing.push("goals_last5");

    const goalsByHalf = {
      homeFirstHalfFor: readNumber(raw, ["homeFirstHalfGoalsFor", "homeGoalsFirstHalfFor", "homeGoalsFirstHalfScored"]),
      homeFirstHalfAgainst: readNumber(raw, ["homeFirstHalfGoalsAgainst", "homeGoalsFirstHalfAgainst", "homeGoalsFirstHalfConceded"]),
      homeSecondHalfFor: readNumber(raw, ["homeSecondHalfGoalsFor", "homeGoalsSecondHalfFor", "homeGoalsSecondHalfScored"]),
      homeSecondHalfAgainst: readNumber(raw, ["homeSecondHalfGoalsAgainst", "homeGoalsSecondHalfAgainst", "homeGoalsSecondHalfConceded"]),
      awayFirstHalfFor: readNumber(raw, ["awayFirstHalfGoalsFor", "awayGoalsFirstHalfFor", "awayGoalsFirstHalfScored"]),
      awayFirstHalfAgainst: readNumber(raw, ["awayFirstHalfGoalsAgainst", "awayGoalsFirstHalfAgainst", "awayGoalsFirstHalfConceded"]),
      awaySecondHalfFor: readNumber(raw, ["awaySecondHalfGoalsFor", "awayGoalsSecondHalfFor", "awayGoalsSecondHalfScored"]),
      awaySecondHalfAgainst: readNumber(raw, ["awaySecondHalfGoalsAgainst", "awayGoalsSecondHalfAgainst", "awayGoalsSecondHalfConceded"]),
    };
    if (Object.values(goalsByHalf).every(hasNumber)) out.features.goalsByHalf = { value: goalsByHalf as {
      homeFirstHalfFor: number;
      homeFirstHalfAgainst: number;
      homeSecondHalfFor: number;
      homeSecondHalfAgainst: number;
      awayFirstHalfFor: number;
      awayFirstHalfAgainst: number;
      awaySecondHalfFor: number;
      awaySecondHalfAgainst: number;
    }, status, source };
    else missing.push("goals_by_half");

    const shots = {
      homeFor: readNumber(raw, ["homeShotsFor", "homeShots"]),
      homeAgainst: readNumber(raw, ["homeShotsAgainst"]),
      awayFor: readNumber(raw, ["awayShotsFor", "awayShots"]),
      awayAgainst: readNumber(raw, ["awayShotsAgainst"]),
    };
    if (Object.values(shots).every(hasNumber)) out.features.shots = { value: shots as { homeFor: number; homeAgainst: number; awayFor: number; awayAgainst: number }, status, source };
    else missing.push("shots");

    const shotsOnTarget = {
      homeFor: readNumber(raw, ["homeShotsOnTargetFor", "homeShotsOnTarget"]),
      homeAgainst: readNumber(raw, ["homeShotsOnTargetAgainst"]),
      awayFor: readNumber(raw, ["awayShotsOnTargetFor", "awayShotsOnTarget"]),
      awayAgainst: readNumber(raw, ["awayShotsOnTargetAgainst"]),
    };
    if (Object.values(shotsOnTarget).every(hasNumber)) out.features.shotsOnTarget = { value: shotsOnTarget as { homeFor: number; homeAgainst: number; awayFor: number; awayAgainst: number }, status, source };
    else missing.push("shots_on_target");

    const corners = {
      homeFor: readNumber(raw, ["homeCornersFor", "homeCorners"]),
      homeAgainst: readNumber(raw, ["homeCornersAgainst"]),
      awayFor: readNumber(raw, ["awayCornersFor", "awayCorners"]),
      awayAgainst: readNumber(raw, ["awayCornersAgainst"]),
    };
    if (Object.values(corners).every(hasNumber)) out.features.corners = { value: corners as { homeFor: number; homeAgainst: number; awayFor: number; awayAgainst: number }, status, source };
    else missing.push("corners");

    const cards = {
      homeFor: readNumber(raw, ["homeCardsFor", "homeCards"]),
      homeAgainst: readNumber(raw, ["homeCardsAgainst"]),
      awayFor: readNumber(raw, ["awayCardsFor", "awayCards"]),
      awayAgainst: readNumber(raw, ["awayCardsAgainst"]),
    };
    if (Object.values(cards).every(hasNumber)) out.features.cards = { value: cards as { homeFor: number; homeAgainst: number; awayFor: number; awayAgainst: number }, status, source };
    else missing.push("cards");

    if (hasNumber(match.homeAbsenceRate) && hasNumber(match.awayAbsenceRate)) {
      out.features.absences = { value: { homeRate: match.homeAbsenceRate, awayRate: match.awayAbsenceRate }, status, source };
    } else missing.push("absences");

    out.features.homeField = { value: true, status, source };

    if (typeof match.homeBigGameAhead === "boolean" && typeof match.awayBigGameAhead === "boolean") {
      out.features.restCalendar = { value: { homeBigGameAhead: match.homeBigGameAhead, awayBigGameAhead: match.awayBigGameAhead }, status, source };
    } else missing.push("rest_calendar");

    if (hasValidOdds(match)) {
      const oddsValue = { homeOdd: match.homeOdd, drawOdd: match.drawOdd, awayOdd: match.awayOdd, homeOddDropped: Boolean(match.homeOddDropped) };
      out.features.odds1x2 = { value: oddsValue, status, source };
      out.features.oddsSnapshots = {
        value: [{ market: "RESULT_1X2", homeOdd: oddsValue.homeOdd, drawOdd: oddsValue.drawOdd, awayOdd: oddsValue.awayOdd, sourceSnapshotIds }],
        status,
        source,
      };
    } else missing.push("odds_1x2");

    if (hasNumber(match.homePosition) && hasNumber(match.awayPosition)) {
      out.features.tableContext = {
        value: { homePosition: match.homePosition, awayPosition: match.awayPosition, homeNeedsWin: Boolean(match.homeNeedsWin), awayNeedsWin: Boolean(match.awayNeedsWin) },
        status,
        source,
      };
    } else missing.push("table_context");

    if (hasNumber(match.homeMomentum) || hasNumber(match.awayMomentum)) {
      out.features.momentum = { value: { home: match.homeMomentum, away: match.awayMomentum }, status, source };
    } else missing.push("momentum");

    out.features.contextualFlags = {
      value: { isClassico: match.isClassico, weatherRain: match.weatherRain, weatherIntensity: match.weatherIntensity },
      status,
      source,
    };

    const totalFeatureSlots = 17;
    out.dataCoverageScore = Math.max(0, Math.min(1, (totalFeatureSlots - missing.length) / totalFeatureSlots));
    missing.forEach((item) => allMissing.add(item));
    return out;
  });

  const dataCoverageScore = features.length > 0
    ? features.reduce((sum, item) => sum + item.dataCoverageScore, 0) / features.length
    : 0;

  return {
    ok: features.length > 0 && dataCoverageScore >= 0.45,
    features,
    missingFeatures: Array.from(allMissing).sort(),
    dataCoverageScore,
    sourceSnapshotIds,
    confidencePenalty: confidencePenaltyForSource(source),
    reason: dataCoverageScore < 0.45 ? "low-data-coverage" : undefined,
  };
}
