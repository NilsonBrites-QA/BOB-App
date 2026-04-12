/**
 * BOB — Gerador de Narrativa (OpenAI Chat Completions)
 *
 * Recebe os âncoras + variações de uma rodada e produz uma análise em PT-BR
 * com o tom característico do BOB: analítico, direto, confiante.
 *
 * Estratégia de custo:
 *   - Modelo: gpt-4o-mini (~$0.00015/1K tokens de entrada, ~$0.0006/1K saída)
 *   - Estimativa: ~600 tokens entrada + ~500 tokens saída por rodada ≈ $0.001/chamada
 *   - Cache Next.js: revalidate 86400 (24h) — uma só chamada por rodada por servidor
 *
 * Referência API: https://developers.openai.com/api/reference/resources/chat
 */

import type { ScoredMatch } from "@/lib/bob/engine/scoring";
import type { Variation } from "@/lib/bob/types";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type NarrativeInput = {
  season: number;
  round: number;
  anchors: ScoredMatch[];
  variations: Variation[];
};

type OpenAIChatResponse = {
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

// ─── Constantes ───────────────────────────────────────────────────────────────

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";
const MAX_TOKENS = 550;

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildPrompt(input: NarrativeInput): string {
  const anchorLines = input.anchors
    .map(
      (a, i) =>
        `Âncora ${i + 1}: ${a.homeTeam} x ${a.awayTeam} — Score ${a.score}/100\n  Razões: ${a.reasons.join("; ")}`
    )
    .join("\n");

  const variationLines = input.variations
    .map(
      (v) =>
        `${v.title} (${v.posture}) — Odd projetada: ${v.projectedOdd.toFixed(2)}, ${v.gameCount} jogos\n  Picks: ${v.picks.map((p) => `${p.match.split(" x ")[0]} (${p.result}) @${p.odd}`).join(" · ")}`
    )
    .join("\n");

  return `Você é o BOB — Big Odds Brasileirão, analista especializado em apostas no Brasileirão Série A. Analise os dados abaixo da Rodada ${input.round}/${input.season} e escreva uma análise operacional em português brasileiro.

ÂNCORAS SELECIONADAS PELO MOTOR:
${anchorLines}

VARIAÇÕES GERADAS:
${variationLines}

Escreva exatamente 3 parágrafos de 2-3 frases cada:
1. Por que esses jogos foram selecionados como âncoras — contexto da rodada.
2. Destaque para as variações mais interessantes e o raciocínio de value.
3. Aviso de risco e gestão de banca.

Tom: objetivo, assertivo, sem rodeios. Sem saudação, sem assinatura. Máximo 350 palavras.`;
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Gera a narrativa da rodada via OpenAI.
 * Retorna string vazia se a chave não estiver configurada (fallback silencioso).
 * Cache Next.js de 24h evita chamadas repetidas para a mesma rodada.
 */
export async function generateRoundNarrative(
  input: NarrativeInput
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn("[BOB/AI] OPENAI_API_KEY não configurado — narrativa desativada.");
    return "";
  }

  if (input.anchors.length === 0) return "";

  const prompt = buildPrompt(input);

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: MAX_TOKENS,
      temperature: 0.65,
    }),
    // Cache agressivo — a narrativa de uma rodada não muda ao longo do dia
    next: { revalidate: 86400 },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[BOB/AI] OpenAI erro ${res.status}: ${body}`);
    return "";
  }

  const data = (await res.json()) as OpenAIChatResponse;
  const narrative = data.choices?.[0]?.message?.content?.trim() ?? "";

  // Log de consumo para monitoramento
  if (data.usage) {
    console.info(
      `[BOB/AI] Narrativa rodada ${input.round}/${input.season} — ` +
        `${data.usage.total_tokens} tokens (${data.usage.prompt_tokens} entrada + ${data.usage.completion_tokens} saída)`
    );
  }

  return narrative;
}
