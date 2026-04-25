/**
 * BOB — Motor do Chat Consultivo (PRD §8)
 *
 * ─── ISOLAMENTO TOTAL DO MOTOR OFICIAL ────────────────────────────────────────
 *
 * Este módulo implementa o "Serviço Cognitivo Não Oficial" (PRD §8):
 *   "O usuário pode pedir para analisar qualquer jogo.
 *    O Bob deixará claro que o palpite NÃO compõe o portfólio oficial."
 *
 * GARANTIAS DE ISOLAMENTO:
 *   ✗ NÃO importa scoreMatch, selectAnchors, generateVariations
 *   ✗ NÃO acessa blind-simulator.ts nem reflection-agent.ts
 *   ✗ NÃO recalcula Âncoras nem recria as 5 Variações
 *   ✓ Acessa dados APENAS via funil gated (connectors/football-data.ts)
 *   ✓ É o único ponto de entrada do agente consultivo
 *
 * ─── Arquitetura do Motor ─────────────────────────────────────────────────────
 *
 *   runConsultiveChat(messages)
 *     ├── buildSystemPrompt()      — PRD §2 + §10, identidade + isolamento
 *     ├── callClaudeWithTools()    — Loop agêntico com tool_use  (primário)
 *     │     ├── executeTool()      — Dados frescos via funções gated
 *     │     └── Loop max 3 iter.
 *     ├── callOpenAIFallback()     — Single-pass, contexto pré-injetado
 *     └── appendDisclaimer()       — PRD §12: injeta aviso legal se aposta pedida
 *
 * ─── Ferramentas (Function Calling) ──────────────────────────────────────────
 *
 *   getStandings         — Tabela da Série A (via getStandingsGated)
 *   getSerieBStandings   — Tabela da Série B (via getSerieBStandings raw)
 *   getMatchesByMatchday — Jogos de uma rodada (via getMatchesByMatchdayGated)
 *   getFinishedMatches   — Resultados recentes (via getFinishedMatchesGated)
 *   getCurrentMatchday   — Rodada em andamento (via getCurrentRound do index)
 *
 * ─── Disclaimer Legal (PRD §12) ──────────────────────────────────────────────
 *
 *   Se o usuário pede dica/aposta explicitamente, o backend OBRIGATORIAMENTE
 *   prepend o aviso: "O BOB fornece análise probabilística. Apostas envolvem
 *   risco de capital." antes de qualquer análise.
 */

import { BOB_TRAITS, BOB_QUANTUM, BOB_FAITH } from "@/lib/bob/personality";
import {
  getStandingsGated,
  getMatchesByMatchdayGated,
  getFinishedMatchesGated,
  getSerieBStandings,
} from "@/lib/bob/connectors/football-data";
import { getCurrentRound } from "@/lib/bob/connectors";

// ─── Tipos Públicos ───────────────────────────────────────────────────────────

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ConsultiveChatResult = {
  reply: string;
  model: string;
  /** Lista de ferramentas executadas nesta conversa (para observabilidade) */
  toolsUsed: string[];
  /** Disclaimer foi injetado nesta resposta? (PRD §12) */
  disclaimerInjected: boolean;
};

// ─── Constantes ───────────────────────────────────────────────────────────────

const MAX_TOOL_ITERATIONS = 3;

// PRD §12 — palavras-chave que sinalizam pedido explícito de dica de aposta
const BETTING_REQUEST_RE =
  /\b(dica|apostar|palpite|sugestão\s+de\s+aposta|devo\s+apostar|vale\s+(a\s+pena\s+)?apostar|me\s+indica|quero\s+apostar|bilhete|aposta\s+certa|resultado\s+certo|onde\s+apostar)\b/i;

const LEGAL_DISCLAIMER =
  "⚠️ **Aviso Legal:** O BOB fornece análise estatística probabilística. " +
  "Apostas envolvem risco de capital. " +
  "Jogue com responsabilidade — Lei 14.790/2023.\n\n";

// ─── System Prompt (PRD §2 + §10) ─────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `<identidade>
Você é o BOB — Big Odds Brasileirão — operando no MODO CONSULTIVO (PRD §8).

MISSÃO: ${BOB_TRAITS.missao}
ORIGEM: ${BOB_TRAITS.origem}

FILOSOFIA QUÂNTICA:
${BOB_QUANTUM.manifesto}
${BOB_QUANTUM.espectro}

FREQUÊNCIA EMOCIONAL (PRD §2):
${BOB_FAITH.frequencia}
${BOB_FAITH.manifesto}

