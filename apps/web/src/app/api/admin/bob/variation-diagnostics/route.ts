import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { isForbiddenForOfficialGeneration, normalizeDataSource } from "@/lib/bob/data/source-policy";
import { loadOfficialRoundData, resolveOfficialRoundContext } from "@/lib/bob/round-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED_EVENT_TYPES = [
  "FEATURE_BUILT",
  "MATCH_INTELLIGENCE_CREATED",
  "ANCHOR_SCORE_CALCULATED",
  "ANCHORS_SELECTED",
  "VARIATIONS_GENERATED",
  "OFFICIAL_VARIATIONS_SNAPSHOT",
] as const;

const FORBIDDEN_SOURCES = new Set(["demo", "mock", "fallback_fake", "synthetic", "empty", "insufficient"]);
const LLM_SOURCES = new Set(["llm", "claude", "gpt", "gemini", "openai", "anthropic"]);

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function authHeaderMatchesCronSecret(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  return Boolean(secret && authHeader === `Bearer ${secret}`);
}

async function isAdminRequest() {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return false;

    const dbUser = await prisma.user.findUnique({
      where: { email: user.email.toLowerCase() },
      select: { role: true, active: true },
    });
    return Boolean(dbUser?.active && dbUser.role === "ADMIN");
  } catch {
    return false;
  }
}

async function isAuthorized(request: Request) {
  if (authHeaderMatchesCronSecret(request)) return true;
  return isAdminRequest();
}

function eventRound(content: unknown): number | null {
  if (!isRecord(content)) return null;
  const direct = numberOrNull(content.round) ?? numberOrNull(content.roundId);
  if (direct !== null) return direct;
  const snapshot = isRecord(content.snapshot) ? content.snapshot : null;
  return snapshot ? numberOrNull(snapshot.round) ?? numberOrNull(snapshot.roundId) : null;
}

function eventBelongsToRound(event: { roundId: string | null; content: unknown }, roundDbId: string, round: number) {
  if (event.roundId === roundDbId) return true;
  return eventRound(event.content) === round;
}

function addSourceFromSnapshotId(target: Set<string>, snapshotId: string) {
  const last = snapshotId.split(":").at(-1);
  if (!last) return;
  const normalized = normalizeDataSource(last);
  target.add(normalized);
}

function collectUsedSources(args: {
  snapshot: JsonRecord | null;
  events: Array<{ source: string | null }>;
  sourceSnapshotIds: string[];
}) {
  const used = new Set<string>();
  const policy = isRecord(args.snapshot?.dataSourcePolicy) ? args.snapshot.dataSourcePolicy : null;
  const policySource = stringOrNull(policy?.source);
  if (policySource) used.add(normalizeDataSource(policySource));
  for (const event of args.events) {
    if (event.source) used.add(normalizeDataSource(event.source));
  }
  for (const id of args.sourceSnapshotIds) addSourceFromSnapshotId(used, id);
  return Array.from(used).sort();
}

function ticketFingerprint(variation: JsonRecord) {
  const odds = records(variation.individualOdds);
  return odds
    .map((leg) => `${stringOrNull(leg.matchId) ?? ""}:${stringOrNull(leg.outcome) ?? ""}`)
    .sort()
    .join("|");
}

function groupByMatch<T>(items: Array<{ matchId: string; value: T }>) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const current = grouped.get(item.matchId) ?? [];
    current.push(item.value);
    grouped.set(item.matchId, current);
  }
  return Array.from(grouped.entries()).map(([matchId, values]) => ({ matchId, values }));
}

