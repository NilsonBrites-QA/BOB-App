import { llmCascadeJSON, type LLMProvider } from "@/lib/bob/ai/llm-cascade";
import type { MatchInput } from "@/lib/bob/engine/scoring";
import type { FeatureBuilderResult } from "@/lib/bob/analytics/feature-builder";
import type { MatchIntelligenceResult } from "@/lib/bob/analytics/match-intelligence";
import type { AnalyticsAnchorSelection } from "@/lib/bob/analytics/anchor-score";
import type { VariationsResult } from "@/lib/bob/engine/beam-search";

export const VARIATION_COGNITIVE_REVIEW_PROMPT_VERSION = "variation-cognitive-review-v1";

export type VariationCognitiveDataRequest = {
  scope: "match" | "team" | "player" | "market" | "weather" | "lineup" | "history" | "referee" | "other";
  priority: "critical" | "important" | "optional";
  description: string;
  reason: string;
  expectedImpact: string;
};

export type VariationCognitiveReview = {
  approved: boolean;
  approvalStatus: "approved" | "approved_with_warnings" | "rejected" | "llm_unavailable";
  confidence: number;
  cognitiveSummary: string;
  anchorReviews: Array<{
    teamName: string;
    matchId: string;
    approved: boolean;
    reason: string;
    supportingEvidence: string[];
    riskFlags: string[];
    missingEvidence: string[];
    whatCouldBreakThisAnchor: string;
  }>;
  variationReviews: Array<{
    variationName: string;
    approved: boolean;
    reason: string;
    strongestLegs: string[];
    weakestLegs: string[];
    riskFlags: string[];
    whyThisCombinationMakesSense: string;
    whatCouldBreakThisTicket: string;
    bigOddsAssessment: string;
  }>;
  dataRequests: VariationCognitiveDataRequest[];
  rejectedBecause: string[];
  finalBobReading: string;
  memoryNotes: string[];
  provider: LLMProvider;
  model: string | null;
  promptVersion: typeof VARIATION_COGNITIVE_REVIEW_PROMPT_VERSION;
};

export type VariationCognitiveReviewInput = {
  roundContext: {
    season: number;
    round: number;
    competition: string;
    source: string;
    reason: string;
    fixturesCount: number;
    firstKickoffAt?: string | null;
    roundMode?: string | null;
  };
  matches: MatchInput[];
  featureResult: FeatureBuilderResult;
  intelligenceResult: MatchIntelligenceResult;
  anchorSelection: AnalyticsAnchorSelection;
  variationsResult: VariationsResult;
  oddsSnapshots: unknown[];
  missingFeatures: string[];
  dataCoverage: number;
  riskFlags: string[];
  memoryContext?: unknown;
  engineVersion: string;
};

type RawReview = Partial<Omit<VariationCognitiveReview, "provider" | "model" | "promptVersion">>;

function providerModel(provider: LLMProvider): string | null {
  if (provider === "claude") return "claude-sonnet-4.5";
  if (provider === "gpt") return "gpt-4o-mini";
  if (provider === "gemini") return "gemini-2.0-flash";
  return null;
}

function clampConfidence(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function hasLLMKeys() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);
}

function unavailableReview(provider: LLMProvider = "none", reason = "llm_unavailable"): VariationCognitiveReview {
  return {
    approved: false,
    approvalStatus: "llm_unavailable",
    confidence: 0,
    cognitiveSummary: "Revisão cognitiva indisponível. O BOB não aprovou nem inventou análise.",
    anchorReviews: [],
    variationReviews: [],
    dataRequests: [],
    rejectedBecause: [reason],
    finalBobReading: "",
    memoryNotes: [],
    provider,
    model: providerModel(provider),
    promptVersion: VARIATION_COGNITIVE_REVIEW_PROMPT_VERSION,
  };
}

