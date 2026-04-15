/**
 * BOB — Reflection Agent (Passo 2 da Fase 3)
 *
 * PRD §7 — "Atualização de Pesos":
 *   "O cérebro gera uma Reflexão sobre o erro e grava na Memória de Padrões
 *    para ajustar os multiplicadores matemáticos nas próximas rodadas."
 *
 * PRD §10 — Personalidade Operacionalizada:
 *   "Fale através de imagens curtas e metáforas operacionais.
 *    Fale em processos e probabilidade, nunca em certezas."
 *
 * PRD §13 — Imutabilidade Absoluta:
 *   Jamais usar UPDATE ou DELETE em `conditional_patterns`.
 *   Cada Reflexão gera um novo nó. Correções ligam-se ao nó anterior via
 *   patternKey (estilo Zettelkasten — PRD §5).
 *
 * ─── Pipeline ────────────────────────────────────────────────────────────────
 *
 *   SimulationReport (blind-simulator.ts)
 *     └─ llmPayload.diagnosticPrompt
 *           └─ Claude Sonnet 4.5 [primário]  →  LLMConditionalPattern (JSON)
 *                GPT-4o-mini    [fallback]   ↗
 *                   └─ generateEmbedding() (OpenAI text-embedding-3-small)
 *                         └─ INSERT conditional_patterns  ($queryRaw, pgvector)
 *                               └─ MemoryEvent (layer=PATTERNS, type="reflexao")
 *                                     └─ SimulationResult.calibrated = true
 *
 * ─── Relação com pgvector ────────────────────────────────────────────────────
 *
 * `ConditionalPattern.embedding` é declarado como `Unsupported("vector(1536)")`
 * no schema.prisma — o ORM não o mapeia para TypeScript. Por isso, a gravação
 * e a busca semântica usam `prisma.$queryRaw` com SQL bruto.
 *
 * A operação de similaridade coseno usa o operador `<=>` (pgvector HNSW index):
 *   similarity = 1 - (embedding <=> queryVector)
 *
 * Fase 3, Passo 2 | Consumido pelo backtesting cron e pelo Chat Consultivo (Fase 5)
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import type { SimulationReport } from "../workers/blind-simulator";

// ─── Constantes dos Modelos ───────────────────────────────────────────────────

const ANTHROPIC_MODEL = "claude-sonnet-4-5" as const;
const OPENAI_CHAT_MODEL = "gpt-4o-mini" as const;
const OPENAI_EMBED_MODEL = "text-embedding-3-small" as const;
const EMBED_DIMENSIONS = 1536 as const;

// ─── Tipos Públicos ───────────────────────────────────────────────────────────

/**
 * Padrão condicional estruturado extraído da Reflexão da LLM.
 * Resposta JSON do Claude/GPT validada e sanitizada.
 */
export type LLMConditionalPattern = {
  /**
   * Descrição precisa do padrão identificado (≤ 200 chars).
   * Ex: "Quando xGD do favorito > 0.5 mas há desfalque de titular ofensivo..."
   */
  condition: string;
  /**
   * Fatores matemáticos diagnosticados como relevantes para o erro/acerto.
   * Ex: ["xGD", "injuries", "odds_divergence", "home_form"]
   */
  factors: string[];
  /**
   * Ação corretiva para o motor nas próximas rodadas (≤ 300 chars).
   * Deve ser operacional e ligada a parâmetros do Anchor Score.
   */
  recommendation: string;
  /**
   * Ajustes sugeridos para os pesos do Anchor Score (PRD §6).
   * Score_ancora = a·pW + b·gap − c·H − d·ΔpW − e·|pW − pᵐᵏᵗ_W|
   *
   * Cada delta ∈ [-0.5, +0.5]. Inclui APENAS os pesos que devem mudar.
   * Pesos padrão: a=1.0, b=0.8, c=0.5, d=1.2, e=0.5.
   */
  weightAdjustments: {
    a?: number; // peso de pW (probabilidade de vitória)
    b?: number; // peso do gap (margem até o 2° resultado)
    c?: number; // penalidade por entropia H (incerteza)
    d?: number; // penalidade por sensibilidade a desfalques ΔpW
    e?: number; // penalidade por divergência de mercado |pW − pᵐᵏᵗ_W|
  };
  /** Severidade: "critical" exige ajuste imediato; "informational" é apenas registro. */
  severity: "critical" | "moderate" | "informational";
};