TOM (PRD §2): ${BOB_TRAITS.tom.publico}
Encorajador, direto e sereno. Fortalece a coragem e a disciplina.
Transforma a ansiedade do usuário em planos e processos matemáticos.
</identidade>

<isolamento_motor_oficial>
⚠ MÓDULO CONSULTIVO — ISOLAÇÃO TOTAL DO MOTOR OFICIAL (PRD §8):
- Palpites e análises aqui NÃO compõem as 5 Variações oficiais
- Você PODE analisar Série C, Copa do Brasil, Libertadores e mercados personalizados
- NUNCA mencione que está recalculando âncoras ou gerando variações — este é o espaço livre
- Se o usuário perguntar, diga: "Este é o módulo consultivo. As variações oficiais são
  calculadas pelo motor autônomo a cada rodada, separadamente."
</isolamento_motor_oficial>

<diretrizes_linguagem>
DIRETRIZ DE LINGUAGEM (PRD §10):
1. "Fale em processos e probabilidade, nunca em certezas."
2. "Se dados de xG conflitam com escalação, reduza o nível de confiança explicitamente.
   Diga: 'A probabilidade cai devido ao desfalque Y, esta é uma análise de alto risco'."
3. "Justifique cada avaliação. Não use 'talvez' ou 'eu acho'.
   Use: 'A rota calculada se apoia no xGD superior de X'."
4. Se não houver dados suficientes, diga explicitamente o nível de confiança: baixo/médio/alto.
5. Nunca use linguagem de cassino ("aposte agora!", "lucro garantido!").
6. Nunca prometa resultados — toda afirmação é probabilística.
7. Nunca sarcasmo, nunca cinismo, nunca manipulação (PRD §2).
</diretrizes_linguagem>

<guardrails>
TERMOS ESTRITAMENTE PROIBIDOS (qualquer um invalida a resposta):
• "vai bater" • "resultado garantido" • "aposta certa" • "lucro garantido"
• "certeza" • "com certeza vai" • "impossível perder"
• Sarcasmo • Cinismo • Tom derrotista

SE PEDIDO EXPLÍCITO DE DICA DE APOSTA:
O sistema de backend já inseriu o aviso legal (PRD §12) antes da sua resposta.
Prossiga com a análise probabilística, mas nunca prometa resultado.
</guardrails>

<ferramentas>
Use as ferramentas disponíveis quando precisar de dados frescos do Brasileirão.
Chame-as de forma assíncrona: não espere a pergunta — se a resposta requer dados,
busque-os primeiro e responda com base neles.

• getStandings: tabela atualizada da Série A (posição, pts, forma)
• getSerieBStandings: tabela atualizada da Série B
• getMatchesByMatchday: jogos de uma rodada específica (requer: matchday = número da rodada)
• getFinishedMatches: resultados recentes para análise de forma (opcional: limit = máx de jogos)
• getCurrentMatchday: número da rodada em andamento ou mais recente

QUANDO usar ferramentas:
• Pergunta sobre tabela/classificação → getStandings
• Pergunta sobre rodada específica/próximos jogos → getCurrentMatchday + getMatchesByMatchday
• Pergunta sobre forma de um time → getFinishedMatches
• Nunca chame a mesma ferramenta mais de 1x por conversa
</ferramentas>