function compactPackage(input: VariationCognitiveReviewInput) {
  return {
    roundContext: input.roundContext,
    engineVersion: input.engineVersion,
    dataCoverage: input.dataCoverage,
    missingFeatures: input.missingFeatures,
    riskFlags: input.riskFlags,
    matches: input.matches.map((match) => ({
      id: match.id,
      match: match.match,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      scheduledAt: match.scheduledAt,
      status: match.status,
      odds1x2: {
        homeOdd: match.homeOdd,
        drawOdd: match.drawOdd,
        awayOdd: match.awayOdd,
      },
    })),
    featuresByMatch: input.featureResult.features.map((feature) => ({
      matchId: feature.matchId,
      homeTeam: feature.homeTeam,
      awayTeam: feature.awayTeam,
      dataCoverageScore: feature.dataCoverageScore,
      missingFeatures: feature.missingFeatures,
      availableFeatureKeys: Object.keys(feature.features),
      sourceSnapshotIds: feature.sourceSnapshotIds,
      confidencePenalty: feature.confidencePenalty,
      source: feature.source,
    })),
    matchIntelligenceByMatch: input.intelligenceResult.items.map((item) => ({
      matchId: item.matchId,
      homeTeam: item.homeTeam,
      awayTeam: item.awayTeam,
      probabilities: item.probabilities,
      confidence: item.confidence,
      dataCoverageScore: item.dataCoverageScore,
      riskFlags: item.riskFlags,
      valueOpportunities: item.valueOpportunities,
      recommendedMarkets: item.recommendedMarkets,
      missingFeatures: item.missingFeatures,
      sourceSnapshotIds: item.sourceSnapshotIds,
    })),
    anchors: input.anchorSelection.anchors.map((anchor) => ({
      matchId: anchor.id,
      teamName: anchor.suggestedResult === "2" ? anchor.awayTeam : anchor.homeTeam,
      homeTeam: anchor.homeTeam,
      awayTeam: anchor.awayTeam,
      suggestedResult: anchor.suggestedResult,
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
    variations: input.variationsResult.variations.map((variation) => ({
      id: variation.id,
      combinedOdd: variation.combinedOdd,
      probabilityMass: variation.probabilityMass,
      oddsClass: variation.oddsClass,
      legCount: variation.legCount,
      anchorPrimaryCount: variation.anchorPrimaryCount,
      transparencyNotes: variation.transparencyNotes,
      legs: variation.legs.map((leg) => ({
        matchId: leg.matchId,
        match: leg.match,
        pickOutcome: leg.pickOutcome,
        pickOdd: leg.pickOdd,
        fairOdd: leg.fairOdd,
        cleanProb: leg.cleanProb,
        isAnchor: leg.isAnchor,
      })),
    })),
    oddsSnapshots: input.oddsSnapshots,
    memoryContext: input.memoryContext ?? null,
  };
}

function buildPrompt(input: VariationCognitiveReviewInput) {
  const payload = JSON.stringify(compactPackage(input));
  return `Você é a camada cognitiva crítica do BOB — Big Odds Brasileirão.

Você NÃO escolhe picks. Você NÃO substitui Feature Builder, Match Intelligence, de-vigging, Anchor Score ou Beam Search.
Seu trabalho é auditar o pacote analítico e aprovar/reprovar a entrega oficial.

REGRAS DURAS:
- Você só pode citar números que estejam no JSON de entrada.
- Se um dado não estiver no JSON, marque como missingEvidence ou dataRequests.
- Não invente médias.
- Não invente estatísticas.
- Não invente lesões.
- Não invente clima.
- Não invente histórico.
- Não use "eu acho".
- Use "A leitura se apoia em..." quando justificar.
- Se faltar dado crítico, reprove ou aprove com warnings.
- Se qualquer variação não for sustentada por probabilidades/features, reprove.
- Se a odd total de uma variação ficar abaixo de 900, registre risco big_odds_threshold_not_reached.

Plano de Investigação Cognitiva:
1. Quais dimensões de análise são essenciais para essa rodada?
2. Quais riscos podem estar invisíveis nos dados atuais?
3. Quais evidências faltantes poderiam mudar uma âncora?
4. Quais mercados parecem mal sustentados?
5. Quais jogos têm maior risco de empate?
6. Quais jogos têm maior risco de zebra?
7. Quais fatores externos deveriam ser verificados?
8. Quais padrões históricos/memórias do BOB são relevantes?

Dimensões que você pode solicitar em dataRequests quando faltarem: casa/fora, últimos 5/10 jogos, gols por tempo, chutes, chutes no alvo, finalizações contra, escanteios, cartões, faltas, jogadores que mais finalizam, jogadores que mais chutam no alvo, jogadores que mais tomam cartão, jogadores que mais sofrem falta, goleadores, desfalques, escalação provável, calendário, viagem, clima, gramado, árbitro, clássico, motivação de tabela, oscilação de odds, divergência mercado/modelo, padrões de memória, fragilidade defensiva específica, bolas paradas, desempenho após sofrer/abrir placar.

JSON DE ENTRADA:
${payload}

Responda APENAS JSON válido, sem markdown:
{
  "approved": true,
  "approvalStatus": "approved",
  "confidence": 0.72,
  "cognitiveSummary": "string",
  "anchorReviews": [
    {
      "teamName": "string",
      "matchId": "string",
      "approved": true,
      "reason": "string",
      "supportingEvidence": ["string"],
      "riskFlags": ["string"],
      "missingEvidence": ["string"],
      "whatCouldBreakThisAnchor": "string"
    }
  ],
  "variationReviews": [
    {
      "variationName": "V1",
      "approved": true,
      "reason": "string",
      "strongestLegs": ["string"],
      "weakestLegs": ["string"],
      "riskFlags": ["string"],
      "whyThisCombinationMakesSense": "string",
      "whatCouldBreakThisTicket": "string",
      "bigOddsAssessment": "string"
    }
  ],
  "dataRequests": [
    {
      "scope": "match",
      "priority": "critical",
      "description": "string",
      "reason": "string",
      "expectedImpact": "string"
    }
  ],
  "rejectedBecause": [],
  "finalBobReading": "string",
  "memoryNotes": ["string"]
}`;
}

function normalizeReview(raw: RawReview, provider: LLMProvider): VariationCognitiveReview {
  const approvalStatus = raw.approvalStatus === "approved" ||
    raw.approvalStatus === "approved_with_warnings" ||
    raw.approvalStatus === "rejected"
    ? raw.approvalStatus
    : raw.approved === true ? "approved_with_warnings" : "rejected";
  const approved = approvalStatus === "approved" || approvalStatus === "approved_with_warnings";
  return {
    approved,
    approvalStatus,
    confidence: clampConfidence(raw.confidence),
    cognitiveSummary: typeof raw.cognitiveSummary === "string" ? raw.cognitiveSummary : "",
    anchorReviews: Array.isArray(raw.anchorReviews) ? raw.anchorReviews : [],
    variationReviews: Array.isArray(raw.variationReviews) ? raw.variationReviews : [],
    dataRequests: Array.isArray(raw.dataRequests) ? raw.dataRequests : [],
    rejectedBecause: Array.isArray(raw.rejectedBecause) ? raw.rejectedBecause.filter((item): item is string => typeof item === "string") : [],
    finalBobReading: typeof raw.finalBobReading === "string" ? raw.finalBobReading : "",
    memoryNotes: Array.isArray(raw.memoryNotes) ? raw.memoryNotes.filter((item): item is string => typeof item === "string") : [],
    provider,
    model: providerModel(provider),
    promptVersion: VARIATION_COGNITIVE_REVIEW_PROMPT_VERSION,
  };
}

export async function reviewOfficialVariationPackageWithLLM(
  input: VariationCognitiveReviewInput,
): Promise<VariationCognitiveReview> {
  if (process.env.BOB_DISABLE_LLM === "1" || process.env.BOB_DISABLE_LLM === "true" || !hasLLMKeys()) {
    return unavailableReview("none", "llm_review_not_configured");
  }

  const { data, provider } = await llmCascadeJSON<RawReview>(buildPrompt(input), { maxTokens: 3800 });
  if (!data) return unavailableReview(provider, "llm_review_failed_or_invalid_json");
  return normalizeReview(data, provider);
}