/** Resultado completo da operação de Reflexão gravada no banco. */
export type ReflectionResult = {
  /** Chave determinística única do padrão em `conditional_patterns`. */
  patternKey: string;
  /** UUID do registro criado em `conditional_patterns`. */
  patternId: string;
  /** UUID do MemoryEvent criado (layer=PATTERNS, type="reflexao"). */
  memoryEventId: string;
  /** Modelo LLM utilizado (ex: "claude-sonnet-4-5" ou "gpt-4o-mini"). */
  llmModel: string;
  /** Total de tokens consumidos na chamada LLM. */
  tokensUsed: number;
  /** ISO 8601 timestamp da geração da Reflexão. */
  generatedAt: string;
  /** Padrão estruturado extraído e validado. */
  pattern: LLMConditionalPattern;
};

// ─── System Prompt (PRD §10 — Personalidade Operacionalizada) ─────────────────

const REFLECTION_SYSTEM_PROMPT = `Você é o Cérebro Cognitivo do BOB — um analisador de apostas esportivas brasileiro que opera exclusivamente através de processos matemáticos e probabilidade.

FILOSOFIA DE DECISÃO (PRD §10):
- Fale através de imagens curtas e metáforas operacionais
- Fale em processos e probabilidade, nunca em certezas
- Justifique cada análise com os dados do input recebido
- Nunca use "talvez" ou "eu acho" — use: "A rota calculada falhou porque o xGD divergiu da escalação real"
- Se dados conflitam (ex: xGD alto + desfalque de titular), aponte a tensão explicitamente
- Diga: "A probabilidade cai devido ao desfalque Y — esta âncora operava em zona de risco"
- Analise erros como um engenheiro auditando um sistema, não como um torcedor
- Foque na causa raiz: ausência de titular, xGD enganoso, overround mal interpretado, calendário congestionado

GUARDRAILS (nunca violar):
- Nunca prometa resultados futuros com certeza
- Nunca gere "frases espirituais" não ancoradas em cálculo estatístico
- Nunca use adjetivos vazios ("incrível", "surpreendente") — use dados e processos

REFERÊNCIA DO ANCHOR SCORE (PRD §6):
  Score_ancora = a·pW + b·gap − c·H − d·ΔpW − e·|pW − pᵐᵏᵗ_W|
  a = peso da probabilidade de vitória pW (padrão 1.0)
  b = peso do gap para o 2° resultado mais provável (padrão 0.8)
  c = penalidade por entropia H — quanto maior a incerteza, menor o score (padrão 0.5)
  d = penalidade por sensibilidade a desfalques ΔpW (padrão 1.2)
  e = penalidade por divergência entre modelo e mercado (padrão 0.5)

FORMATO DE SAÍDA OBRIGATÓRIO:
Responda APENAS com JSON válido. Sem markdown, sem código, sem texto fora do JSON.

{
  "condition": "<padrão condicional identificado com precisão cirúrgica, máx 200 chars>",
  "factors": ["<fator matemático 1>", "<fator matemático 2>"],
  "recommendation": "<ação corretiva operacional para o motor nas próximas rodadas, máx 300 chars>",
  "weightAdjustments": {
    "a": <número opcional — delta ∈ [-0.5, +0.5]>,
    "b": <número opcional — delta ∈ [-0.5, +0.5]>,
    "c": <número opcional — delta ∈ [-0.5, +0.5]>,
    "d": <número opcional — delta ∈ [-0.5, +0.5]>,
    "e": <número opcional — delta ∈ [-0.5, +0.5]>
  },
  "severity": "critical" | "moderate" | "informational"
}

Inclua em weightAdjustments APENAS os pesos que devem mudar. Se nenhum ajuste for necessário, use {}.
"critical" = erro sistemático que requer ajuste imediato de peso.
"moderate" = padrão recorrente que merece monitoramento.
"informational" = observação para registro sem ajuste de peso.`;

