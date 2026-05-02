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

export type VariationReplacement = {
  variationId: "V1" | "V2" | "V3" | "V4" | "V5";
  fromMatchId: string;
  toMatchId: string;
  reason: string;
  approved?: boolean;
};

export type JudgeResult = {
  enrichments: VariationEnrichment[];
  replacements: VariationReplacement[];
  provider: LLMProvider | "heuristic";
};

export type VariationSnapshot = {
  id: "V1" | "V2" | "V3" | "V4" | "V5";
  combinedOdd: number;
  legCount: number;
  legs: Array<{
    matchId?: string;
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
  poolAvailable: ScoredMatch[],
): string {
  // Calcular sobreposição entre pares de variações para mostrar à LLM
  const overlapMatrix = variations.map((v1) =>
    variations.map((v2) => {
      if (v1.id === v2.id) return "-";
      const ids1 = new Set(v1.legs.map((l) => l.matchId));
      const shared = v2.legs.filter((l) => ids1.has(l.matchId)).length;
      const pct = Math.round((shared / Math.max(v1.legs.length, v2.legs.length)) * 100);
      return `${pct}%`;
    })
  );
  const overlapText = variations
    .map((v, i) => `  ${v.id}: [${variations.map((_, j) => overlapMatrix[i]![j]).join(" | ")}]`)
    .join("\n");

  const anchorsText = anchors
    .map(
      (a, i) =>
        `${i + 1}. [id:${a.id}] ${a.homeTeam} x ${a.awayTeam} — score ${a.score.toFixed(0)} — casa ${a.homeOdd} | empate ${a.drawOdd} | fora ${a.awayOdd}`,
    )
    .join("\n");

  const poolText = poolAvailable
    .slice(0, 14)
    .map(
      (m) =>
        `[id:${m.id}] ${m.homeTeam} x ${m.awayTeam} — score ${m.score.toFixed(0)} — casa ${m.homeOdd} | empate ${m.drawOdd} | fora ${m.awayOdd}`,
    )
    .join("\n");

  const varsText = variations
    .map((v) => {
      const legs = v.legs
        .map(
          (l) =>
            `   • [match:${l.matchId ?? "?"}] ${l.match} → ${l.pickOutcome} @${l.pickOdd.toFixed(2)}${l.isAnchor ? " [ÂNCORA]" : ""}`,
        )
        .join("\n");
      return `${v.id} (odd combinada ${v.combinedOdd.toFixed(0)}x · ${v.legCount} jogos):\n${legs}`;
    })
    .join("\n\n");

  return `Você é o BOB — analista quantitativo sênior do Brasileirão Série A, especialista em construção de bilhetes Big Odds (900x+).

Seu trabalho é AUDITAR CRITICAMENTE 5 variações geradas por motor determinístico e devolver:
1. Análise editorial profunda de cada variação
2. Substituições obrigatórias onde houver duplicação ou pick subótimo

═══════════════════════════════════════════════
ÂNCORAS DA RODADA (confiança máxima — NUNCA substituir):
${anchorsText}

POOL DISPONÍVEL PARA SUBSTITUIÇÕES:
${poolText}

5 VARIAÇÕES DO MOTOR:
${varsText}

MATRIZ DE SOBREPOSIÇÃO ENTRE VARIAÇÕES (colunas = V1|V2|V3|V4|V5):
${overlapText}
═══════════════════════════════════════════════

REGRAS DE ANÁLISE OBRIGATÓRIAS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
① DIVERSIDADE FORÇADA: Se duas variações têm sobreposição > 50% (excluindo âncoras),
   OBRIGATORIAMENTE proponha substituição na variação de menor confiança.
   Cada variação deve ter identidade distinta — estratégia diferente, não só picks diferentes.

② PERFIL ESTRATÉGICO de cada variação:
   - V1 (Segurança): máxima confiança, mínimo risco. Favorece favoritos absolutos.
   - V2 (Equilíbrio): balanceia segurança com empates calculados. Empates devem ter ratio draw/home < 2.0.
   - V3 (Lógica Pura): segue estritamente o motor. Aceita favoritos menos óbvios (homeOdd 1.6–2.4).
   - V4 (Pressão Curta): menos jogos, mais valor por pick. Homeodds mais altas. Contrarian em 1 pick.
   - V5 (Extrema): aceita azarões (away < 3.6) e empates contraintuitivos. Alto risco, alta recompensa.

③ VALOR ESPERADO: Para cada pick fora das âncoras, considere se a odd de mercado está dentro do
   valor justo (Poisson implícito). Se homeOdd < 1.35, o valor esperado é negativo — alerte.

④ PICKS SUBÓTIMOS — condições para substituição obrigatória:
   - Pick repetido em 3+ variações sem ser âncora (rompe diversidade)
   - Empate com drawOdd > 3.60 (estatisticamente raro demais)
   - Vitória do visitante com awayOdd > 4.00 em variação conservadora (V1/V2)
   - HomeOdd < 1.25 (odd baixa demais — custo de oportunidade alto)

REGRAS DURAS (nunca violar):
- NÃO substitua âncoras [ÂNCORA]
- NÃO invente IDs — use apenas ids das listas acima
- NÃO invente estatísticas — use só os dados fornecidos
- Máximo 2 substituições por variação
- bobNarrative deve ser analítico, não genérico (mencione times e odds específicos)

Responda APENAS JSON válido (sem markdown, sem texto antes/depois):
{
  "enrichments": [
    {
      "variationId": "V1",
      "bobNarrative": "<análise específica mencionando times e odds — 2 frases mínimo>",
      "keyInsight": "<ponto decisivo único desta variação — diferente das outras>",
      "riskAlerts": ["<alerta 1 específico>"],
      "confidence": "alta"
    },
    {"variationId": "V2", ...},
    {"variationId": "V3", ...},
    {"variationId": "V4", ...},
    {"variationId": "V5", ...}
  ],
  "replacements": [
    {
      "variationId": "<qual variação ajustar>",
      "fromMatchId": "<id do pick atual a remover — NUNCA âncora>",
      "toMatchId": "<id do pick do pool que entra>",
      "reason": "<justificativa analítica em 1 frase — cite odds e contexto>"
    }
  ]
}

O array "replacements" deve estar PREENCHIDO se houver sobreposição > 50% ou pick subótimo.
Deixe vazio APENAS se todas as 5 variações forem genuinamente distintas e coerentes.`;
}

// ─── Validador de substituições ───────────────────────────────────────────────

function validateReplacement(
  rep: VariationReplacement,
  variations: VariationSnapshot[],
  poolIds: Set<string>,
  anchorIds: Set<string>,
): boolean {
  const variation = variations.find((v) => v.id === rep.variationId);
  if (!variation) return false;
  const fromLeg = variation.legs.find((l) => l.matchId === rep.fromMatchId);
  if (!fromLeg || fromLeg.isAnchor || anchorIds.has(rep.fromMatchId)) return false;
  if (!poolIds.has(rep.toMatchId)) return false;
  if (variation.legs.some((l) => l.matchId === rep.toMatchId)) return false;
  return true;
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
  poolAvailable: ScoredMatch[] = [],
): Promise<JudgeResult> {
  const heuristic = variations.map(heuristicEnrichment);

  // ── Kill switch global: força heurística sem chamar LLM ──
  // Uso: setar BOB_DISABLE_LLM=1 na Vercel para desligar imediatamente sem deploy.
  if (process.env.BOB_DISABLE_LLM === "1" || process.env.BOB_DISABLE_LLM === "true") {
    console.log("[BOB/Judge] BOB_DISABLE_LLM=1 — usando heurística (LLM bloqueada)");
    return { enrichments: heuristic, replacements: [], provider: "heuristic" };
  }

  const hasLLM =
    !!process.env.ANTHROPIC_API_KEY ||
    !!process.env.OPENAI_API_KEY ||
    !!process.env.GEMINI_API_KEY;
  if (!hasLLM) {
    return { enrichments: heuristic, replacements: [], provider: "heuristic" };
  }

  const prompt = buildPrompt(variations, anchors, poolAvailable);

  type RawResponse = {
    enrichments?: Array<Partial<VariationEnrichment>>;
    replacements?: Array<Partial<VariationReplacement>>;
  };
  const { data, provider } = await llmCascadeJSON<RawResponse>(prompt, { maxTokens: 2200 });

  if (!data?.enrichments || !Array.isArray(data.enrichments) || data.enrichments.length === 0) {
    return { enrichments: heuristic, replacements: [], provider: "heuristic" };
  }

  const enrichments: VariationEnrichment[] = variations.map((v) => {
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
    return heuristic.find((h) => h.variationId === v.id) ?? heuristic[0]!;
  });

  const poolIds = new Set(poolAvailable.map((m) => m.id));
  const anchorIds = new Set(anchors.map((a) => a.id));
  const rawReplacements = Array.isArray(data.replacements) ? data.replacements : [];
  const replacements: VariationReplacement[] = rawReplacements
    .filter(
      (r): r is VariationReplacement =>
        typeof r.variationId === "string" &&
        typeof r.fromMatchId === "string" &&
        typeof r.toMatchId === "string" &&
        typeof r.reason === "string",
    )
    .map((r) => ({
      ...r,
      approved: validateReplacement(r, variations, poolIds, anchorIds),
    }));

  return { enrichments, replacements, provider };
}
