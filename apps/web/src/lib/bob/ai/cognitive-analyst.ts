/**
 * BOB — Analista Cognitivo (Claude Sonnet)
 *
 * Segunda camada de inteligência do BOB: enquanto o motor determinístico
 * pontua com precisão cirúrgica, o Analista Cognitivo interpreta o contexto,
 * identifica padrões emergentes e gera reflexões evolutivas.
 *
 * Usa Claude Sonnet via Anthropic Messages API.
 * Fallback determinístico se ANTHROPIC_API_KEY não configurado.
 *
 * Funções exportadas:
 *   generateReflection()       — texto público + admin sobre o aprendizado da rodada
 *   suggestWeightAdjustments() — sugestões textuais de ajuste de pesos
 *   enrichMatchContext()       — bônus/penalidades contextuais para um jogo
 */

import type { CalibrationResult } from "@/lib/bob/engine/calibrator";
import type { BacktestRoundResult } from "@/lib/bob/engine/backtest";

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Reflexão gerada sobre o aprendizado de uma rodada */
export type RoundReflection = {
  publicText:  string;  // acessível: linguagem BOB, sem jargão técnico
  adminText:   string;  // técnico: cita fatores, pesos, deltas exatos
  source:      "claude" | "deterministic";
};

/** Sugestão de ajuste de pesos emitida pelo Analista Cognitivo */
export type WeightSuggestion = {
  factor:     string;
  direction:  "increase" | "decrease" | "hold";
  magnitude:  "small" | "medium" | "large"; // <2pt | 2–4pt | >4pt
  reasoning:  string;
};

/** Contexto enriquecido para um jogo (bônus/penalidade IA) */
export type MatchContextEnrichment = {
  match:          string;
  bonusFactors:   string[]; // fatores positivos adicionais identificados
  penaltyFactors: string[]; // riscos não captados pelo motor
  adjustedScore:  number;   // sugestão de score final após ajuste (0–100)
  confidence:     "low" | "medium" | "high";
};

// ─── Anthropic API ────────────────────────────────────────────────────────────

const ANTHROPIC_URL     = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL   = "claude-sonnet-4-5";
const ANTHROPIC_VERSION = "2023-06-01";

type AnthropicMessage = {
  content: Array<{ type: string; text: string }>;
  usage: { input_tokens: number; output_tokens: number };
};