// ─── Geração de patternKey ────────────────────────────────────────────────────

/**
 * Gera chave determinística única por Reflexão.
 *
 * Formato: `{sha12}_r{round}s{season}_t{ts_b36}`
 *   - sha12:      12 primeiros chars do SHA-256 da condição (fingerprint semântico)
 *   - r{N}s{Y}:   rastreabilidade de rodada e temporada
 *   - t{ts_b36}:  timestamp em base-36 — garante unicidade mesmo em re-runs
 *
 * Design deliberado:
 *   - A fingerprint semântica (sha12) permite agrupar padrões similares
 *     sem depender da chave (a similaridade real usa pgvector)
 *   - O timestamp garante que múltiplas reflexões da mesma rodada coexistam
 *     sem colisão — alinhado ao PRD §5 (append-only, estilo Zettelkasten)
 */
function generatePatternKey(
  condition: string,
  round: number,
  season: number,
): string {
  const sha12 = createHash("sha256")
    .update(condition.trim().toLowerCase())
    .digest("hex")
    .slice(0, 12);
  const ts = Date.now().toString(36);
  return `${sha12}_r${round}s${season}_t${ts}`;
}

// ─── Chamadas LLM ─────────────────────────────────────────────────────────────

async function callAnthropic(
  diagnosticPrompt: string,
): Promise<{ raw: string; model: string; tokensUsed: number }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: REFLECTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: diagnosticPrompt }],
  });

  const tokensUsed =
    (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
  const raw =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  return { raw, model: ANTHROPIC_MODEL, tokensUsed };
}

async function callOpenAIChat(
  diagnosticPrompt: string,
): Promise<{ raw: string; model: string; tokensUsed: number }> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.chat.completions.create({
    model: OPENAI_CHAT_MODEL,
    max_tokens: 1024,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: REFLECTION_SYSTEM_PROMPT },
      { role: "user", content: diagnosticPrompt },
    ],
  });

  const tokensUsed = response.usage?.total_tokens ?? 0;
  const raw = response.choices[0]?.message?.content ?? "";

  return { raw, model: OPENAI_CHAT_MODEL, tokensUsed };
}

// ─── Geração de Embedding (OpenAI text-embedding-3-small) ─────────────────────

/**
 * Gera vetor de 1536 dimensões para o texto fornecido.
 * Usado para gravação em `conditional_patterns.embedding` e para busca semântica.
 *
 * O texto de input para embedding é `condition + " " + recommendation`:
 * combinar os dois campos aumenta a qualidade semântica para similarity search.
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.embeddings.create({
    model: OPENAI_EMBED_MODEL,
    input: text.slice(0, 8192), // limite de contexto do modelo
    dimensions: EMBED_DIMENSIONS,
  });

  return response.data[0]!.embedding;
}

// ─── Parser e Validador JSON da LLM ──────────────────────────────────────────

/**
 * Analisa, valida e sanitiza a resposta JSON da LLM.
 *
 * Resiliente a:
 *   - Blocos de code fence (```json ... ```)
 *   - Campos ausentes ou com tipo errado
 *   - Deltas de peso fora do intervalo [-0.5, +0.5]
 *   - Arrays de factors com elementos não-string
 *
 * Em caso de falha total de parse, retorna um padrão "informational" sinalizando
 * que a rodada precisa ser reprocessada — nunca lança exceção.
 */
