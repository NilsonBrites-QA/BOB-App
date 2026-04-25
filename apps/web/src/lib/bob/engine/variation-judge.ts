/**
 * BOB — VariationJudge (Camada Cognitiva sobre as Variações)
 *
 * Entrada: 5 variações já geradas pelo motor determinístico
 * Saída:   mesmas variações enriquecidas com análise contextual:
 *   - bobNarrative: explicação editorial da estratégia da variação
 *   - keyInsight:    ponto-chave que justifica a aposta
 *   - riskAlerts:    alertas contextuais detectados pela LLM
 *   - confidence:    "alta" | "média" | "baixa"
 *
 * Cascade: Claude → GPT → Gemini → heurística determinística
 *
 * GARANTIA: nunca falha. Se todas as LLMs falharem, gera análise heurística
 * baseada nos dados estruturados (odds, anchors, divergência, etc).
 */

import type { ScoredMatch } from "./scoring";
import { llmCascadeJSON, type LLMProvider } from "../ai/llm-cascade";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type VariationEnrichment = {
  variationId: "V1" | "V2" | "V3" | "V4" | "V5";
  bobNarrative: string;
  keyInsight: string;
  riskAlerts: string[];
  confidence: "alta" | "média" | "baixa";
};

export type JudgeResult = {
  enrichments: VariationEnrichment[];
  provider: LLMProvider | "heuristic";
};

type VariationSnapshot = {
  id: "V1" | "V2" | "V3" | "V4" | "V5";
  combinedOdd: number;
  legCount: number;
  legs: Array<{
    match: string;
    pickOutcome: "Home" | "Draw" | "Away";
    pickOdd: number;
    isAnchor: boolean;
  }>;
};

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(
  variations: VariationSnapshot[],
  anchors: ScoredMatch[],
): string {
  const anchorsText = anchors
    .map((a, i) => `${i + 1}. ${a.homeTeam} x ${a.awayTeam} — score ${a.score} — odd casa ${a.homeOdd}`)
    .join("\n");

  const varsText = variations
    .map((v) => {
      const legs = v.legs
        .map((l) => `   • ${l.match} → ${l.pickOutcome} @${l.pickOdd.toFixed(2)}${l.isAnchor ? " [ÂNCORA]" : ""}`)
        .join("\n");
      return `${v.id} (odd combinada ${v.combinedOdd.toFixed(0)}x · ${v.legCount} jogos):\n${legs}`;
    })
    .join("\n\n");

  return `Você é o BOB, analista quantitativo do Brasileirão Série A. Sua função é avaliar 5 variações de bilhete Big Odds (alvo 900x+) já calculadas por motor determinístico e produzir análise editorial.

ÂNCORAS DA RODADA (jogos de maior confiança):
${anchorsText}

5 VARIAÇÕES GERADAS:
${varsText}

Para CADA variação (V1, V2, V3, V4, V5), produza:
- bobNarrative: 1-2 frases explicando a ESTRATÉGIA central (ex: "V1 protege com âncoras + favoritos modestos para construir base sólida")
- keyInsight: 1 frase com o ponto-chave decisivo (ex: "Flamengo em casa após 5 vitórias seguidas é o pilar")
- riskAlerts: array com 0-2 alertas contextuais reais (ex: "Empate do Botafogo é arriscado pós-eliminação")
- confidence: "alta" (odds <1500x e ≥3 âncoras), "média" (1500-3000x), "baixa" (>3000x ou sem âncoras)

Tom: assertivo, técnico, em português brasileiro. NÃO invente estatísticas. Use apenas o que está nos dados acima.

Responda APENAS um JSON válido neste formato exato (sem texto antes ou depois):
{
  "enrichments": [
    {"variationId": "V1", "bobNarrative": "...", "keyInsight": "...", "riskAlerts": ["..."], "confidence": "alta"},
    {"variationId": "V2", ...},
    {"variationId": "V3", ...},
    {"variationId": "V4", ...},
    {"variationId": "V5", ...}
  ]
}`;
}

// ─── Heurística de fallback ───────────────────────────────────────────────────

