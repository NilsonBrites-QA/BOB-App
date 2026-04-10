/**
 * BOB — Dual Mind
 *
 * Mente dupla: Claude (profundidade analítica) + GPT-4o (narrativa fluida)
 * trabalhando em paralelo para enriquecer o output do BOB.
 *
 * Diagrama:
 *
 *   Dados da rodada → ┬─ Claude Sonnet → reflexão (publicText / adminText)
 *                     └─ GPT-4o-mini   → narrativa descritiva
 *                          ↓
 *                     DualMindResult (narrativa + reflexão + enriquecimentos)
 *
 * Uso:
 *   - Chamado pelo dashboard quando as duas API-keys estiverem disponíveis
 *   - Cada mente falha graciosamente: se uma API falhar, a outra ainda entrega
 *
 * Exporta:
 *   analyzeDualMind(input) → DualMindResult
 */

import type { CalibrationResult } from "@/lib/bob/engine/calibrator";
import type { BacktestRoundResult } from "@/lib/bob/engine/backtest";
import {
  generateReflection,
  type RoundReflection,
} from "@/lib/bob/ai/cognitive-analyst";
import type { WeightSuggestion } from "@/lib/bob/ai/cognitive-analyst";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type DualMindInput = {
  season:      number;
  round:       number;
  calibration: CalibrationResult;
  roundResult: BacktestRoundResult;
  narrative?:  string; // narrativa GPT-4o já gerada (opcional — a página pode já ter)
};

export type DualMindResult = {
  narrative:   string;            // GPT-4o (ou string vazia se indisponível)
  reflection:  RoundReflection;   // Claude Sonnet (ou fallback determinístico)
  suggestions: WeightSuggestion[];
  mindstates: {
    claudeOnline: boolean;
    gptOnline:    boolean;
  };
};

// ─── analyzeDualMind ──────────────────────────────────────────────────────────

/**
 * Executa Claude (reflexão) em paralelo com GPT-4o (narrativa).
 * Se o chamador já tiver a narrativa, passa pelo campo `input.narrative`.
 * Cada mente é independente — falha graciosamente.
 */
export async function analyzeDualMind(input: DualMindInput): Promise<DualMindResult> {
  const { calibration, roundResult, narrative: existingNarrative } = input;

  // Narrativa GPT-4o — se já foi gerada, reutiliza; senão chama gerador
  const narrativePromise: Promise<{ text: string; online: boolean }> = existingNarrative
    ? Promise.resolve({ text: existingNarrative, online: true })
    : generateNarrativeFromRound(roundResult).then((text) => ({
        text:   text ?? "",
        online: text !== null,
      }));

  // Reflexão Claude Sonnet
  const reflectionPromise: Promise<{ result: RoundReflection; online: boolean }> =
    generateReflection(calibration, roundResult)
      .then((r) => ({ result: r, online: r.source === "claude" }))
      .catch(() => ({
        result:  buildFallbackReflection(),
        online:  false,
      }));

  // Paralelo!
  const [narrativeResult, reflectionResult] = await Promise.all([
    narrativePromise,
    reflectionPromise,
  ]);

  // Sugestões de ajuste de pesos (derivado da calibração, sem chamada extra de API)
  const { suggestWeightAdjustments } = await import("@/lib/bob/ai/cognitive-analyst");
  const suggestions = await suggestWeightAdjustments(calibration, roundResult);

  return {
    narrative:   narrativeResult.text,
    reflection:  reflectionResult.result,
    suggestions,
    mindstates: {
      claudeOnline: reflectionResult.online,
      gptOnline:    narrativeResult.online,
    },
  };
}

// ─── helpers internos ─────────────────────────────────────────────────────────

/**
 * Chama a narrativa GPT-4o mínima, baseada em dados de backtest.
 * Não depende de dados da rodada ao vivo — apenas do summary de backtest.
 */
async function generateNarrativeFromRound(
  round: BacktestRoundResult,
): Promise<string | null> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return null;

  const acc     = (v: number) => `${(v * 100).toFixed(1)}%`;
  const overall = round.totalPicks > 0 ? round.correctPicks / round.totalPicks : 0;
  const top3    = round.factorAccuracy.slice(0, 3).map((f) => f.factor).join(", ");

  const prompt = `Você é o BOB, analista do Brasileirão. Rodada ${round.round}/${round.season}: acurácia ${acc(overall)}, pick certos ${round.correctPicks}/${round.totalPicks}. Principais fatores: ${top3}. Escreva 2 frases de contexto para o dashboard em português, tom assertivo e acessível.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method:  "POST",
      headers: {
        "authorization": `Bearer ${OPENAI_API_KEY}`,
        "content-type":  "application/json",
      },
      body: JSON.stringify({
        model:       "gpt-4o-mini",
        max_tokens:  120,
        messages: [{ role: "user", content: prompt }],
      }),
      next: { revalidate: 86400 },
    });

    if (!res.ok) return null;

    type CompletionResp = { choices: Array<{ message: { content: string } }> };
    const data = (await res.json()) as CompletionResp;
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

function buildFallbackReflection(): RoundReflection {
  return {
    publicText:  "O BOB registrou os dados desta rodada e vai aprender com eles.",
    adminText:   "Reflexão não disponível — verificar conexão com a API de IA.",
    source:      "deterministic",
  };
}