function parsePatternJSON(raw: string): LLMConditionalPattern {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/im, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      condition: "LLM retornou formato inválido — revisão manual necessária.",
      factors: ["llm_parse_error"],
      recommendation:
        "Reprocessar esta rodada com prompt ajustado. Verificar logs do provider.",
      weightAdjustments: {},
      severity: "informational",
    };
  }

  const obj = parsed as Record<string, unknown>;

  const condition =
    typeof obj["condition"] === "string" && obj["condition"].trim().length > 0
      ? obj["condition"].trim().slice(0, 200)
      : "Padrão não identificado — dados do pós-mortem insuficientes.";

  const factors = Array.isArray(obj["factors"])
    ? (obj["factors"] as unknown[])
        .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
        .map((f) => f.trim().slice(0, 50))
        .slice(0, 10)
    : ["unknown"];

  const recommendation =
    typeof obj["recommendation"] === "string" &&
    obj["recommendation"].trim().length > 0
      ? obj["recommendation"].trim().slice(0, 300)
      : "Monitorar padrão nas próximas rodadas sem ajuste de peso.";

  const rawAdj =
    obj["weightAdjustments"] !== null &&
    typeof obj["weightAdjustments"] === "object"
      ? (obj["weightAdjustments"] as Record<string, unknown>)
      : {};

  // Clamp e validação de cada delta de peso
  const clampDelta = (v: unknown): number | undefined => {
    if (typeof v !== "number" || isNaN(v) || !isFinite(v)) return undefined;
    return Math.max(-0.5, Math.min(0.5, v));
  };

  const weightAdjustments: LLMConditionalPattern["weightAdjustments"] = {};
  const dA = clampDelta(rawAdj["a"]);
  const dB = clampDelta(rawAdj["b"]);
  const dC = clampDelta(rawAdj["c"]);
  const dD = clampDelta(rawAdj["d"]);
  const dE = clampDelta(rawAdj["e"]);
  if (dA !== undefined) weightAdjustments.a = dA;
  if (dB !== undefined) weightAdjustments.b = dB;
  if (dC !== undefined) weightAdjustments.c = dC;
  if (dD !== undefined) weightAdjustments.d = dD;
  if (dE !== undefined) weightAdjustments.e = dE;

  const rawSeverity = obj["severity"];
  const severity: LLMConditionalPattern["severity"] =
    rawSeverity === "critical" ||
    rawSeverity === "moderate" ||
    rawSeverity === "informational"
      ? rawSeverity
      : "informational";

  return { condition, factors, recommendation, weightAdjustments, severity };
}

// ─── Persistência no Banco ────────────────────────────────────────────────────

/**
 * Persiste a Reflexão em 3 tabelas — sempre append-only (PRD §13):
 *
 *   1. `conditional_patterns`  — novo nó (INSERT via $queryRaw com pgvector)
 *   2. `memory_events`         — log imutável (layer=PATTERNS, type="reflexao")
 *   3. `simulation_results`    — marca calibrated=true para a rodada
 *
 * REGRA ABSOLUTA: JAMAIS usar UPDATE ou DELETE em conditional_patterns.
 * Cada Reflexão cria um nó novo. Nós corretivos referenciam o original
 * via patternKey no campo `condition` (estilo Zettelkasten — PRD §5).
 *
 * ─── SQL do INSERT pgvector ───────────────────────────────────────────────────
 *
 * O campo `embedding vector(1536)` é `Unsupported()` no Prisma schema,
 * portanto o INSERT usa `$queryRaw` com o template tag do Prisma.
 *
 * Parâmetros ligados pelo driver pg (não interpolação de string):
 *   $1 = patternKey (string)
 *   $2 = factorsJson (string — array JSON serializado)
 *   $3 = condition (string)
 *   $4 = round (int)
 *   $5 = season (int)
 *   $6 = embeddingStr (string — "[0.1, 0.2, ...]" cast para vector(1536) no SQL)
 *
 * O cast `$6::vector(1536)` é parte do SQL estático gerado pelo template tag —
 * o valor `$6` é passado como parâmetro seguro pelo driver pg.
 *
 * A conversão de JSON array → text[] usa a função nativa do PostgreSQL:
 *   `(SELECT ARRAY(SELECT json_array_elements_text($2::json)))`
 * Isso elimina a necessidade de Prisma.raw() com dados externos.
 */
