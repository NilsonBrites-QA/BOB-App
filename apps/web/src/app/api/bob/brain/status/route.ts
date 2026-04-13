import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value && typeof value === "object" && "toString" in value) {
    const parsed = Number(String(value));
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function extractMemorySummary(content: unknown) {
  const payload = (content ?? {}) as Record<string, unknown>;
  return {
    title: typeof payload.title === "string" ? payload.title : null,
    publicText: typeof payload.publicText === "string" ? payload.publicText : null,
    adminText: typeof payload.adminText === "string" ? payload.adminText : null,
    source: typeof payload.source === "string" ? payload.source : null,
    accuracy: toNumber(payload.accuracy),
    anchorAcc: toNumber(payload.anchorAcc),
    strengths: Array.isArray(payload.strengths) ? payload.strengths.filter((item): item is string => typeof item === "string") : [],
    weaknesses: Array.isArray(payload.weaknesses) ? payload.weaknesses.filter((item): item is string => typeof item === "string") : [],
    narrative: typeof payload.narrative === "string" ? payload.narrative : null,
    claudeOnline: Boolean(payload.claudeOnline),
    gptOnline: Boolean(payload.gptOnline),
  };
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { email: user.email!.toLowerCase() },
    select: { active: true, role: true, id: true, email: true },
  }).catch(() => null);

  if (!dbUser?.active) {
    return NextResponse.json({ error: "Acesso inativo." }, { status: 403 });
  }

  if (dbUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem acessar o cérebro observável." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsedSeason = searchParams.get("season") ? parseInt(searchParams.get("season")!, 10) : new Date().getFullYear();
  const season = Number.isNaN(parsedSeason) ? new Date().getFullYear() : parsedSeason;

  const sinceRaw = searchParams.get("since");
  const sinceDate = sinceRaw ? new Date(sinceRaw) : null;
  const validSinceDate = sinceDate && !Number.isNaN(sinceDate.getTime()) ? sinceDate : null;

  const [
    rounds,
    factorWeights,
    patterns,
    simulations,
    memoryEvents,
    totalMemoryEvents,
    totalReflections,
    totalDualAnalyses,
    totalChatMessages,
    userChatMessages,
    learningVelocity24h,
  ] = await Promise.all([
    prisma.round.findMany({
      where: { season: { year: season } },
      orderBy: { number: "desc" },
      take: 12,
      select: {
        id: true,
        number: true,
        status: true,
        firstMatchAt: true,
        deliveredAt: true,
        createdAt: true,
        _count: { select: { anchors: true, variations: true, memoryEvents: true } },
        result: { select: { hit: true, netReturn: true, totalStaked: true } },
      },
    }).catch(() => []),
    prisma.factorWeight.findMany({
      where: { season },
      orderBy: { round: "desc" },
      take: 12,
      select: {
        round: true,
        overallAccuracy: true,
        anchorAccuracy: true,
        tableContext: true,
        recentForm: true,
        momentum: true,
        homeAway: true,
        goalsXg: true,
        h2h: true,
        absences: true,
        calendar: true,
        market: true,
        motivation: true,
        calibrationNotes: true,
      },
    }).catch(() => []),
    prisma.conditionalPattern.findMany({
      orderBy: [{ occurrences: "desc" }],
      take: 10,
      select: {
        id: true,
        condition: true,
        factors: true,
        occurrences: true,
        correct: true,
        isAntiCorr: true,
        isSuppressed: true,
        updatedAt: true,
      },
    }).catch(() => []),
    prisma.simulationResult.findMany({
      where: { season },
      orderBy: { round: "desc" },
      take: 10,
      select: {
        round: true,
        anchorCount: true,
        anchorsCorrect: true,
        totalPicks: true,
        correctPicks: true,
        bestOddProjected: true,
        bestOddReal: true,
        calibrated: true,
        simulatedAt: true,
      },
    }).catch(() => []),
    prisma.memoryEvent.findMany({
      where: {
        type: { in: ["reflection", "dual-analysis"] },
        ...(validSinceDate ? { createdAt: { gt: validSinceDate } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        type: true,
        layer: true,
        source: true,
        createdAt: true,
        relevanceScore: true,
        content: true,
        round: { select: { number: true, status: true, season: { select: { year: true } } } },
      },
    }).catch(() => []),
    prisma.memoryEvent.count().catch(() => 0),
    prisma.memoryEvent.count({ where: { type: "reflection" } }).catch(() => 0),
    prisma.memoryEvent.count({ where: { type: "dual-analysis" } }).catch(() => 0),
    prisma.chatMessage.count().catch(() => 0),
    prisma.chatMessage.count({ where: { userId: dbUser.id } }).catch(() => 0),
    prisma.memoryEvent.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }).catch(() => 0),
  ]);

  const latestRound = rounds[0] ?? null;
  const latestDeliveredRound = rounds.find((round) => round.status === "DELIVERED" || round.status === "CLOSED") ?? null;
  const latestWeights = factorWeights[0] ?? null;
  const memorySortedAsc = [...memoryEvents].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const latestMemoryEvent = memoryEvents[0] ?? null;

  const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasGpt = Boolean(process.env.OPENAI_API_KEY);

  const thinkingMode = hasClaude && hasGpt
    ? "DUAL_MIND"
    : hasClaude
      ? "CLAUDE_ONLY"
      : hasGpt
        ? "GPT_ONLY"
        : "OFFLINE";

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    season,
    user: {
      email: dbUser.email,
      role: dbUser.role,
    },
    env: {
      footballData: Boolean(process.env.FOOTBALL_DATA_TOKEN),
      anthropic: hasClaude,
      openai: hasGpt,
      apiFootball: Boolean(process.env.API_FOOTBALL_KEY),
      oddspapi: Boolean(process.env.ODDSPAPI_KEY),
      cronSecret: Boolean(process.env.CRON_SECRET),
    },
    brain: {
      thinkingMode,
      dualMindOnline: hasClaude && hasGpt,
      learningVelocity24h,
      latestMemoryType: latestMemoryEvent?.type ?? null,
      latestMemoryAt: latestMemoryEvent?.createdAt ?? null,
    },
    live: {
      cursor: latestMemoryEvent?.createdAt?.toISOString() ?? null,
      deltaMode: Boolean(validSinceDate),
      heartbeatMs: 10000,
      serverNow: new Date().toISOString(),
    },
    snapshot: {
      roundsTracked: rounds.length,
      latestRound: latestRound ? {
        number: latestRound.number,
        status: latestRound.status,
        firstMatchAt: latestRound.firstMatchAt,
        deliveredAt: latestRound.deliveredAt,
      } : null,
      latestDeliveredRound: latestDeliveredRound ? latestDeliveredRound.number : null,
      latestWeightsRound: latestWeights?.round ?? null,
      totalMemoryEvents,
      totalReflections,
      totalDualAnalyses,
      totalChatMessages,
      userChatMessages,
      totalPatterns: patterns.length,
      totalSimulations: simulations.length,
      newEventsInPayload: memoryEvents.length,
    },
    rounds: rounds.map((round) => ({
      id: round.id,
      number: round.number,
      status: round.status,
      firstMatchAt: round.firstMatchAt,
      deliveredAt: round.deliveredAt,
      createdAt: round.createdAt,
      anchors: round._count.anchors,
      variations: round._count.variations,
      memoryEvents: round._count.memoryEvents,
      result: round.result ? {
        hit: round.result.hit,
        netReturn: toNumber(round.result.netReturn),
        totalStaked: toNumber(round.result.totalStaked),
      } : null,
    })),
    factorWeights: factorWeights.map((row) => ({
      round: row.round,
      overallAccuracy: toNumber(row.overallAccuracy),
      anchorAccuracy: toNumber(row.anchorAccuracy),
      calibrationNotes: row.calibrationNotes,
      weights: {
        tableContext: toNumber(row.tableContext),
        recentForm: toNumber(row.recentForm),
        momentum: toNumber(row.momentum),
        homeAway: toNumber(row.homeAway),
        goalsXg: toNumber(row.goalsXg),
        h2h: toNumber(row.h2h),
        absences: toNumber(row.absences),
        calendar: toNumber(row.calendar),
        market: toNumber(row.market),
        motivation: toNumber(row.motivation),
      },
    })),
    patterns: patterns.map((pattern) => ({
      id: pattern.id,
      condition: pattern.condition,
      factors: pattern.factors,
      occurrences: pattern.occurrences,
      correct: pattern.correct,
      hitRate: pattern.occurrences > 0 ? pattern.correct / pattern.occurrences : null,
      isAntiCorr: pattern.isAntiCorr,
      isSuppressed: pattern.isSuppressed,
      updatedAt: pattern.updatedAt,
    })),
    simulations: simulations.map((simulation) => ({
      round: simulation.round,
      anchorAccuracy: simulation.anchorCount > 0 ? simulation.anchorsCorrect / simulation.anchorCount : null,
      overallAccuracy: simulation.totalPicks > 0 ? simulation.correctPicks / simulation.totalPicks : null,
      bestOddProjected: toNumber(simulation.bestOddProjected),
      bestOddReal: toNumber(simulation.bestOddReal),
      calibrated: simulation.calibrated,
      simulatedAt: simulation.simulatedAt,
    })),
    memory: memorySortedAsc.map((event) => ({
      id: event.id,
      type: event.type,
      layer: event.layer,
      source: event.source,
      createdAt: event.createdAt,
      relevanceScore: event.relevanceScore,
      round: event.round ? {
        number: event.round.number,
        status: event.round.status,
        season: event.round.season.year,
      } : null,
      summary: extractMemorySummary(event.content),
    })),
  });
}