function heuristicEnrichment(v: VariationSnapshot): VariationEnrichment {
  const anchorCount = v.legs.filter((l) => l.isAnchor).length;
  const avgOdd = v.legs.reduce((s, l) => s + l.pickOdd, 0) / Math.max(v.legs.length, 1);
  const drawCount = v.legs.filter((l) => l.pickOutcome === "Draw").length;
  const awayCount = v.legs.filter((l) => l.pickOutcome === "Away").length;

  const intent: Record<typeof v.id, string> = {
    V1: "linha de segurança máxima — base de favoritos para minimizar variância",
    V2: "equilíbrio entre proteção e prêmio com âncoras + empates calculados",
    V3: "leitura lógica pura — segue o motor de pontuação sem desvios",
    V4: "pressão curta — escolhas de odd média com viés de valor",
    V5: "extrema — caça odd alta com mais zebras e empates contraintuitivos",
  };

  const confidence: VariationEnrichment["confidence"] =
    v.combinedOdd < 1500 && anchorCount >= 3
      ? "alta"
      : v.combinedOdd < 3000
        ? "média"
        : "baixa";

  const alerts: string[] = [];
  if (drawCount >= 3) alerts.push(`Concentração alta de empates (${drawCount}) eleva risco de perda total`);
  if (awayCount >= 3) alerts.push(`${awayCount} vitórias do visitante — variação contraintuitiva`);
  if (anchorCount === 0) alerts.push("Variação sem âncoras primárias — baixo lastro estrutural");
  if (avgOdd > 4) alerts.push(`Odd média ${avgOdd.toFixed(2)} indica perfil agressivo`);

  return {
    variationId: v.id,
    bobNarrative: `${v.id}: ${intent[v.id]}. Odd combinada ${v.combinedOdd.toFixed(0)}x em ${v.legCount} jogos${anchorCount > 0 ? ` com ${anchorCount} âncora${anchorCount > 1 ? "s" : ""}` : ""}.`,
    keyInsight:
      anchorCount > 0
        ? `${anchorCount} âncora${anchorCount > 1 ? "s" : ""} de alta confiança sustenta${anchorCount > 1 ? "m" : ""} o bilhete`
        : `Bilhete sem âncoras — depende exclusivamente da leitura quantitativa do motor`,
    riskAlerts: alerts.slice(0, 2),
    confidence,
  };
}

// ─── API pública ──────────────────────────────────────────────────────────────

export async function judgeVariations(
  variations: VariationSnapshot[],
  anchors: ScoredMatch[],
): Promise<JudgeResult> {
  // Sempre prepara fallback heurístico — usado se LLMs falharem
  const heuristic = variations.map(heuristicEnrichment);

  // Se ambiente sem LLM, retorna heurística direta (sem latência)
  const hasLLM = !!process.env.ANTHROPIC_API_KEY || !!process.env.OPENAI_API_KEY || !!process.env.GEMINI_API_KEY;
  if (!hasLLM) {
    return { enrichments: heuristic, provider: "heuristic" };
  }

  const prompt = buildPrompt(variations, anchors);

  type RawResponse = { enrichments?: Array<Partial<VariationEnrichment>> };
  const { data, provider } = await llmCascadeJSON<RawResponse>(prompt, { maxTokens: 1800 });

  if (!data?.enrichments || !Array.isArray(data.enrichments) || data.enrichments.length === 0) {
    return { enrichments: heuristic, provider: "heuristic" };
  }

  // Mesclar: usar resposta da LLM, mas garantir que toda variação tem enrichment
  const merged: VariationEnrichment[] = variations.map((v) => {
    const fromLLM = data.enrichments!.find((e) => e.variationId === v.id);
    if (
      fromLLM &&
      typeof fromLLM.bobNarrative === "string" &&
      typeof fromLLM.keyInsight === "string"
    ) {
      return {
        variationId: v.id,
        bobNarrative: fromLLM.bobNarrative,
        keyInsight: fromLLM.keyInsight,
        riskAlerts: Array.isArray(fromLLM.riskAlerts) ? fromLLM.riskAlerts.slice(0, 3) : [],
        confidence:
          fromLLM.confidence === "alta" || fromLLM.confidence === "média" || fromLLM.confidence === "baixa"
            ? fromLLM.confidence
            : "média",
      };
    }
    // LLM não cobriu essa variação — usa heurística pra ela
    return heuristic.find((h) => h.variationId === v.id) ?? heuristic[0]!;
  });

  return { enrichments: merged, provider };
}