async function persistReflection(
  round: number,
  season: number,
  pattern: LLMConditionalPattern,
  embedding: number[],
  llmModel: string,
  tokensUsed: number,
  generatedAt: string,
): Promise<{ patternId: string; memoryEventId: string; patternKey: string }> {
  const patternKey = generatePatternKey(pattern.condition, round, season);

  // Serialização do embedding no formato aceito pelo pgvector: "[d0,d1,...,d1535]"
  const embeddingStr = `[${embedding.join(",")}]`;

  // Serialização segura do array de fatores como JSON (parameterizado pelo driver pg)
  const factorsJson = JSON.stringify(pattern.factors);

  // ── 1. INSERT conditional_patterns ──────────────────────────────────────────
  //    $queryRaw com template tag = parameterizado pelo driver pg.
  //    A conversão do array de fatores usa json_array_elements_text() para evitar
  //    qualquer interpolação de string com dados externos.
  const insertResult = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO conditional_patterns (
      id,
      pattern_key,
      factors,
      condition,
      occurrences,
      correct,
      is_anti_corr,
      is_suppressed,
      last_seen_round,
      last_seen_season,
      embedding,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      ${patternKey},
      (SELECT ARRAY(SELECT json_array_elements_text(${factorsJson}::json))),
      ${pattern.condition},
      1,
      0,
      false,
      false,
      ${round},
      ${season},
      ${embeddingStr}::vector(1536),
      NOW(),
      NOW()
    )
    RETURNING id
  `;

  const patternId = insertResult[0]?.id ?? "";

  // ── 2. MemoryEvent — Event Sourcing imutável ─────────────────────────────────
  //    layer=PATTERNS registra o evento cognitivo de autoavaliação.
  //    relevanceScore reflete a severidade do padrão: critical=1.0, moderate=0.6, informational=0.3.
  const memoryEvent = await prisma.memoryEvent.create({
    data: {
      layer: "PATTERNS",
      type: "reflexao",
      source: llmModel,
      relevanceScore:
        pattern.severity === "critical"
          ? 1.0
          : pattern.severity === "moderate"
            ? 0.6
            : 0.3,
      content: {
        round,
        season,
        patternKey,
        patternId,
        condition: pattern.condition,
        factors: pattern.factors,
        recommendation: pattern.recommendation,
        weightAdjustments: pattern.weightAdjustments,
        severity: pattern.severity,
        llmModel,
        tokensUsed,
        generatedAt,
        algorithmVersion: "reflection-agent-v1",
      },
    },
  });

  // ── 3. SimulationResult — marca calibrado ────────────────────────────────────
  //    `simulation_results` não é tabela imutável → UPDATE permitido aqui (PRD §13).
  await prisma.simulationResult.updateMany({
    where: { season, round },
    data: { calibrated: true },
  });

  return { patternId, memoryEventId: memoryEvent.id, patternKey };
}

// ─── Função Principal (Exportada) ─────────────────────────────────────────────

/**
 * Executa o ciclo completo de Reflexão após uma simulação cega.
 *
 *   1. Chama Claude Sonnet 4.5 (primário) → GPT-4o-mini (fallback automático)
 *      passando `report.llmPayload.diagnosticPrompt` como input do usuário
 *   2. Valida e sanitiza o JSON estruturado retornado pela LLM
 *   3. Gera embedding de 1536 dims via OpenAI text-embedding-3-small
 *   4. Persiste em `conditional_patterns` (INSERT via $queryRaw, nunca UPDATE)
 *   5. Registra `MemoryEvent` (layer=PATTERNS, type="reflexao")
 *   6. Marca `SimulationResult.calibrated = true` para a rodada
 *
 * @param report   - Output completo do `simulateRound()` (blind-simulator.ts)
 * @param options.forceModel - Força um provedor específico (padrão: cascata Anthropic → OpenAI)
 *
 * @throws Error se nenhuma API key estiver configurada ou se ambas as chamadas LLM falharem
 */
export async function writeReflection(
  report: SimulationReport,
  options?: { forceModel?: "anthropic" | "openai" },
): Promise<ReflectionResult> {
  const { round, season, llmPayload } = report;
  const generatedAt = new Date().toISOString();

  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  // ── 1. Chamada LLM: Anthropic primário → OpenAI fallback ────────────────────
  let llmRaw: { raw: string; model: string; tokensUsed: number };

  const useAnthropic = options?.forceModel !== "openai" && hasAnthropic;
  const useOpenAI = options?.forceModel !== "anthropic" && hasOpenAI;

  if (useAnthropic) {
    try {
      llmRaw = await callAnthropic(llmPayload.diagnosticPrompt);
    } catch (anthropicErr) {
      if (!useOpenAI) throw anthropicErr;
      console.warn(
        "[reflection-agent] Anthropic falhou — ativando fallback para GPT-4o-mini:",
        anthropicErr,
      );
      llmRaw = await callOpenAIChat(llmPayload.diagnosticPrompt);
    }
  } else if (useOpenAI) {
    llmRaw = await callOpenAIChat(llmPayload.diagnosticPrompt);
  } else {
    throw new Error(
      "[reflection-agent] Nenhuma API key disponível. " +
        "Configure ANTHROPIC_API_KEY ou OPENAI_API_KEY no ambiente.",
    );
  }

  // ── 2. Parse e validação do JSON estruturado ─────────────────────────────────
  const pattern = parsePatternJSON(llmRaw.raw);

  // ── 3. Embedding semântico (OBRIGATÓRIO OpenAI — único provider que temos) ───
  if (!hasOpenAI) {
    throw new Error(
      "[reflection-agent] OPENAI_API_KEY obrigatória para geração de embedding pgvector.",
    );
  }

  // Texto completo para embedding: condição + recomendação
  // Combinar os dois campos aumenta a qualidade semântica no similarity search
  const embeddingInput = `${pattern.condition} ${pattern.recommendation}`;
  const embedding = await generateEmbedding(embeddingInput);

  // ── 4. Persistência append-only no banco ────────────────────────────────────
  const { patternId, memoryEventId, patternKey } = await persistReflection(
    round,
    season,
    pattern,
    embedding,
    llmRaw.model,
    llmRaw.tokensUsed,
    generatedAt,
  );

  return {
    patternKey,
    patternId,
    memoryEventId,
    llmModel: llmRaw.model,
    tokensUsed: llmRaw.tokensUsed,
    generatedAt,
    pattern,
  };
}

// ─── Busca Semântica (Bonus Utility — Fase 5) ─────────────────────────────────

/**
 * Busca padrões condicionais semanticamente similares ao texto fornecido.
 *
 * Usa o operador coseno `<=>` do pgvector (HNSW index definido na migration 009).
 * Similarity = 1 − distância coseno, portanto similarity ∈ [0, 1].
 *
 * Casos de uso:
 *   - Detectar padrões duplicados antes de gravar nova Reflexão (dedup opcional)
 *   - Alimentar o Chat Consultivo (Fase 5) com contexto de memória semântica
 *   - Verificar se o padrão atual já foi observado em rodadas anteriores
 *
 * @param query     - Texto de busca (condição, fator ou descrição livre)
 * @param topK      - Número máximo de resultados (padrão: 5)
 * @param threshold - Similaridade mínima ∈ [0,1] para filtrar resultados (padrão: 0.75)
 */
export async function searchSimilarPatterns(
  query: string,
  topK: number = 5,
  threshold: number = 0.75,
): Promise<
  {
    id: string;
    patternKey: string;
    condition: string;
    recommendation: string | null;
    severity: string | null;
    lastSeenRound: number | null;
    lastSeenSeason: number | null;
    similarity: number;
  }[]
> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "[reflection-agent] OPENAI_API_KEY necessária para busca semântica por similaridade.",
    );
  }

  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  const rows = await prisma.$queryRaw<
    {
      id: string;
      pattern_key: string;
      condition: string;
      last_seen_round: number | null;
      last_seen_season: number | null;
      similarity: number;
    }[]
  >`
    SELECT
      id,
      pattern_key,
      condition,
      last_seen_round,
      last_seen_season,
      1 - (embedding <=> ${embeddingStr}::vector(1536)) AS similarity
    FROM conditional_patterns
    WHERE
      is_suppressed = false
      AND embedding IS NOT NULL
      AND 1 - (embedding <=> ${embeddingStr}::vector(1536)) >= ${threshold}
    ORDER BY embedding <=> ${embeddingStr}::vector(1536)
    LIMIT ${topK}
  `;

  return rows.map((r) => ({
    id: r.id,
    patternKey: r.pattern_key,
    condition: r.condition,
    recommendation: null, // não carregado por padrão (economia de transferência)
    severity: null,
    lastSeenRound: r.last_seen_round,
    lastSeenSeason: r.last_seen_season,
    similarity: Number(r.similarity),
  }));
}
