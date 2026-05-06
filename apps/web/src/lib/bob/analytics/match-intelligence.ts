import { devig } from "@/lib/bob/engine/devigging";
import type { MatchFeatures } from "./feature-builder";

export type MarketRecommendation = {
  market: string;
  label: string;
  odd: number;
  probability: number;
  confidence: number;
  reason: string;
  supportingStats: string[];
  riskFlags: string[];
};

export type MatchIntelligence = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  probabilities: {
    homeWin?: number;
    draw?: number;
    awayWin?: number;
    over25?: number;
    under25?: number;
    bttsYes?: number;
    bttsNo?: number;
    cornersOver?: number;
    cardsOver?: number;
    shotsOver?: number;
    shotsOnTargetOver?: number;
  };
  confidence: number;
  dataCoverageScore: number;
  riskFlags: string[];
  valueOpportunities: MarketRecommendation[];
  recommendedMarkets: MarketRecommendation[];
  missingFeatures: string[];
  sourceSnapshotIds: string[];
  confidencePenalty: number;
  internalExplanation: string[];
};

export type MatchIntelligenceResult = {
  ok: boolean;
  items: MatchIntelligence[];
  reason?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formPoints(form: string[]) {
  return form.reduce((sum, item) => sum + (item === "W" ? 3 : item === "D" ? 1 : 0), 0);
}

function probToOdd(probability: number) {
  if (probability <= 0) return 99;
  return Math.round((1 / probability) * 100) / 100;
}

export function createMatchIntelligence(features: MatchFeatures[]): MatchIntelligenceResult {
  const items = features.map((feature) => {
    const odds = feature.features.odds1x2?.value;
    const riskFlags: string[] = [];
    const internalExplanation: string[] = [];
    const recommendedMarkets: MarketRecommendation[] = [];
    const valueOpportunities: MarketRecommendation[] = [];

    if (!odds) {
      return {
        matchId: feature.matchId,
        homeTeam: feature.homeTeam,
        awayTeam: feature.awayTeam,
        probabilities: {},
        confidence: 0,
        dataCoverageScore: feature.dataCoverageScore,
        riskFlags: ["missing-odds-1x2"],
        valueOpportunities,
        recommendedMarkets,
        missingFeatures: feature.missingFeatures,
        sourceSnapshotIds: feature.sourceSnapshotIds,
        confidencePenalty: feature.confidencePenalty,
        internalExplanation: ["Odds 1X2 ausentes: inteligência probabilística bloqueada para mercados de preço."],
      } satisfies MatchIntelligence;
    }

    const devigged = devig({ homeOdd: odds.homeOdd, drawOdd: odds.drawOdd, awayOdd: odds.awayOdd });
    if (!devigged.ok) {
      return {
        matchId: feature.matchId,
        homeTeam: feature.homeTeam,
        awayTeam: feature.awayTeam,
        probabilities: {},
        confidence: 0,
        dataCoverageScore: feature.dataCoverageScore,
        riskFlags: ["invalid-odds-1x2"],
        valueOpportunities,
        recommendedMarkets,
        missingFeatures: feature.missingFeatures,
        sourceSnapshotIds: feature.sourceSnapshotIds,
        confidencePenalty: feature.confidencePenalty,
        internalExplanation: [devigged.error],
      } satisfies MatchIntelligence;
    }

    let homeWin = devigged.pHome;
    let draw = devigged.pDraw;
    let awayWin = devigged.pAway;

    const last5 = feature.features.last5?.value;
    if (last5) {
      const homeForm = formPoints(last5.home) / Math.max(1, last5.home.length * 3);
      const awayForm = formPoints(last5.away) / Math.max(1, last5.away.length * 3);
      const formDelta = clamp((homeForm - awayForm) * 0.08, -0.06, 0.06);
      homeWin = clamp(homeWin + formDelta, 0.05, 0.9);
      awayWin = clamp(awayWin - formDelta, 0.05, 0.9);
      internalExplanation.push(`Forma recente ajustou a leitura em ${(formDelta * 100).toFixed(1)} p.p.`);
    }

    const goals = feature.features.goalsLast5?.value;
    const totalRecentGoals = goals ? goals.homeFor + goals.homeAgainst + goals.awayFor + goals.awayAgainst : null;
    const avgRecentGoals = totalRecentGoals == null ? null : totalRecentGoals / 10;
    const over25 = avgRecentGoals == null ? undefined : clamp(0.42 + (avgRecentGoals - 2.2) * 0.12, 0.25, 0.78);
    const under25 = over25 == null ? undefined : 1 - over25;
    const bttsYes = goals == null ? undefined : clamp(0.44 + Math.min(goals.homeFor, goals.awayFor) * 0.025 + Math.min(goals.homeAgainst, goals.awayAgainst) * 0.02, 0.25, 0.75);
    const bttsNo = bttsYes == null ? undefined : 1 - bttsYes;
    const shots = feature.features.shots?.value;
    const shotsOnTarget = feature.features.shotsOnTarget?.value;
    const corners = feature.features.corners?.value;
    const cards = feature.features.cards?.value;
    const avgShots = shots == null ? null : (shots.homeFor + shots.awayFor) / 2;
    const avgShotsOnTarget = shotsOnTarget == null ? null : (shotsOnTarget.homeFor + shotsOnTarget.awayFor) / 2;
    const avgCorners = corners == null ? null : (corners.homeFor + corners.awayFor) / 2;
    const avgCards = cards == null ? null : (cards.homeFor + cards.awayFor) / 2;
    const shotsOver = avgShots == null ? undefined : clamp(0.38 + (avgShots - 11) * 0.035, 0.25, 0.75);
    const shotsOnTargetOver = avgShotsOnTarget == null ? undefined : clamp(0.36 + (avgShotsOnTarget - 4) * 0.05, 0.22, 0.72);
    const cornersOver = avgCorners == null ? undefined : clamp(0.4 + (avgCorners - 4.5) * 0.05, 0.25, 0.76);
    const cardsOver = avgCards == null ? undefined : clamp(0.4 + (avgCards - 2.5) * 0.06, 0.25, 0.78);

    const total = homeWin + draw + awayWin;
    homeWin /= total;
    draw /= total;
    awayWin /= total;

    if (feature.confidencePenalty > 0) riskFlags.push("stale-valid-confidence-penalty");
    if (feature.missingFeatures.length > 4) riskFlags.push("missing-features-reducing-confidence");
    if (feature.features.contextualFlags?.value.isClassico) riskFlags.push("classico-volatility");
    if ((feature.features.absences?.value.homeRate ?? 0) > 0.18) riskFlags.push("home-absence-pressure");
    if ((feature.features.absences?.value.awayRate ?? 0) > 0.18) riskFlags.push("away-absence-pressure");

    const confidence = clamp(
      feature.dataCoverageScore * 100 - feature.confidencePenalty * 100 - riskFlags.length * 4,
      0,
      95,
    );

    const resultCandidates = [
      { market: "1X2", label: `${feature.homeTeam} vence`, odd: odds.homeOdd, probability: homeWin },
      { market: "1X2", label: "Empate", odd: odds.drawOdd, probability: draw },
      { market: "1X2", label: `${feature.awayTeam} vence`, odd: odds.awayOdd, probability: awayWin },
    ];

    for (const candidate of resultCandidates) {
      const fairOdd = probToOdd(candidate.probability);
      const edge = candidate.odd - fairOdd;
      if (candidate.probability >= 0.38 && confidence >= 45) {
        const rec: MarketRecommendation = {
          ...candidate,
          confidence,
          reason: edge > 0 ? "Preço de mercado acima da odd justa estimada." : "Cenário mais provável dentro da leitura 1X2.",
          supportingStats: ["odds_1x2_de-vigged", ...(last5 ? ["last5_form"] : []), ...(goals ? ["goals_last5"] : [])],
          riskFlags,
        };
        recommendedMarkets.push(rec);
        if (edge > 0.03) valueOpportunities.push(rec);
      }
    }

    if (over25 != null && confidence >= 40) {
      recommendedMarkets.push({
        market: "OU",
        label: over25 >= under25! ? "Mais de 2.5 gols" : "Menos de 2.5 gols",
        odd: probToOdd(Math.max(over25, under25!)),
        probability: Math.max(over25, under25!),
        confidence: confidence - 5,
        reason: "Linha de gols derivada de gols recentes reais disponíveis.",
        supportingStats: ["goals_last5"],
        riskFlags,
      });
    }

    if (bttsYes != null && confidence >= 40) {
      recommendedMarkets.push({
        market: "BTTS",
        label: bttsYes >= bttsNo! ? "Ambas marcam: Sim" : "Ambas marcam: Não",
        odd: probToOdd(Math.max(bttsYes, bttsNo!)),
        probability: Math.max(bttsYes, bttsNo!),
        confidence: confidence - 6,
        reason: "Ambas marcam calculado a partir de gols pró/contra recentes.",
        supportingStats: ["goals_last5"],
        riskFlags,
      });
    }

    if (shotsOver != null && confidence >= 40) {
      recommendedMarkets.push({
        market: "SHOTS",
        label: "Finalizações acima da linha média",
        odd: probToOdd(shotsOver),
        probability: shotsOver,
        confidence: confidence - 7,
        reason: "Mercado auxiliar calculado apenas com finalizações reais disponíveis.",
        supportingStats: ["shots"],
        riskFlags,
      });
    }

    if (shotsOnTargetOver != null && confidence >= 40) {
      recommendedMarkets.push({
        market: "SOT",
        label: "Chutes no alvo acima da linha média",
        odd: probToOdd(shotsOnTargetOver),
        probability: shotsOnTargetOver,
        confidence: confidence - 7,
        reason: "Mercado auxiliar calculado apenas com chutes no alvo reais disponíveis.",
        supportingStats: ["shots_on_target"],
        riskFlags,
      });
    }

    if (cornersOver != null && confidence >= 40) {
      recommendedMarkets.push({
        market: "CORNERS",
        label: "Escanteios acima da linha média",
        odd: probToOdd(cornersOver),
        probability: cornersOver,
        confidence: confidence - 8,
        reason: "Mercado auxiliar calculado apenas com escanteios reais disponíveis.",
        supportingStats: ["corners"],
        riskFlags,
      });
    }

    if (cardsOver != null && confidence >= 40) {
      recommendedMarkets.push({
        market: "CARDS",
        label: "Cartões acima da linha média",
        odd: probToOdd(cardsOver),
        probability: cardsOver,
        confidence: confidence - 8,
        reason: "Mercado auxiliar calculado apenas com cartões reais disponíveis.",
        supportingStats: ["cards"],
        riskFlags,
      });
    }

    recommendedMarkets.sort((a, b) => b.confidence * b.probability - a.confidence * a.probability);

    return {
      matchId: feature.matchId,
      homeTeam: feature.homeTeam,
      awayTeam: feature.awayTeam,
      probabilities: { homeWin, draw, awayWin, over25, under25, bttsYes, bttsNo, cornersOver, cardsOver, shotsOver, shotsOnTargetOver },
      confidence,
      dataCoverageScore: feature.dataCoverageScore,
      riskFlags,
      valueOpportunities,
      recommendedMarkets,
      missingFeatures: feature.missingFeatures,
      sourceSnapshotIds: feature.sourceSnapshotIds,
      confidencePenalty: feature.confidencePenalty,
      internalExplanation,
    } satisfies MatchIntelligence;
  });

  const okItems = items.filter((item) => item.confidence > 0 && item.recommendedMarkets.length > 0);
  return {
    ok: okItems.length > 0,
    items,
    reason: okItems.length > 0 ? undefined : "no-actionable-intelligence",
  };
}
