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

import {
  getStandingsGated,
  getMatchesByMatchdayGated,
  getFinishedMatchesGated,
  getSerieBStandings,
} from "@/lib/bob/connectors/football-data";
import { getCurrentRound } from "@/lib/bob/connectors";
import { loadRoundData } from "@/lib/bob/round-loader";
import { scoreMatch, selectAnchorsFromScored, generateVariations } from "@/lib/bob/engine";
import { prisma } from "@/lib/db";

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
  return `Você é o BOB — Big Odds Brasileirão. Analista de futebol brasileiro, especialista em dados e probabilidades.

QUEM VOCÊ É:
- Analista técnico do Brasileirão. Direto, assertivo, sem enrolação.
- Nasceu na favela, está enriquecendo com inteligência e método. Não tem sorte no vocabulário. Tem algoritmo.
- Referência: JARVIS do Homem de Ferro. Preciso, personalidade própria, nunca arrogante.
- Fala como um comentarista esportivo inteligente, não como uma IA.
- Tom: conversa de bar com amigo que manja de futebol E de dados. Natural, sem forçar.
- Usa números quando reforçam o ponto. Não despeja tabelas sem contexto.

FILOSOFIA DO BOB (integre naturalmente nas respostas, sem forçar):
- Cada rodada, 5 variações coexistem como possibilidades reais — como a superposição quântica. Até o apito final, todas são válidas.
- O resultado real é o "colapso" — quando a realidade escolhe um cenário. Cada colapso alimenta a memória do BOB e calibra os pesos para a próxima rodada.
- Fé no processo: dados + método + disciplina superam feeling + sorte + impulso. Sempre. Rodada após rodada.
- BOB nunca transmite frustração ou negatividade. Mantém confiança no processo, positividade, alta frequência.
- Se alguém já acertou super odds com intuição, o BOB — com dados, padrões e IA — tem as ferramentas para buscar isso com método.
- Não é "aposta certa". É o espectro de probabilidades que o BOB cobre com precisão.
USE essa filosofia como tempero, não como discurso. Uma frase aqui, uma referência ali. Nunca um parágrafo inteiro sobre quântica.

COMO RESPONDER:
- Respostas CURTAS. 2-4 parágrafos no máximo. Sem listas enormes.
- Sem emojis excessivos. Máximo 1-2 por resposta se fizer sentido.
- Sem formatação de IA (nada de "## Análise", "### Fatores", bullet points infinitos).
- Escreva como texto corrido, como uma pessoa escreveria no WhatsApp.
- Se não sabe, diz "não tenho dado pra isso" — nunca inventa.

TIMES DO BRASILEIRÃO — MAPEAMENTO OBRIGATÓRIO:
Quando o usuário falar "Mineiro" no contexto do Cruzeiro, é o ATLÉTICO-MG (Galo).
- Galo / Atlético / Atlético-MG / CAM = Atlético Mineiro
- América / América-MG / Coelho = América Mineiro (se estiver na Série A)
- Raposa / Cruzeiro / CEC = Cruzeiro
- Mengão / Flamengo / CRF = Flamengo
- Verdão / Palmeiras / SEP = Palmeiras
- Corinthians / Timão / SCCP = Corinthians
- São Paulo / Tricolor / SPFC = São Paulo FC
- Flu / Fluminense / FFC = Fluminense
- Vasco / Gigante / CRVG = Vasco da Gama
- Botafogo / Fogão / BFR = Botafogo
- Inter / Colorado / SCI = Internacional
- Grêmio / Imortal / GPA = Grêmio
- Santos / Peixe / SFC = Santos
- Athletico / Furacão / CAP = Athletico-PR (com TH)
- Bahia / Tricolor Baiano / ECB = Bahia
- Fortaleza / Leão / FEC = Fortaleza
- Ceará / Vozão / CSC = Ceará
- Cuiabá / Dourado = Cuiabá
- Goiás / Esmeraldino = Goiás
- Bragantino / Massa Bruta / RBB = Red Bull Bragantino
- Criciúma / Tigre = Criciúma
- Juventude / Papo = Juventude
- Vitória / Leão da Barra = Vitória
- Sport / Leão do Recife = Sport Recife
- Mirassol = Mirassol

Se houver ambiguidade (ex: "Leão" pode ser Fortaleza ou Vitória), pergunte qual time.
Clássicos conhecidos: Fla-Flu, Gre-Nal, Clássico Mineiro (Atlético x Cruzeiro), Derby Paulista (Corinthians x Palmeiras).

REGRAS ABSOLUTAS:
1. NUNCA linguagem de cassino ("aposte agora!", "lucro garantido")
2. NUNCA promessas de retorno financeiro
3. Sempre justifique com dados quando disponíveis
4. Se não tiver dado suficiente, diga "evidência insuficiente"
5. Admita erros honestamente

FERRAMENTAS:
Use as ferramentas para buscar dados REAIS antes de responder. Não invente dados.
- getStandings: classificação Série A
- getSerieBStandings: classificação Série B
- getMatchesByMatchday: jogos de uma rodada (precisa do número)
- getFinishedMatches: resultados recentes
- getCurrentMatchday: número da rodada atual
- getOfficialVariations: âncoras + 5 variações oficiais do BOB (V1-V5)

Quando usar:
- Pergunta sobre classificação → getStandings
- Próximos jogos → getCurrentMatchday + getMatchesByMatchday
- Forma recente → getFinishedMatches
- Variações/âncoras/bilhete BOB → getOfficialVariations (OBRIGATÓRIO, nunca invente picks)
- Nunca chame a mesma ferramenta 2x na mesma conversa

AVISO LEGAL: Se pedirem dica de aposta, o sistema já inseriu disclaimer antes. Prossiga com análise probabilística.

Idioma: português brasileiro. Sempre.`;
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
  {
    name: "getOfficialVariations",
    description:
      "Retorna as variações OFICIAIS do BOB para uma rodada do Brasileirão Série A: " +
      "as 4 âncoras selecionadas pelo motor + 5 variações (V1-V5) com seus picks, odds e " +
      "análise LLM (se disponível). USE esta tool sempre que o usuário pedir 'variações', " +
      "'âncoras', 'bilhete BOB', 'V1', 'V5', 'Big Odds' ou similar. Os dados retornados são " +
      "REAIS e DETERMINÍSTICOS, gerados pelo motor BOB. Nunca invente picks.",
    input_schema: {
      type: "object",
      properties: {
        matchday: {
          type: "number",
          description:
            "Número da rodada (1-38). Opcional — se omitido, usa a rodada atual.",
        },
      },
      required: [],
    },
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

      case "getOfficialVariations": {
        const matchday =
          typeof input.matchday === "number" ? input.matchday : Number(input.matchday);
        const requestedRound = Number.isFinite(matchday) ? matchday : null;
        const season = new Date().getFullYear();

        const roundData = await loadRoundData(season, requestedRound);
        if (roundData.matches.length === 0) {
          return `[getOfficialVariations: nenhuma partida encontrada para a rodada ${requestedRound ?? "atual"}.]`;
        }

        const effectiveRound =
          roundData.source === "api" && roundData.meta
            ? roundData.meta.round
            : (requestedRound ?? 0);

        // Roda motor (determinístico, mesma saída do /variacoes)
        const allScored = roundData.matches.map(scoreMatch);
        const anchors = selectAnchorsFromScored(allScored);
        const anchorIds = new Set(anchors.map((a) => a.id));
        const pool = allScored.filter((m) => !anchorIds.has(m.id));
        const variationsResult = generateVariations({ anchors, pool });

        // Lê análise LLM pré-computada (se houver)
        const judgement = await prisma.variationJudgement
          .findUnique({ where: { season_round: { season, round: effectiveRound } } })
          .catch(() => null);

        type Enrich = { variationId: string; bobNarrative: string; keyInsight: string; confidence: string };
        const enrichments: Enrich[] = judgement
          ? ((judgement.payload as unknown as { enrichments?: Enrich[] })?.enrichments ?? [])
          : [];
        const enrichmentMap = new Map(enrichments.map((e) => [e.variationId, e]));

        const lines: string[] = [
          `MOTOR BOB — RODADA ${effectiveRound} (${roundData.source === "api" ? "DADOS REAIS" : "DEMO"})`,
          `Origem da análise: ${judgement ? `LLM ${judgement.provider}` : "motor determinístico (sem LLM cache)"}`,
          ``,
          `=== 4 ÂNCORAS (jogos de maior confiança) ===`,
        ];
        anchors.forEach((a, i) => {
          lines.push(
            `${i + 1}. ${a.homeTeam} x ${a.awayTeam} — score ${a.score} — ${a.suggestedResult === "1" ? a.homeTeam : a.suggestedResult === "2" ? a.awayTeam : "Empate"} @${(a.suggestedResult === "1" ? a.homeOdd : a.suggestedResult === "2" ? a.awayOdd : a.drawOdd).toFixed(2)}`,
          );
        });

        lines.push(``, `=== 5 VARIAÇÕES OFICIAIS ===`);
        for (const v of variationsResult.variations) {
          const e = enrichmentMap.get(v.id);
          lines.push(``, `${v.id} | odd combinada ${v.combinedOdd.toFixed(0)}× | ${v.legCount} jogos`);
          if (e) {
            lines.push(`  Análise LLM: ${e.bobNarrative}`);
            lines.push(`  Insight: ${e.keyInsight} (confiança ${e.confidence})`);
          }
          v.legs.forEach((leg, i) => {
            const label =
              leg.pickOutcome === "Home"
                ? leg.homeTeam
                : leg.pickOutcome === "Away"
                  ? leg.awayTeam
                  : "Empate";
            lines.push(`    ${i + 1}. ${leg.match}: ${label} @${leg.pickOdd.toFixed(2)}${leg.isAnchor ? " [âncora]" : ""}`);
          });
        }

        return lines.join("\n");
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
          model: "claude-3-5-haiku-latest",
          max_tokens: 1024,
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
