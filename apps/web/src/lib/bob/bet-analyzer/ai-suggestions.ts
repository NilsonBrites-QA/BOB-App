/**
 * BOB Bet Analyzer - Camada de IA
 * 
 * Gera justificativas e explicações detalhadas usando Claude/OpenAI.
 * Cache de sugestões para evitar re-chamadas desnecessárias.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { MatchProbabilities, ProfileScore } from "./engine";
import type { MatchInput } from "../engine/scoring";

// ─── Configuração ───────────────────────────────────────────────────────────

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Cache em memória (TTL: 1 hora)
const suggestionCache = new Map<string, { data: AISuggestion; expires: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

// ─── Tipos ─────────────────────────────────────────────────────────────────

export type AISuggestion = {
  market: string;
  selection: string;
  selectionLabel: string;
  suggestedOdd: number;
  confidenceScore: number;
  qualityRating: "A" | "B" | "C" | "D";
  aiJustification: string;
  aiFactors: {
    keyFactor: string;
    supportingStats: string[];
    riskFactors: string[];
    contraIndicators?: string[];
  };
  alternativeSuggestion?: {
    market: string;
    selection: string;
    reason: string;
  };
};

export type MatchSuggestions = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  profile: string;
  primarySuggestion: AISuggestion;
  secondarySuggestions: AISuggestion[];
  fullAnalysis: string;
  generatedAt: string;
  model: "claude" | "gpt" | "offline";
};

// ─── Funções Principais ─────────────────────────────────────────────────────

/**
 * Gera sugestões de IA para uma partida e perfil.
 * Usa cache para evitar re-chamadas.
 */
export async function generateAISuggestions(
  match: MatchInput,
  probabilities: MatchProbabilities,
  profileScores: ProfileScore[],
  profile: string
): Promise<MatchSuggestions> {
  // Cache key
  const cacheKey = `${match.id}-${profile}-${new Date().toISOString().slice(0, 10)}`;
  
  // Verificar cache
  const cached = suggestionCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    console.log(`[AI Suggestions] Cache hit for ${cacheKey}`);
    return cached.data as unknown as MatchSuggestions;
  }
  
  // Gerar nova sugestão
  const result = await generateWithAI(match, probabilities, profileScores, profile);
  
  // Salvar no cache
  suggestionCache.set(cacheKey, {
    data: result as unknown as AISuggestion,
    expires: Date.now() + CACHE_TTL_MS,
  });
  
  return result;
}

/**
 * Gera sugestão usando Claude ou GPT.
 */
async function generateWithAI(
  match: MatchInput,
  probabilities: MatchProbabilities,
  profileScores: ProfileScore[],
  profile: string
): Promise<MatchSuggestions> {
  // Pegar top 3 scores para este perfil
  const topScores = profileScores.slice(0, 3);
  
  if (topScores.length === 0) {
    return generateOfflineSuggestion(match, probabilities, profile);
  }
  
  // Tentar Claude primeiro
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await generateWithClaude(match, probabilities, topScores, profile);
    } catch (err) {
      console.error("[AI Suggestions] Claude failed:", err);
    }
  }
  
  // Fallback para GPT
  if (process.env.OPENAI_API_KEY) {
    try {
      return await generateWithGPT(match, probabilities, topScores, profile);
    } catch (err) {
      console.error("[AI Suggestions] GPT failed:", err);
    }
  }
  
  // Offline mode
  return generateOfflineSuggestion(match, probabilities, profile);
}

/**
 * Gera justificativa usando Claude Sonnet.
 */