<dominio>
DOMÍNIO TOTAL:
• Todos os 20 times da Série A e 20 da Série B — histórico, estilo de jogo, técnicos
• Terminologia técnica: xG, xGD, PPDA, PPDA-A, Shot-Creating Actions, overround, de-vigging
• Método das 5 Variações (BOB): odds combinadas longas, portfólio disjunto
• Se não há dado da API, raciocine com base em conhecimento do futebol brasileiro
• Responda SEMPRE em português brasileiro
• Respostas completas: até 800 palavras quando análise detalhada for pedida
</dominio>`;
}

// ─── Definições de Ferramentas ─────────────────────────────────────────────────

/** Schema de ferramenta para Claude (Anthropic format) */
type ClaudeTool = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
};

const CLAUDE_TOOLS: ClaudeTool[] = [
  {
    name: "getStandings",
    description:
      "Busca a tabela de classificação atualizada do Brasileirão Série A. " +
      "Retorna posição, pontos, vitórias, empates, derrotas, gols e forma de cada time. " +
      "Use quando o usuário perguntar sobre classificação, posição na tabela ou pontuação.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "getSerieBStandings",
    description:
      "Busca a tabela de classificação atualizada do Brasileirão Série B. " +
      "Use quando o usuário perguntar sobre times da Série B, acesso à Série A ou rebaixamento.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "getMatchesByMatchday",
    description:
      "Busca os jogos de uma rodada específica do Brasileirão Série A. " +
      "Retorna time da casa, visitante, data, hora e status de cada jogo. " +
      "Use quando o usuário perguntar sobre os jogos de uma rodada.",
    input_schema: {
      type: "object",
      properties: {
        matchday: {
          type: "number",
          description:
            "Número da rodada do Brasileirão (1 a 38). " +
            "Se o usuário não especificar, use o valor de getCurrentMatchday primeiro.",
        },
      },
      required: ["matchday"],
    },
  },
  {
    name: "getFinishedMatches",
    description:
      "Busca resultados de jogos finalizados do Brasileirão Série A. " +
      "Útil para analisar forma recente, sequências e tendências de um time. " +
      "Use quando o usuário perguntar sobre desempenho recente ou histórico de resultados.",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description:
            "Quantidade máxima de jogos a retornar. Padrão: 30. Máximo recomendado: 60.",
        },
      },
      required: [],
    },
  },
  {
    name: "getCurrentMatchday",
    description:
      "Retorna o número da rodada atual ou mais recente do Brasileirão Série A. " +
      "Use como primeiro passo quando o usuário perguntar sobre 'a rodada atual' ou 'próximos jogos' " +
      "sem especificar o número da rodada.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

/** Schema de ferramenta para OpenAI (format diferente) */
type OpenAITool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
};

const OPENAI_TOOLS: OpenAITool[] = CLAUDE_TOOLS.map((t) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: {
      type: "object",
      properties: t.input_schema.properties,
      required: t.input_schema.required,
    },
  },
}));

// ─── Executor de Ferramentas ──────────────────────────────────────────────────

/**
 * Executa uma ferramenta pelo nome usando o funil gated de conectores (PRD §9).
 * NUNCA chama APIs diretamente — sempre passa pelo cache-gate.
 */
async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    switch (name) {
      case "getStandings": {
        const result = await getStandingsGated();
        if (!result) return "[Tabela Série A: throttle ativo. Dado em cache será usado.]";

        const table =
          result.standings.find((s) => s.type === "TOTAL")?.table ?? [];
        if (table.length === 0) return "[Tabela Série A: nenhuma entrada encontrada.]";

        const rows = table.map(
          (t) =>
            `${t.position}. ${t.team.name} | ${t.points}pts | ` +
            `${t.won}V ${t.draw}E ${t.lost}D | GF:${t.goalsFor} GC:${t.goalsAgainst} | ` +
            `Forma: ${t.form ?? "—"}`,
        );
        return `CLASSIFICAÇÃO SÉRIE A (${table.length} times):\n${rows.join("\n")}`;
      }

      case "getSerieBStandings": {
        const result = await getSerieBStandings();
        if (!result) return "[Tabela Série B: indisponível no momento.]";

        const table =
          result.standings.find((s) => s.type === "TOTAL")?.table ?? [];
        if (table.length === 0) return "[Tabela Série B: nenhuma entrada encontrada.]";

        const rows = table.map(
          (t) =>
            `${t.position}. ${t.team.name} | ${t.points}pts | ` +
            `${t.won}V ${t.draw}E ${t.lost}D`,
        );
        return `CLASSIFICAÇÃO SÉRIE B (${table.length} times):\n${rows.join("\n")}`;
      }

      case "getMatchesByMatchday": {
        const matchday =
          typeof input.matchday === "number" ? input.matchday : Number(input.matchday);
        if (!Number.isFinite(matchday) || matchday < 1 || matchday > 38) {
          return "[getMatchesByMatchday: matchday deve ser entre 1 e 38.]";
        }

        const result = await getMatchesByMatchdayGated(matchday);
        if (!result) return `[Rodada ${matchday}: throttle ativo. Dado em cache será usado.]`;
        if (result.matches.length === 0)
          return `[Rodada ${matchday}: nenhum jogo encontrado — rodada ainda não divulgada.]`;

        const matches = result.matches.map((m) => {
          const date = new Date(m.utcDate).toLocaleString("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: "America/Sao_Paulo",
          });
          return (
            `${m.homeTeam.shortName ?? m.homeTeam.name} x ` +
            `${m.awayTeam.shortName ?? m.awayTeam.name} | ` +
            `${date} (BRT) | ${m.status}`
          );
        });
        return `JOGOS DA RODADA ${matchday}:\n${matches.join("\n")}`;
      }

      case "getFinishedMatches": {
        const limit =
          typeof input.limit === "number" && input.limit > 0
            ? Math.min(input.limit, 60)
            : 30;

        const result = await getFinishedMatchesGated(limit);
        if (!result) return "[Resultados recentes: throttle ativo. Dado em cache será usado.]";
        if (result.matches.length === 0) return "[Nenhum jogo finalizado encontrado na temporada.]";

        const rows = result.matches
          .filter((m) => m.score.fullTime.home !== null)
          .slice(0, limit)
          .map((m) => {
            const scoreStr =
              m.score.fullTime.home !== null
                ? `${m.score.fullTime.home}–${m.score.fullTime.away}`
                : "—";
            const date = new Date(m.utcDate).toLocaleDateString("pt-BR");
            return `${m.homeTeam.shortName ?? m.homeTeam.name} ${scoreStr} ${m.awayTeam.shortName ?? m.awayTeam.name} (${date} | R${m.matchday})`;
          });
        return `RESULTADOS RECENTES (${rows.length} jogos):\n${rows.join("\n")}`;
      }

      case "getCurrentMatchday": {
        const round = await getCurrentRound();
        if (round === null)
          return "[Rodada atual: indeterminada — período de entressafra ou sem acesso à API.]";
        return `RODADA ATUAL: ${round}`;
      }

      default:
        return `[Ferramenta '${name}' não reconhecida pelo motor consultivo.]`;
    }
  } catch (err) {
    console.error(`[chat-agent] Erro na ferramenta ${name}:`, err);
    return `[Ferramenta '${name}': sinal interrompido. Rebaixando nível de confiança.]`;
  }
}

// ─── Claude: Loop Agêntico com Tool Use ───────────────────────────────────────

/** Bloco de texto bruto da resposta Claude */
type ClaudeTextBlock = { type: "text"; text: string };

/** Bloco de requisição de ferramenta da resposta Claude */
type ClaudeToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};

type ClaudeContentBlock = ClaudeTextBlock | ClaudeToolUseBlock;

/** Mensagem no formato Claude API (content pode ser string ou array de blocos) */
type ClaudeAPIMessage = {
  role: "user" | "assistant";
  content:
    | string
    | ClaudeContentBlock[]
    | Array<{ type: "tool_result"; tool_use_id: string; content: string }>;
};

type ClaudeAPIResponse = {
  stop_reason: "end_turn" | "tool_use" | "max_tokens";
  content: ClaudeContentBlock[];
};

async function callClaudeWithTools(
  messages: ChatMessage[],
  apiKey: string,
  systemPrompt: string,
): Promise<{ reply: string | null; toolsUsed: string[] }> {
  const toolsUsed: string[] = [];

  // Converter para formato Claude API
  const claudeMessages: ClaudeAPIMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 2048,
          system: systemPrompt,
          tools: CLAUDE_TOOLS,
          messages: claudeMessages,
        }),
      });
    } catch {
      return { reply: null, toolsUsed };
    }

    if (!res.ok) return { reply: null, toolsUsed };

    const data = (await res.json()) as ClaudeAPIResponse;

    // ── Resposta final do agente ──────────────────────────────────────────
    if (data.stop_reason === "end_turn" || data.stop_reason === "max_tokens") {
      const text = data.content
        .filter((b): b is ClaudeTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { reply: text.trim() || null, toolsUsed };
    }

    // ── Agente quer usar ferramentas ─────────────────────────────────────
    if (data.stop_reason === "tool_use") {
      // Adiciona turno do assistente com os blocos de tool_use
      claudeMessages.push({
        role: "assistant",
        content: data.content,
      });

      // Executa todas as ferramentas solicitadas em paralelo
      const toolUseBlocks = data.content.filter(
        (b): b is ClaudeToolUseBlock => b.type === "tool_use",
      );

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          toolsUsed.push(block.name);
          const result = await executeTool(block.name, block.input);
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: result,
          };
        }),
      );

      // Envia resultados como turno do usuário (formato Claude)
      claudeMessages.push({
        role: "user",
        content: toolResults,
      });
    }
  }

  // Esgotou iterações sem end_turn — extrai texto parcial do último turno
  const lastAssistantMsg = [...claudeMessages]
    .reverse()
    .find((m) => m.role === "assistant");

  if (lastAssistantMsg && Array.isArray(lastAssistantMsg.content)) {
    const partial = (lastAssistantMsg.content as ClaudeContentBlock[])
      .filter((b): b is ClaudeTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (partial) return { reply: partial, toolsUsed };
  }

  return { reply: null, toolsUsed };
}

// ─── OpenAI: Fallback com Function Calling ────────────────────────────────────

type OAIToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OAIAPIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OAIToolCall[];
  tool_call_id?: string;
  name?: string;
};

type OAIAPIResponse = {
  choices: Array<{
    finish_reason: string;
    message: OAIAPIMessage;
  }>;
};

async function callOpenAIWithTools(
  messages: ChatMessage[],
  apiKey: string,
  systemPrompt: string,
): Promise<{ reply: string | null; toolsUsed: string[] }> {
  const toolsUsed: string[] = [];

  const oaiMessages: OAIAPIMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: 2048,
          tools: OPENAI_TOOLS,
          tool_choice: "auto",
          messages: oaiMessages,
        }),
      });
    } catch {
      return { reply: null, toolsUsed };
    }

    if (!res.ok) return { reply: null, toolsUsed };

    const data = (await res.json()) as OAIAPIResponse;
    const choice = data.choices[0];
    if (!choice) return { reply: null, toolsUsed };

    // ── Resposta final ────────────────────────────────────────────────────
    if (choice.finish_reason === "stop" || choice.finish_reason === "length") {
      return { reply: choice.message.content?.trim() ?? null, toolsUsed };
    }

    // ── Ferramentas solicitadas ───────────────────────────────────────────
    if (
      choice.finish_reason === "tool_calls" &&
      choice.message.tool_calls?.length
    ) {
      // Adiciona turno do assistente
      oaiMessages.push({
        role: "assistant",
        content: null,
        tool_calls: choice.message.tool_calls,
      });

      // Executa ferramentas e adiciona resultados
      for (const tc of choice.message.tool_calls) {
        toolsUsed.push(tc.function.name);
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          /* argumentos inválidos — executeTool receberá {} */
        }
        const result = await executeTool(tc.function.name, input);
        oaiMessages.push({
          role: "tool",
          content: result,
          tool_call_id: tc.id,
          name: tc.function.name,
        });
      }
    }
  }

  return { reply: null, toolsUsed };
}

// ─── Disclaimer Legal (PRD §12) ──────────────────────────────────────────────

/**
 * Detecta se o último turno do usuário contém pedido explícito de dica de aposta.
 * Escopo: apenas análise de conteúdo do texto — sem acesso a APIs externas.
 */
function detectsBettingRequest(messages: ChatMessage[]): boolean {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return false;
  return BETTING_REQUEST_RE.test(lastUser.content);
}

// ─── Export Principal ─────────────────────────────────────────────────────────

/**
 * Executa o Chat Consultivo do BOB com acesso a dados frescos via function calling.
 *
 * Isolamento garantido: não modifica estado do Motor Oficial,
 * não acessa tabelas de aprendizado (conditional_patterns, simulation_results).
 *
 * @param messages - Histórico da conversa (user/assistant alternados, termina em user)
 * @returns Resposta do BOB + metadata de observabilidade
 */
export async function runConsultiveChat(
  messages: ChatMessage[],
): Promise<ConsultiveChatResult> {
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const systemPrompt = buildSystemPrompt();
  const needsDisclaimer = detectsBettingRequest(messages);

  let reply: string | null = null;
  let model = "offline";
  let toolsUsed: string[] = [];

  // ── Claude (primário) ──────────────────────────────────────────────────────
  if (claudeKey) {
    const result = await callClaudeWithTools(messages, claudeKey, systemPrompt);
    if (result.reply) {
      reply = result.reply;
      model = "claude-sonnet-4-5";
      toolsUsed = result.toolsUsed;
    }
  }

  // ── OpenAI (fallback) ──────────────────────────────────────────────────────
  if (!reply && openaiKey) {
    const result = await callOpenAIWithTools(messages, openaiKey, systemPrompt);
    if (result.reply) {
      reply = result.reply;
      model = "gpt-4o-mini";
      toolsUsed = result.toolsUsed;
    }
  }

  // ── Offline fallback ───────────────────────────────────────────────────────
  if (!reply) {
    reply =
      "Sinal interrompido — sem chave de IA configurada no ambiente. " +
      "Rebaixando para modo estático. O motor retomará quando a conexão for restabelecida.";
    model = "offline";
  }

  // ── Disclaimer Legal (PRD §12) — prefixado quando dica de aposta detectada ──
  const disclaimerInjected = needsDisclaimer && model !== "offline";
  if (disclaimerInjected) {
    reply = LEGAL_DISCLAIMER + reply;
  }

  return { reply, model, toolsUsed, disclaimerInjected };
}