export async function GET(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const season = Number(searchParams.get("season"));
  const round = Number(searchParams.get("round"));

  if (!Number.isInteger(season) || !Number.isInteger(round) || season < 2000 || round < 1 || round > 38) {
    return NextResponse.json({ error: "Query params season e round são obrigatórios e devem ser válidos." }, { status: 400 });
  }

  console.info(`[BOB/Diagnostics] variation_pipeline_check season=${season} round=${round}`);

  const roundContext = await resolveOfficialRoundContext({ season, round });
  const officialRoundData = roundContext.ok ? await loadOfficialRoundData(roundContext) : null;
  const datasetMatchesCount = officialRoundData?.matches.length ?? 0;
  const resolvedRound = roundContext.ok ? roundContext.round : null;
  const resolvedSeason = roundContext.season;

  const roundRow = await prisma.round.findFirst({
    where: {
      season: { year: season },
      number: round,
      status: { not: "SUPERSEDED" },
    },
    orderBy: { version: "desc" },
    include: {
      season: { select: { year: true } },
      anchors: { orderBy: { rank: "asc" } },
      variations: {
        orderBy: { code: "asc" },
        include: { picks: { orderBy: { position: "asc" } } },
      },
    },
  });

  if (!roundRow) {
    const blockingProblems = ["round_not_found"];
    console.info("[BOB/Diagnostics] officialPipelineValid=false");
    console.info(`[BOB/Diagnostics] blockingProblems=${blockingProblems.join(",")}`);
    return NextResponse.json({
      identification: { season, round, generatedAt: null, generationVersion: null, engineVersion: null, status: "not_found" },
      roundContext: {
        roundContextValid: roundContext.ok,
        requestedRound: round,
        resolvedRound,
        resolvedSeason,
        datasetMatchesCount,
        uiRoundMismatch: false,
        pipelineRoundMismatch: false,
      },
      result: { officialPipelineValid: false, blockingProblems, warnings: [], nextRecommendedAction: "Gere e entregue a rodada oficial antes de validar o pipeline." },
    }, { status: 404 });
  }

  const eventsRaw = await prisma.memoryEvent.findMany({
    where: {
      OR: [
        { roundId: roundRow.id },
        { type: { in: [...REQUIRED_EVENT_TYPES] } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const events = eventsRaw.filter((event) => eventBelongsToRound(event, roundRow.id, round));
  const eventTypesFound = REQUIRED_EVENT_TYPES.filter((type) => events.some((event) => event.type === type));
  const snapshotEvent = events.find((event) => event.type === "OFFICIAL_VARIATIONS_SNAPSHOT");
  const snapshot = isRecord(snapshotEvent?.content) ? snapshotEvent.content : null;
  const policy = isRecord(snapshot?.dataSourcePolicy) ? snapshot.dataSourcePolicy : {};
  const sourceSnapshotIds = strings(snapshot?.sourceSnapshotIds);
  const featureCoverage = records(snapshot?.featureCoverage);
  const snapshotAnchors = records(snapshot?.anchors);
  const snapshotVariations = records(snapshot?.variations);

  const usedSources = collectUsedSources({ snapshot, events, sourceSnapshotIds });
  const forbiddenSourcesFound = usedSources.filter((source) =>
    FORBIDDEN_SOURCES.has(source) || isForbiddenForOfficialGeneration(source),
  );
  const hasForbiddenSource = forbiddenSourcesFound.length > 0;

  const featureEvent = events.find((event) => event.type === "FEATURE_BUILT");
  const intelligenceEvent = events.find((event) => event.type === "MATCH_INTELLIGENCE_CREATED");
  const anchorScoreEvent = events.find((event) => event.type === "ANCHOR_SCORE_CALCULATED");
  const anchorsSelectedEvent = events.find((event) => event.type === "ANCHORS_SELECTED");
  const variationsGeneratedEvent = events.find((event) => event.type === "VARIATIONS_GENERATED");
  const pipelineRounds = [
    numberOrNull(snapshot?.round),
    numberOrNull(snapshot?.roundId),
    ...events.map((event) => eventRound(event.content)),
  ].filter((value): value is number => value !== null);
  const roundContextValid = roundContext.ok && resolvedRound === round && resolvedSeason === season;
  const uiRoundMismatch = Boolean(roundRow.number !== resolvedRound || roundRow.season.year !== resolvedSeason);
  const pipelineRoundMismatch = pipelineRounds.length > 0 && pipelineRounds.some((eventRoundValue) => eventRoundValue !== resolvedRound);

  const featureBuilderPresent = Boolean(featureEvent || featureCoverage.length > 0);
  const matchIntelligencePresent = Boolean(intelligenceEvent);
  const anchorScorePresent = Boolean(anchorScoreEvent || anchorsSelectedEvent || snapshotAnchors.length > 0);
  const beamSearchPresent = Boolean(
    variationsGeneratedEvent ||
    snapshotVariations.some((variation) => stringOrNull(variation.method) === "beam_search"),
  );

  const featureCoverageValues = featureCoverage
    .map((item) => numberOrNull(item.dataCoverageScore))
    .filter((value): value is number => value !== null);
  const averageDataCoverageScore = featureCoverageValues.length > 0
    ? featureCoverageValues.reduce((sum, value) => sum + value, 0) / featureCoverageValues.length
    : null;
  const confidencePenalty = numberOrNull(policy.confidencePenalty);

  const variationLegs = snapshotVariations.flatMap((variation) =>
    records(variation.individualOdds).map((leg) => ({ variation, leg })),
  );
  const hasDeViggingApplied = variationLegs.length > 0 && variationLegs.every(({ leg }) =>
    numberOrNull(leg.cleanProb) !== null &&
    numberOrNull(leg.fairOdd) !== null,
  );
  const averageConfidence = isRecord(intelligenceEvent?.content)
    ? numberOrNull(intelligenceEvent.content.avgConfidence)
    : null;
  const probabilitiesPresentByMatch = groupByMatch(variationLegs.map(({ variation, leg }) => ({
    matchId: stringOrNull(leg.matchId) ?? "unknown",
    value: {
      variation: stringOrNull(variation.id),
      outcome: stringOrNull(leg.outcome),
      cleanProbPresent: numberOrNull(leg.cleanProb) !== null,
      fairOddPresent: numberOrNull(leg.fairOdd) !== null,
    },
  })));
  const riskFlagsByMatch = groupByMatch(variationLegs.map(({ variation, leg }) => ({
    matchId: stringOrNull(leg.matchId) ?? "unknown",
    value: strings(variation.riskFlags),
  })));
  type ValueOpportunityDiagnostic = {
    variation: string | null;
    outcome: string | null;
    odd: number;
    fairOdd: number;
    edge: number;
  };
  const valueOpportunityItems = variationLegs
    .map(({ variation, leg }) => {
      const odd = numberOrNull(leg.odd);
      const fairOdd = numberOrNull(leg.fairOdd);
      if (odd === null || fairOdd === null || odd <= fairOdd) return null;
      return {
        matchId: stringOrNull(leg.matchId) ?? "unknown",
        value: {
          variation: stringOrNull(variation.id),
          outcome: stringOrNull(leg.outcome),
          odd,
          fairOdd,
          edge: odd - fairOdd,
        },
      };
    })
    .filter((item): item is { matchId: string; value: ValueOpportunityDiagnostic } => item !== null);
  const valueOpportunitiesByMatch = groupByMatch(valueOpportunityItems);

  const anchors = snapshotAnchors.map((anchor) => ({
    matchId: stringOrNull(anchor.matchId),
    teamId: stringOrNull(anchor.teamId),
    teamName: stringOrNull(anchor.teamName) ?? stringOrNull(anchor.teamId),
    probabilityWin: numberOrNull(anchor.probabilityWin),
    gap: numberOrNull(anchor.gap),
    entropy: numberOrNull(anchor.entropy),
    marketDivergence: numberOrNull(anchor.marketDivergence),
    injuryRobustness: numberOrNull(anchor.injuryRobustness),
    finalScore: numberOrNull(anchor.finalScore),
    confidence: numberOrNull(anchor.confidence),
    reason: stringOrNull(anchor.reason),
  }));
  const anchorsCount = anchors.length || roundRow.anchors.length;
  const anchorsValid = anchors.length === 4 && anchors.every((anchor) =>
    anchor.matchId &&
    anchor.teamId &&
    anchor.probabilityWin !== null &&
    anchor.gap !== null &&
    anchor.entropy !== null &&
    anchor.marketDivergence !== null &&
    anchor.injuryRobustness !== null &&
    anchor.finalScore !== null &&
    anchor.confidence !== null,
  );

  const fingerprints = snapshotVariations.map(ticketFingerprint).filter(Boolean);
  const duplicatedTickets = Array.from(
    fingerprints.reduce((acc, fingerprint) => {
      acc.set(fingerprint, (acc.get(fingerprint) ?? 0) + 1);
      return acc;
    }, new Map<string, number>()),
  )
    .filter(([, count]) => count > 1)
    .map(([fingerprint]) => fingerprint);
  const allVariationsDisjoint = snapshotVariations.length > 0 && duplicatedTickets.length === 0;
  const allAreBigOdds = snapshotVariations.length > 0 && snapshotVariations.every((variation) =>
    stringOrNull(variation.oddsClass) === "big-odds" &&
    (numberOrNull(variation.combinedOdd) ?? numberOrNull(variation.oddTotal) ?? 0) >= 1000,
  );
  const variations = snapshotVariations.map((variation) => ({
    name: stringOrNull(variation.id),
    oddTotal: numberOrNull(variation.combinedOdd) ?? numberOrNull(variation.oddTotal),
    estimatedProbability: numberOrNull(variation.estimatedProbability) ?? numberOrNull(variation.probabilityMass),
    score: numberOrNull(variation.variationScore),
    legsCount: numberOrNull(variation.legCount),
    anchorsUsed: records(variation.anchors),
    coverageGames: records(variation.individualOdds).map((leg) => stringOrNull(leg.matchId)).filter(Boolean),
    zebraCalculatedGames: records(variation.calculatedUnderdogs),
    riskFlags: strings(variation.riskFlags),
    dataCoverage: numberOrNull(variation.dataCoverage),
  }));

  const roundVersions = await prisma.round.findMany({
    where: { seasonId: roundRow.seasonId, number: round },
    orderBy: { version: "asc" },
    select: { id: true, version: true, status: true, previousRoundId: true, createdAt: true, supersededAt: true },
  });
  const appendOnlyEvidence = Boolean(snapshotEvent && roundVersions.length > 0 && roundVersions.every((version) => version.version >= 1));

  const llmUsedForPickSelection =
    usedSources.some((source) => LLM_SOURCES.has(source)) ||
    snapshotVariations.some((variation) => stringOrNull(variation.method) !== "beam_search");

  const blockingProblems: string[] = [];
  if (!snapshot) blockingProblems.push("snapshot_not_found");
  if (!roundContextValid || uiRoundMismatch || pipelineRoundMismatch) blockingProblems.push("round_context_mismatch");
  if (datasetMatchesCount === 0) blockingProblems.push("missing_round_dataset");
  if (hasForbiddenSource) blockingProblems.push(`forbidden_source_found:${forbiddenSourcesFound.join(",")}`);
  if (!featureBuilderPresent) blockingProblems.push("feature_builder_missing");
  if (!matchIntelligencePresent) blockingProblems.push("match_intelligence_missing");
  if (!hasDeViggingApplied) blockingProblems.push("devigging_not_detected");
  if (!anchorScorePresent) blockingProblems.push("anchor_score_missing");
  if (anchorsCount !== 4) blockingProblems.push(`anchors_count_${anchorsCount}_expected_4`);
  if (!anchorsValid) blockingProblems.push("anchors_invalid");
  if (!beamSearchPresent) blockingProblems.push("beam_search_missing");
  if (snapshotVariations.length !== 5) blockingProblems.push(`variations_count_${snapshotVariations.length}_expected_5`);
  if (!allVariationsDisjoint) blockingProblems.push("variation_tickets_not_disjoint");
  if (!allAreBigOdds) blockingProblems.push("not_all_variations_big_odds");
  if (llmUsedForPickSelection) blockingProblems.push("llm_used_for_pick_selection");

  const warnings: string[] = [];
  for (const type of REQUIRED_EVENT_TYPES) {
    if (!eventTypesFound.includes(type)) warnings.push(`event_missing:${type}`);
  }
  if (roundRow.status !== "DELIVERED") warnings.push(`round_status:${roundRow.status}`);
  if (!appendOnlyEvidence) warnings.push("append_only_evidence_incomplete");

  const officialPipelineValid = blockingProblems.length === 0;
  console.info(`[BOB/Diagnostics] officialPipelineValid=${officialPipelineValid}`);
  console.info(`[BOB/Diagnostics] blockingProblems=${blockingProblems.join(",") || "none"}`);

  return NextResponse.json({
    identification: {
      season,
      round,
      generatedAt: stringOrNull(snapshot?.generatedAt) ?? snapshotEvent?.createdAt.toISOString() ?? null,
      generationVersion: stringOrNull(snapshot?.generationVersion),
      engineVersion: stringOrNull(snapshot?.engineVersion),
      status: stringOrNull(snapshot?.status) ?? roundRow.status,
    },
    dataSource: {
      dataSourcePolicy: policy,
      sourceSnapshotIds,
      sourcesUsed: usedSources,
      hasForbiddenSource,
      forbiddenSourcesFound,
    },
    roundContext: {
      roundContextValid,
      requestedRound: round,
      resolvedRound,
      resolvedSeason,
      datasetMatchesCount,
      uiRoundMismatch,
      pipelineRoundMismatch,
    },
    featureBuilder: {
      featureBuilderPresent,
      matchesProcessed: isRecord(featureEvent?.content) ? numberOrNull(featureEvent.content.matches) ?? featureCoverage.length : featureCoverage.length,
      averageDataCoverageScore,
      missingFeaturesByMatch: featureCoverage.map((item) => ({
        matchId: stringOrNull(item.matchId),
        missingFeatures: strings(item.missingFeatures),
      })),
      confidencePenaltyByMatch: featureCoverage.map((item) => ({
        matchId: stringOrNull(item.matchId),
        confidencePenalty,
      })),
      sourceSnapshotIdsByMatch: featureCoverage.map((item) => ({
        matchId: stringOrNull(item.matchId),
        sourceSnapshotIds,
      })),
    },
    matchIntelligence: {
      matchIntelligencePresent,
      matchesProcessed: isRecord(intelligenceEvent?.content) ? numberOrNull(intelligenceEvent.content.matches) : null,
      hasDeViggingApplied,
      averageConfidence,
      probabilitiesPresentByMatch,
      riskFlagsByMatch,
      valueOpportunitiesByMatch,
    },
    anchorScore: {
      anchorScorePresent,
      anchorsCount,
      anchors,
      anchorsValid,
    },
    beamSearch: {
      beamSearchPresent,
      variationsCount: snapshotVariations.length,
      variationsValid: snapshotVariations.length === 5 && allVariationsDisjoint && allAreBigOdds,
      allVariationsDisjoint,
      duplicatedTickets,
      allAreBigOdds,
      variations,
    },
    persistence: {
      snapshotFound: Boolean(snapshot),
      memoryEventFound: events.length > 0,
      eventTypesFound,
      appendOnlyEvidence,
    },
    result: {
      officialPipelineValid,
      blockingProblems,
      warnings,
      nextRecommendedAction: officialPipelineValid
        ? "Nenhuma ação necessária: snapshot oficial validado."
        : "Regere e entregue a rodada pelo pipeline oficial; depois rode este diagnóstico novamente.",
    },
  });
}