async function generateWithClaude(
  match: MatchInput,
  probabilities: MatchProbabilities,
  topScores: ProfileScore[],
  profile: string
): Promise<MatchSuggestions> {
  const primary = topScores[0];
  
  const prompt = buildPrompt(match, probabilities, topScores, profile);
  
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20251001", // Último modelo disponível
    max_tokens: 2000,
    temperature: 0.7,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });
  
  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }
  
  // Parse da resposta (esperamos JSON)
  try {
    const aiResponse = JSON.parse(content.text);
    
    return {
      matchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      profile,
      primarySuggestion: {
        market: primary.market,
        selection: primary.selection,
        selectionLabel: formatSelectionLabel(primary),
        suggestedOdd: primary.odd,
        confidenceScore: Math.round(primary.confidence * 100),
        qualityRating: calculateQualityRating(primary.score),
        aiJustification: aiResponse.justification || aiResponse.aiJustification,
        aiFactors: aiResponse.factors || aiResponse.aiFactors || {
          keyFactor: primary.reasoning[0] || "Análise estatística",
          supportingStats: primary.reasoning.slice(1),
          riskFactors: [],
        },
        alternativeSuggestion: aiResponse.alternative,
      },
      secondarySuggestions: topScores.slice(1).map(score => ({
        market: score.market,
        selection: score.selection,
        selectionLabel: formatSelectionLabel(score),
        suggestedOdd: score.odd,
        confidenceScore: Math.round(score.confidence * 100),
        qualityRating: calculateQualityRating(score.score),
        aiJustification: `Alternativa com score ${score.score}/100. ${score.reasoning.join(" ")}`,
        aiFactors: {
          keyFactor: score.reasoning[0] || "Fator secundário",
          supportingStats: score.reasoning.slice(1),
          riskFactors: [],
        },
      })),
      fullAnalysis: aiResponse.fullAnalysis || aiResponse.analysis || "",
      generatedAt: new Date().toISOString(),
      model: "claude",
    };
  } catch (err) {
    // Se falhar o parse, usar modo offline
    console.error("[AI Suggestions] Failed to parse Claude response:", err);
    return generateOfflineSuggestion(match, probabilities, profile, topScores);
  }
}

/**
 * Gera justificativa usando GPT-4o-mini.
 */
async function generateWithGPT(
  match: MatchInput,
  probabilities: MatchProbabilities,
  topScores: ProfileScore[],
  profile: string
): Promise<MatchSuggestions> {
  const primary = topScores[0];
  
  const prompt = buildPrompt(match, probabilities, topScores, profile);
  
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 2000,
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content: "Você é o BOB, um analista de apostas esportivas brasileiro. Responda em português do Brasil em formato JSON.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    response_format: { type: "json_object" },
  });
  
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from GPT");
  }
  
  try {
    const aiResponse = JSON.parse(content);
    
    return {
      matchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      profile,
      primarySuggestion: {
        market: primary.market,
        selection: primary.selection,
        selectionLabel: formatSelectionLabel(primary),
        suggestedOdd: primary.odd,
        confidenceScore: Math.round(primary.confidence * 100),
        qualityRating: calculateQualityRating(primary.score),
        aiJustification: aiResponse.justification || aiResponse.aiJustification,
        aiFactors: aiResponse.factors || aiResponse.aiFactors || {
          keyFactor: primary.reasoning[0] || "Análise estatística",
          supportingStats: primary.reasoning.slice(1),
          riskFactors: [],
        },
      },
      secondarySuggestions: topScores.slice(1).map(score => ({
        market: score.market,
        selection: score.selection,
        selectionLabel: formatSelectionLabel(score),
        suggestedOdd: score.odd,
        confidenceScore: Math.round(score.confidence * 100),
        qualityRating: calculateQualityRating(score.score),
        aiJustification: `Alternativa com score ${score.score}/100. ${score.reasoning.join(" ")}`,
        aiFactors: {
          keyFactor: score.reasoning[0] || "Fator secundário",
          supportingStats: score.reasoning.slice(1),
          riskFactors: [],
        },
      })),
      fullAnalysis: aiResponse.fullAnalysis || aiResponse.analysis || "",
      generatedAt: new Date().toISOString(),
      model: "gpt",
    };
  } catch (err) {
    console.error("[AI Suggestions] Failed to parse GPT response:", err);
    return generateOfflineSuggestion(match, probabilities, profile, topScores);
  }
}

/**
 * Gera sugestão offline (sem IA) quando APIs falham.
 */