export async function callClaude(prompt: string, maxTokens = 600): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const res = await fetch(ANTHROPIC_URL, {
    method:  "POST",
    headers: {
      "x-api-key":         apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type":      "application/json",
    },
    body: JSON.stringify({
      model:         ANTHROPIC_MODEL,
      max_tokens:    maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
    next: { revalidate: 86400 }, // cache 24h
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[BOB/Claude] Erro ${res.status}: ${body}`);
    return null;
  }

  const data = (await res.json()) as AnthropicMessage;
  const text = data.content?.[0]?.text?.trim() ?? null;

  if (data.usage) {
    console.info(
      `[BOB/Claude] ${data.usage.input_tokens} tokens entrada + ${data.usage.output_tokens} saída`,
    );
  }

  return text;
}

// ─── generateReflection ───────────────────────────────────────────────────────

/**
 * Gera reflexão pública e técnica sobre o aprendizado da rodada.
 * Claude analisa quais fatores são mais confiáveis com base na acurácia real.
 */
export async function generateReflection(
  calibration: CalibrationResult,
  round:        BacktestRoundResult,
): Promise<RoundReflection> {
  const topFactor = round.factorAccuracy[0];
  const worstFactor = [...round.factorAccuracy].sort((a, b) => a.accuracy - b.accuracy)[0];

  const prompt = buildReflectionPrompt(calibration, round);
  const claudeText = await callClaude(prompt, 700);

  if (claudeText) {
    // Claude retorna JSON com { public, admin }
    try {
      const parsed = JSON.parse(claudeText) as { public?: string; admin?: string };
      if (parsed.public && parsed.admin) {
        return {
          publicText:  parsed.public,
          adminText:   parsed.admin,
          source:      "claude",
        };
      }
    } catch {
      // Resposta não é JSON — usar como publicText
      return {
        publicText:  claudeText,
        adminText:   buildDeterministicAdminText(calibration, round),
        source:      "claude",
      };
    }
  }

  // Fallback determinístico
  return {
    publicText:  buildDeterministicPublicText(calibration, round, topFactor?.factor, worstFactor?.factor),
    adminText:   buildDeterministicAdminText(calibration, round),
    source:      "deterministic",
  };
}

// ─── suggestWeightAdjustments ─────────────────────────────────────────────────

/**
 * Gera sugestões textuais de ajuste de pesos com raciocínio qualitativo.
 * Complementa o ABQC quantitativo com análise contextual.
 */
export async function suggestWeightAdjustments(
  calibration: CalibrationResult,
  round:        BacktestRoundResult,
): Promise<WeightSuggestion[]> {
  // Derivar sugestões do resultado de calibração (sem IA obrigatória)
  const suggestions: WeightSuggestion[] = [];

  for (const fa of round.factorAccuracy) {
    if (fa.mentioned < 2) continue;

    const overallAcc = round.totalPicks > 0 ? round.correctPicks / round.totalPicks : 0;
    const deviation  = fa.accuracy - overallAcc;
    const delta      = calibration.adjustments[fa.factor] ?? 0;

    const direction: WeightSuggestion["direction"] =
      delta > 0.5 ? "increase" : delta < -0.5 ? "decrease" : "hold";

    const magnitude: WeightSuggestion["magnitude"] =
      Math.abs(delta) > 4 ? "large" : Math.abs(delta) > 2 ? "medium" : "small";

    const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

    suggestions.push({
      factor:    fa.factor,
      direction,
      magnitude,
      reasoning: `Acurácia do fator: ${pct(fa.accuracy)} vs média ${pct(overallAcc)} (${deviation >= 0 ? "+" : ""}${pct(deviation)}). ${fa.mentioned} picks âncora analisados. Delta aplicado: ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}pt.`,
    });
  }

  return suggestions;
}

// ─── enrichMatchContext ───────────────────────────────────────────────────────

/**
 * Enriquece o contexto de um jogo com análisequalitativa do Claude.
 * Identifica riscos e bônus que o motor determinístico não captura.
 *
 * Uso planejado: chamado pela rota de dashboard quando há API-key Claude
 * e o score do jogo está na zona cinza (50–70 pts).
 */
export async function enrichMatchContext(
  homeTeam:  string,
  awayTeam:  string,
  motorScore: number,
  reasons:   string[],
): Promise<MatchContextEnrichment> {
  const prompt = `Você é o BOB — analista quantitativo do Brasileirão. Motor de scoring marcou ${homeTeam} x ${awayTeam} com score ${motorScore}/100.

Razões do motor: ${reasons.join("; ")}

Analise se há fatores contextuais que o motor pode não ter capturado (calendário paralelo, pressão do torcedor, histórico emocional, lesões recentes não registradas).

Responda SOMENTE com JSON:
{"bonusFactors": ["..."], "penaltyFactors": ["..."], "adjustedScore": ${motorScore}, "confidence": "medium"}

adjustedScore: ajuste entre -10 e +10 do score original. confidence: low/medium/high.`;

  const claudeText = await callClaude(prompt, 200);

  if (claudeText) {
    try {
      const parsed = JSON.parse(claudeText) as Partial<MatchContextEnrichment>;
      return {
        match:          `${homeTeam} x ${awayTeam}`,
        bonusFactors:   parsed.bonusFactors   ?? [],
        penaltyFactors: parsed.penaltyFactors ?? [],
        adjustedScore:  Math.max(0, Math.min(100, parsed.adjustedScore ?? motorScore)),
        confidence:     parsed.confidence     ?? "medium",
      };
    } catch { /* fallthrough */ }
  }

  // Fallback: retorna o score original sem ajuste
  return {
    match:          `${homeTeam} x ${awayTeam}`,
    bonusFactors:   [],
    penaltyFactors: [],
    adjustedScore:  motorScore,
    confidence:     "low",
  };
}

// ─── Builders de texto determinístico (fallback) ──────────────────────────────

function buildReflectionPrompt(
  calibration: CalibrationResult,
  round:        BacktestRoundResult,
): string {
  const acc    = (v: number) => `${(v * 100).toFixed(1)}%`;
  const top3   = round.factorAccuracy.slice(0, 3).map((f) => `${f.factor} (${acc(f.accuracy)})`).join(", ");
  const bottom = [...round.factorAccuracy].sort((a, b) => a.accuracy - b.accuracy).slice(0, 2).map((f) => `${f.factor} (${acc(f.accuracy)})`).join(", ");
  const moved  = Object.entries(calibration.adjustments).filter(([, d]) => Math.abs(d) >= 1).map(([f, d]) => `${f}: ${d > 0 ? "+" : ""}${d.toFixed(1)}pt`).join(", ");

  return `Você é o BOB — Big Odds Brasileirão, analista de apostas no Brasileirão Série A.

Dados da Rodada ${round.round}/${round.season}:
- Acurácia geral: ${acc(round.correctPicks / Math.max(round.totalPicks, 1))} (${round.correctPicks}/${round.totalPicks} picks corretos)
- Acurácia âncoras: ${acc(round.anchorAccuracy)}
- Fatores mais precisos: ${top3 || "sem dados suficientes"}
- Fatores menos precisos: ${bottom || "sem dados suficientes"}
- Ajustes de pesos: ${moved || "nenhum ajuste significativo"}

Gere uma reflexão em português brasileiro sobre o que o BOB aprendeu nesta rodada.

Responda SOMENTE com JSON válido:
{
  "public": "[2-3 frases para o usuário — acessível, tom BOB assertivo, sem jargão técnico]",
  "admin": "[3-4 frases técnicas para o admin — cita fatores, pesos, deltas exatos]"
}`;
}

function buildDeterministicPublicText(
  calibration: CalibrationResult,
  round:        BacktestRoundResult,
  topFactor?:   string,
  worstFactor?: string,
): string {
  const acc     = (v: number) => `${(v * 100).toFixed(1)}%`;
  const overall = round.totalPicks > 0 ? round.correctPicks / round.totalPicks : 0;

  const topLabel: Record<string, string> = {
    tableContext: "posição na tabela",
    recentForm:  "forma recente",
    momentum:    "momentum",
    homeAway:    "desempenho casa/fora",
    goalsXg:     "produção de gols",
    h2h:         "confronto direto",
    absences:    "desfalques",
    calendar:    "calendário",
    market:      "movimento de odds",
    motivation:  "motivação contextual",
  };

  const lines = [
    `Rodada ${round.round}: acertei ${acc(overall)} dos picks${calibration.wasAdjusted ? " — aprendi com isso." : "."}`,
  ];

  if (topFactor) {
    lines.push(`${topLabel[topFactor] ?? topFactor} foi o fator mais preciso desta rodada.`);
  }
  if (worstFactor && worstFactor !== topFactor) {
    lines.push(`${topLabel[worstFactor] ?? worstFactor} mostrou sinal mais fraco — vou ajustar o peso.`);
  }
  if (!calibration.wasAdjusted) {
    lines.push("Evidência insuficiente para recalibrar. Aguardando mais rodadas.");
  }

  return lines.join(" ");
}

function buildDeterministicAdminText(
  calibration: CalibrationResult,
  round:        BacktestRoundResult,
): string {
  const acc    = (v: number) => `${(v * 100).toFixed(1)}%`;
  const overall = round.totalPicks > 0 ? round.correctPicks / round.totalPicks : 0;
  const moved  = Object.entries(calibration.adjustments)
    .filter(([, d]) => Math.abs(d) >= 0.5)
    .map(([f, d]) => `${f}: ${d > 0 ? "+" : ""}${d.toFixed(1)}pt`)
    .join(", ");

  return [
    `R${round.round}/${round.season} — Overall: ${acc(overall)} | Âncoras: ${acc(round.anchorAccuracy)} | ${calibration.samples} picks.`,
    moved ? `Ajustes ABQC: ${moved}.` : "ABQC: sem ajustes (evidência insuficiente ou desvios < 0.5pp).",
    `Calibração: ${calibration.wasAdjusted ? "pesos ajustados" : "sem ajuste — dados insuficientes"}.`,
  ].join(" ");
}
