/**
 * BOB — Cascade LLM (Claude → GPT → Gemini → null)
 *
 * Garante alta disponibilidade da camada cognitiva:
 *   1. Claude Sonnet 4.5 (Anthropic)        — qualidade analítica máxima
 *   2. GPT-4o-mini (OpenAI)                  — barato e confiável
 *   3. Gemini 2.0 Flash (Google) FREE        — fallback gratuito (1500/dia)
 *   4. null                                  — caller deve usar heurística
 *
 * Cada provider:
 *   - É chamado apenas se a chave env está configurada
 *   - Falha graciosamente (sem throw) → próximo da cascata
 *   - Loga qual provider venceu (telemetria)
 */

import { callClaude } from "./cognitive-analyst";
import { callGemini } from "./gemini";

export type LLMProvider = "claude" | "gpt" | "gemini" | "none";

const LLM_TIMEOUT_MS = 6000;

/** Aplica timeout numa promise. Se exceder, retorna null (provider falhou). */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) =>
      setTimeout(() => {
        console.warn(`[BOB/LLM] ${label} timeout após ${ms}ms`);
        resolve(null);
      }, ms),
    ),
  ]);
}

export type LLMCascadeResult = {
  text: string | null;
  provider: LLMProvider;
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";

async function callGPT(prompt: string, opts: { jsonMode?: boolean; maxTokens?: number } = {}): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: opts.maxTokens ?? 1500,
        temperature: 0.4,
        ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!res.ok) {
      console.warn(`[BOB/GPT] HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    console.warn("[BOB/GPT] erro:", err);
    return null;
  }
}

/**
 * Tenta cada LLM em ordem e retorna o primeiro resultado válido.
 * Se todos falharem, retorna { text: null, provider: "none" }.
 */
export async function llmCascade(
  prompt: string,
  opts: { jsonMode?: boolean; maxTokens?: number } = {}
): Promise<LLMCascadeResult> {
  // 1. Claude (top tier) — timeout 6s
  const claude = await withTimeout(
    callClaude(prompt, opts.maxTokens ?? 1500).catch(() => null),
    LLM_TIMEOUT_MS,
    "Claude",
  );
  if (claude) {
    console.log("[BOB/LLM] Claude OK");
    return { text: claude, provider: "claude" };
  }

  // 2. GPT (barato, rápido) — timeout 6s
  const gpt = await withTimeout(callGPT(prompt, opts), LLM_TIMEOUT_MS, "GPT");
  if (gpt) {
    console.log("[BOB/LLM] GPT OK");
    return { text: gpt, provider: "gpt" };
  }

  // 3. Gemini (gratuito) — timeout 6s
  const gemini = await withTimeout(callGemini(prompt, opts), LLM_TIMEOUT_MS, "Gemini");
  if (gemini) {
    console.log("[BOB/LLM] Gemini OK");
    return { text: gemini, provider: "gemini" };
  }

  // 4. Todos falharam
  console.warn("[BOB/LLM] todos providers falharam — fallback heurístico");
  return { text: null, provider: "none" };
}

/**
 * Versão estrita para JSON: tenta cascade e parseia o resultado.
 * Retorna null se nenhum provider devolver JSON válido.
 */
export async function llmCascadeJSON<T = unknown>(
  prompt: string,
  opts: { maxTokens?: number } = {}
): Promise<{ data: T | null; provider: LLMProvider }> {
  const result = await llmCascade(prompt, { ...opts, jsonMode: true });
  if (!result.text) return { data: null, provider: result.provider };

  try {
    // Limpar wrappers comuns (```json ... ```)
    const cleaned = result.text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/, "")
      .replace(/\s*```$/, "")
      .trim();
    return { data: JSON.parse(cleaned) as T, provider: result.provider };
  } catch (err) {
    console.warn(`[BOB/LLM] JSON inválido de ${result.provider}:`, err);
    return { data: null, provider: result.provider };
  }
}