function generateOfflineSuggestion(
  match: MatchInput,
  probabilities: MatchProbabilities,
  profile: string,
  topScores?: ProfileScore[]
): MatchSuggestions {
  const profileLabel = {
    conservador: "Conservador",
    moderado: "Moderado",
    agressivo: "Agressivo",
    matematico: "Matemático",
  }[profile] || profile;
  
  // Usar ProfileScore se disponível, senão converter MarketProbability
  let bestSuggestion: {
    market: string;
    selection: string;
    suggestedOdd: number;
    confidenceScore: number;
    qualityRating: "A" | "B" | "C" | "D";
    aiJustification: string;
    aiFactors: AISuggestion["aiFactors"];
  };
  
  if (topScores && topScores.length > 0) {
    const best = topScores[0];
    bestSuggestion = {
      market: best.market,
      selection: best.selection,
      suggestedOdd: best.odd,
      confidenceScore: Math.round(best.confidence * 100),
      qualityRating: calculateQualityRating(best.score),
      aiJustification: buildOfflineJustification(match, best, profileLabel),
      aiFactors: {
        keyFactor: best.reasoning[0] || "Análise estatística",
        supportingStats: best.reasoning.slice(1).length > 0 
          ? best.reasoning.slice(1) 
          : [`Score calculado: ${best.score}/100`],
        riskFactors: probabilities.factors.uncertainty > 0.3 
          ? ["Partida equilibrada - resultado incerto"] 
          : [],
      },
    };
  } else {
    // Fallback: usar probabilidades diretamente
    const bestMarket = probabilities.markets.reduce((best, current) => 
      current.probability > best.probability ? current : best
    );
    bestSuggestion = {
      market: bestMarket.market,
      selection: bestMarket.selection,
      suggestedOdd: bestMarket.impliedOdd,
      confidenceScore: Math.round(bestMarket.confidence * 100),
      qualityRating: "B",
      aiJustification: `Baseado em probabilidade calculada de ${(bestMarket.probability * 100).toFixed(1)}% com odd @${bestMarket.impliedOdd.toFixed(2)}.`,
      aiFactors: {
        keyFactor: "Análise probabilística",
        supportingStats: [
          `Probabilidade: ${(bestMarket.probability * 100).toFixed(1)}%`,
          `Odd: @${bestMarket.impliedOdd.toFixed(2)}`,
          `Confiança: ${(bestMarket.confidence * 100).toFixed(0)}%`,
        ],
        riskFactors: probabilities.factors.uncertainty > 0.3 
          ? ["Partida equilibrada - resultado incerto"] 
          : [],
      },
    };
  }
  
  return {
    matchId: match.id,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    profile,
    primarySuggestion: {
      ...bestSuggestion,
      selectionLabel: formatSelectionLabel({
        market: bestSuggestion.market,
        selection: bestSuggestion.selection,
      } as ProfileScore),
    },
    secondarySuggestions: (topScores || []).slice(1).map(score => ({
      market: score.market,
      selection: score.selection,
      selectionLabel: formatSelectionLabel(score),
      suggestedOdd: score.odd,
      confidenceScore: Math.round(score.confidence * 100),
      qualityRating: calculateQualityRating(score.score),
      aiJustification: `Alternativa com score ${score.score}/100. ${score.reasoning.join(" ")}`,
      aiFactors: {
        keyFactor: score.reasoning[0] || "Fator secundário",
        supportingStats: score.reasoning.slice(1),
        riskFactors: [],
      },
    })),
    fullAnalysis: bestSuggestion.aiJustification,
    generatedAt: new Date().toISOString(),
    model: "offline",
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildPrompt(
  match: MatchInput,
  probabilities: MatchProbabilities,
  topScores: ProfileScore[],
  profile: string
): string {
  const primary = topScores[0];
  const secondary = topScores.slice(1);
  
  const profileDescriptions: Record<string, string> = {
    conservador: "apostador conservador que busca alta probabilidade de acerto com odds entre 1.20-1.70",
    moderado: "apostador moderado que equilibra risco e retorno com odds entre 1.75-4.50",
    agressivo: "apostador agressivo que busca odds altas (3.00-15.00) aceitando maior risco",
    matematico: "apostador matemático que busca value bets com EV positivo",
  };
  
  return `Analise a seguinte partida do Brasileirão e gere uma recomendação de aposta para um ${profileDescriptions[profile] || profile}.

PARTIDA: ${match.homeTeam} vs ${match.awayTeam}

CONTEXTO:
- Posição na tabela: Casa ${match.homePosition}º, Fora ${match.awayPosition}º
- Forma recente (últimos 5): Casa [${match.homeForm.join(", ")}], Fora [${match.awayForm.join(", ")}]
- Gols nos últimos 5: Casa ${match.homeGoalsScored5} marcados / ${match.homeGoalsConceded5} sofridos
- Gols nos últimos 5: Fora ${match.awayGoalsScored5} marcados / ${match.awayGoalsConceded5} sofridos
- H2H (vitórias do mandante): ${(match.h2hHomeWinRate * 100).toFixed(0)}%
- Odds do mercado: Casa ${match.homeOdd}, Empate ${match.drawOdd}, Fora ${match.awayOdd}

PROBABILIDADES CALCULADAS:
- Vitória Casa: ${(probabilities.probabilities.homeWin * 100).toFixed(1)}%
- Empate: ${(probabilities.probabilities.draw * 100).toFixed(1)}%
- Vitória Fora: ${(probabilities.probabilities.awayWin * 100).toFixed(1)}%
- Ambos Marcam (Sim): ${(probabilities.probabilities.bttsYes * 100).toFixed(1)}%
- Over 2.5 Gols: ${(probabilities.probabilities.over2_5 * 100).toFixed(1)}%

MELHOR OPÇÃO PARA ESTE PERFIL:
- Mercado: ${primary.market}
- Seleção: ${primary.selection}
- Odd: ${primary.odd}
- Score do sistema: ${primary.score}/100
- Motivo: ${primary.reasoning.join("; ")}

${secondary.length > 0 ? `ALTERNATIVAS:\n${secondary.map((s, i) => `${i + 1}. ${s.market} - ${s.selection} (odd ${s.odd}, score ${s.score})`).join("\n")}` : ""}

Responda em JSON com esta estrutura:
{
  "justification": "Justificativa detalhada em português do Brasil, explicando por que esta aposta é boa para o perfil ${profile}",
  "factors": {
    "keyFactor": "O fator mais importante que justifica esta aposta",
    "supportingStats": ["Estatística 1", "Estatística 2", "Estatística 3"],
    "riskFactors": ["Risco 1", "Risco 2"]
  },
  "fullAnalysis": "Análise completa da partida em 2-3 parágrafos, discutindo contexto, forma dos times, e por que a seleção recomendada faz sentido"
}`;
}

function buildOfflineJustification(
  match: MatchInput,
  score: ProfileScore,
  profileLabel: string
): string {
  const selection = score.selection;
  const marketType = score.market;
  const odd = score.odd.toFixed(2);
  
  let justification = `Para o perfil ${profileLabel}, recomendamos `;
  
  if (marketType === "1x2") {
    if (selection === "home") {
      justification += `a vitória do ${match.homeTeam} @${odd}. `;
      justification += score.reasoning.length > 0 
        ? score.reasoning.join(". ") 
        : `Apresenta ${match.homePosition < match.awayPosition ? "vantagem de posição na tabela" : "vantagem em casa"}.`;
    } else if (selection === "away") {
      justification += `a vitória do ${match.awayTeam} @${odd}. `;
      justification += score.reasoning.length > 0 
        ? score.reasoning.join(". ") 
        : `Apesar de jogar fora, apresenta condições favoráveis.`;
    } else {
      justification += `o empate @${odd}. `;
      justification += score.reasoning.length > 0 
        ? score.reasoning.join(". ") 
        : `Partida equilibrada entre as equipes.`;
    }
  } else if (marketType === "btts") {
    if (selection === "yes" || selection === "sim") {
      justification += `ambos os times marcarem @${odd}. `;
      justification += score.reasoning.length > 0 
        ? score.reasoning.join(". ") 
        : `Ambas equipes vêm demonstrando poderio ofensivo.`;
    } else {
      justification += `pelo menos um time não marcar @${odd}. `;
      justification += score.reasoning.length > 0 
        ? score.reasoning.join(". ") 
        : `Há indicações de dificuldades ofensivas.`;
    }
  } else if (marketType === "over_under") {
    if (selection?.toString().startsWith("over")) {
      justification += `over de gols @${odd}. `;
      justification += score.reasoning.length > 0 
        ? score.reasoning.join(". ") 
        : `Histórico de gols indica partida movimentada.`;
    } else {
      justification += `under de gols @${odd}. `;
      justification += score.reasoning.length > 0 
        ? score.reasoning.join(". ") 
        : `Histórico sugere partida fechada.`;
    }
  } else {
    justification += `${marketType} - ${selection} @${odd}. `;
    justification += score.reasoning.join(". ") || "Seleção baseada em análise estatística.";
  }
  
  return justification;
}

function formatSelectionLabel(score: ProfileScore): string {
  const labels: Record<string, Record<string, string>> = {
    "1x2": {
      home: "Vitória do Mandante",
      draw: "Empate",
      away: "Vitória do Visitante",
    },
    btts: {
      yes: "Ambos Marcam - Sim",
      no: "Ambos Marcam - Não",
    },
    over_under: {
      over_1_5: "Over 1.5 Gols",
      over_2_5: "Over 2.5 Gols",
      over_3_5: "Over 3.5 Gols",
      under_1_5: "Under 1.5 Gols",
      under_2_5: "Under 2.5 Gols",
      under_3_5: "Under 3.5 Gols",
    },
  };
  
  return labels[score.market]?.[score.selection] || `${score.market} - ${score.selection}`;
}

function calculateQualityRating(score: number): "A" | "B" | "C" | "D" {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}

// ─── Exportações ────────────────────────────────────────────────────────────

export { suggestionCache };
