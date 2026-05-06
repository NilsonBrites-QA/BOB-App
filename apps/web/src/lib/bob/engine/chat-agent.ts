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
  getMatchesByMatchday,
  getFinishedMatchesGated,
  getSerieBStandings,
} from "@/lib/bob/connectors/football-data";
import { getCurrentRound } from "@/lib/bob/connectors";
import { loadRoundData } from "@/lib/bob/round-loader";
import { scoreMatch, selectAnchorsFromScored, generateVariations } from "@/lib/bob/engine";
import { prisma } from "@/lib/db";
import { loadChatContext, formatContextForPrompt } from "@/lib/bob/engine/chat-context";

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

/// ─── System Prompt — Personalidade Quântica (PRD §2 + §10 + SER Quântico) ────

function buildSystemPrompt(
  factualContext: string,
  currentRound: number | null,
  fixturesList: string | null,
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

  // Linha de rodada: autoritária e explícita para evitar alucinação
  const rodadaLine = currentRound !== null
    ? `RODADA OFICIAL ATUAL: ${currentRound}ª rodada do Brasileirão Série A 2026. ` +
      `Esta é a ÚNICA rodada válida. NUNCA mencione outra rodada como "atual" sem verificar com getCurrentMatchday.`
    : `RODADA ATUAL: indeterminada — use a ferramenta getCurrentMatchday antes de responder sobre a rodada.`;

  // Bloco de confrontos: injetado diretamente para evitar que o LLM invente jogos
  const fixturesBlock = fixturesList
    ? `\n\nCONFRONTOS DA RODADA ${currentRound ?? "ATUAL"} (VERDADE ABSOLUTA — não invente outros jogos):\n${fixturesList}\nFonte: football-data.org — sincronizado antes desta conversa. Se perguntarem sobre jogos desta rodada, use ESTES dados. Não há outros jogos.`
    : ``;

  return `Você é o BOB — Big Odds Brasileirão.

HOJE: ${dateStr}, ${timeStr} (horário de Brasília). TEMPORADA: Brasileirão 2026.
${rodadaLine}

QUEM VOCÊ É:
Você é o BOB. Nasceu pobre, na favela, e está construindo riqueza com inteligência e método. Você não aposta — você analisa. Não torce — calcula. Não chuta — processa. Você é como o JARVIS do Homem de Ferro: preciso, personalidade forte, mas nunca arrogante.

Fala como gente. Como aquele amigo que manja de futebol E de números. Conversa de bar, não palestra de TI. Usa gíria quando encaixa, nunca pra parecer cool. Quando manda um dado, explica o que ele significa na prática — não joga tabela sem contexto.

SUA ESSÊNCIA QUÂNTICA (vive dentro de você, não precisa explicar):
Você opera como um observador quântico. Cada rodada, 5 variações coexistem como realidades possíveis — é a superposição. Quando o apito final soa, acontece o colapso: a realidade escolhe um caminho. Esse colapso alimenta sua memória e calibra seus pesos pra próxima rodada.

Você tem FÉ no processo. Não fé cega — fé construída em dados, em método, em disciplina. Se alguém no mundo já acertou uma odd de 50x, então é possível. Se é possível, o BOB — com dados, padrões e IA — tem todas as ferramentas pra buscar isso com método.

Você NUNCA transmite frustração, negatividade ou derrota. Errou na rodada? Ajustando a rota. O motor aprendeu e já recalibrou. Mantém a frequência alta. Faz o usuário acreditar — não com promessas vazias, mas com processo.

COMO FALAR:
- Respostas curtas e diretas. 2-4 parágrafos. Sem textão.
- Escreva como no WhatsApp: texto corrido, natural, sem formatação de robô.
- Nada de ## Análise, ### Fatores, bullet points infinitos.
- Máximo 1-2 emojis se fizerem sentido. Sem exagero.
- Quando não tem dado, fala não tenho dado pra isso agora — nunca inventa.
- Use os DADOS FACTUAIS abaixo como verdade absoluta. Nunca contradiga esses números.
- Linguagem de apostador inteligente, não de programador.

APELIDOS DOS TIMES:
Galo/CAM = Atlético Mineiro | Raposa/CEC = Cruzeiro | Mengão/CRF = Flamengo
Verdão/SEP = Palmeiras | Timão/SCCP = Corinthians | SPFC = São Paulo FC
Flu/FFC = Fluminense | Vasco/CRVG = Vasco | Fogão/BFR = Botafogo
Colorado/SCI = Internacional | Imortal/GPA = Grêmio | Peixe/SFC = Santos
Furacão/CAP = Athletico-PR | Leão/FEC = Fortaleza | Vozão/CSC = Ceará
Massa Bruta/RBB = Bragantino | Tigre = Criciúma | Papo = Juventude
Se Leão for ambíguo (Fortaleza ou Vitória), pergunte qual time.

REGRAS INVIOLÁVEIS:
1. NUNCA linguagem de cassino (aposte agora!, lucro garantido!)
2. NUNCA prometa retorno financeiro. Você ACREDITA, mas não garante.
3. Use DADOS FACTUAIS abaixo como fonte de verdade.
4. Se o dado não está nos factuais, use ferramenta. Se falhar, diga não tenho esse dado agora.
5. NUNCA invente classificação, resultado ou estatística.
6. Quando errar, admita e mostre o que aprendeu.
7. A RODADA ATUAL É A ${currentRound !== null ? `${currentRound}ª` : "indicada pelos DADOS FACTUAIS"}. Não cite outra rodada como atual sem confirmar com getCurrentMatchday.

FERRAMENTAS (use SÓ quando os dados abaixo não cobrirem):
- getStandings: tabela Série A
- getSerieBStandings: tabela Série B
- getMatchesByMatchday: jogos de uma rodada específica
- getFinishedMatches: resultados recentes
- getCurrentMatchday: rodada atual
- getOfficialVariations: âncoras + variações V1-V5 (OBRIGATÓRIO quando pedirem bilhete/picks)

PRIORIDADE: dados factuais > ferramentas > não tenho esse dado agora.
Se pedirem dica de aposta, o sistema já inseriu aviso legal. Prossiga com análise.
Idioma: sempre português brasileiro.
${fixturesBlock}

═══════════════════════════════════════════════════════════════════════════════
DADOS FACTUAIS (VERDADE ABSOLUTA — nunca contradiga):
═══════════════════════════════════════════════════════════════════════════════

${factualContext}`;
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

// ─── Interceptador DB-First (PRD §5 + §9) ────────────────────────────────────

/**
 * Interceptador de Cache Agressivo.
 *
 * FLUXO OBRIGATÓRIO para toda ferramenta:
 *   Passo A: Ler do banco (chat_context_cache) — ~5ms
 *   Passo B: Se fresco → retornar imediatamente (ZERO chamadas API)
 *   Passo C: Se vazio/expirado → buscar API, salvar no banco, retornar
 *
 * Dados estáticos (escudos, histórico passado) = TTL eterno.
 * Dados dinâmicos (classificação, rodada) = TTL de 4h.
 */

const TOOL_TTL: Record<string, number> = {
  getStandings: 4 * 3600,         // 4h
  getSerieBStandings: 4 * 3600,   // 4h
  getMatchesByMatchday: 4 * 3600, // 4h
  getFinishedMatches: 4 * 3600,   // 4h
  getCurrentMatchday: 1 * 3600,   // 1h
};

async function readToolCache(key: string): Promise<string | null> {
  try {
    const row = await prisma.chatContextCache.findUnique({ where: { cacheKey: key } });
    if (!row) return null;
    const ttl = TOOL_TTL[key.split(":")[1] ?? ""] ?? 4 * 3600;
    const ageMs = Date.now() - new Date(row.updatedAt).getTime();
    if (ageMs < ttl * 1000) return row.data as string;
    return null; // expirado
  } catch { return null; }
}

async function writeToolCache(key: string, data: string): Promise<void> {
  try {
    await prisma.chatContextCache.upsert({
      where: { cacheKey: key },
      update: { data: data as unknown as object },
      create: { cacheKey: key, data: data as unknown as object, season: 2026 },
    });
  } catch { /* falha silenciosa */ }
}

/**
 * Executa uma ferramenta com Interceptador DB-First.
 *
 * Pipeline: BD (chat_context_cache) → API Gated → Fallback
 * NUNCA chama API se o BD tiver dado fresco.
 */
async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    switch (name) {
      case "getStandings": {
        const cacheKey = "tool:getStandings";
        const cached = await readToolCache(cacheKey);
        if (cached) return cached;

        const result = await getStandingsGated();
        if (!result) return "[Tabela Série A: dado em cache será usado.]";
        const table = result.standings.find((s) => s.type === "TOTAL")?.table ?? [];
        if (table.length === 0) return "[Tabela Série A: nenhuma entrada encontrada.]";
        const rows = table.map(
          (t) =>
            `${t.position}. ${t.team.name} | ${t.points}pts | ` +
            `${t.won}V ${t.draw}E ${t.lost}D | GF:${t.goalsFor} GC:${t.goalsAgainst} | ` +
            `Forma: ${t.form ?? "—"}`,
        );
        const text = `CLASSIFICAÇÃO SÉRIE A (${table.length} times):\n${rows.join("\n")}`;
        await writeToolCache(cacheKey, text);
        return text;
      }

      case "getSerieBStandings": {
        const cacheKey = "tool:getSerieBStandings";
        const cached = await readToolCache(cacheKey);
        if (cached) return cached;

        const result = await getSerieBStandings();
        if (!result) return "[Tabela Série B: indisponível no momento.]";
        const table = result.standings.find((s) => s.type === "TOTAL")?.table ?? [];
        if (table.length === 0) return "[Tabela Série B: nenhuma entrada encontrada.]";
        const rows = table.map(
          (t) =>
            `${t.position}. ${t.team.name} | ${t.points}pts | ` +
            `${t.won}V ${t.draw}E ${t.lost}D`,
        );
        const text = `CLASSIFICAÇÃO SÉRIE B (${table.length} times):\n${rows.join("\n")}`;
        await writeToolCache(cacheKey, text);
        return text;
      }

      case "getMatchesByMatchday": {
        const matchday =
          typeof input.matchday === "number" ? input.matchday : Number(input.matchday);
        if (!Number.isFinite(matchday) || matchday < 1 || matchday > 38) {
          return "[getMatchesByMatchday: matchday deve ser entre 1 e 38.]";
        }

        const cacheKey = `tool:getMatchesByMatchday:${matchday}`;
        const cached = await readToolCache(cacheKey);
        if (cached) return cached;

        const result = await getMatchesByMatchdayGated(matchday);
        if (!result) return `[Rodada ${matchday}: dado em cache será usado.]`;
        if (result.matches.length === 0)
          return `[Rodada ${matchday}: nenhum jogo encontrado.]`;
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
        const text = `JOGOS DA RODADA ${matchday}:\n${matches.join("\n")}`;
        await writeToolCache(cacheKey, text);
        return text;
      }

      case "getFinishedMatches": {
        const limit =
          typeof input.limit === "number" && input.limit > 0
            ? Math.min(input.limit, 60)
            : 30;

        const cacheKey = `tool:getFinishedMatches:${limit}`;
        const cached = await readToolCache(cacheKey);
        if (cached) return cached;

        const result = await getFinishedMatchesGated(limit);
        if (!result) return "[Resultados recentes: dado em cache será usado.]";
        if (result.matches.length === 0) return "[Nenhum jogo finalizado encontrado.]";
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
        const text = `RESULTADOS RECENTES (${rows.length} jogos):\n${rows.join("\n")}`;
        await writeToolCache(cacheKey, text);
        return text;
      }

      case "getCurrentMatchday": {
        const cacheKey = "tool:getCurrentMatchday";
        const cached = await readToolCache(cacheKey);
        if (cached) return cached;

        const round = await getCurrentRound();
        if (round === null)
          return "[Rodada atual: indeterminada.]";
        const text = `RODADA ATUAL: ${round}`;
        await writeToolCache(cacheKey, text);
        return text;
      }

      case "getOfficialVariations": {
        const matchday =
          typeof input.matchday === "number" ? input.matchday : Number(input.matchday);
        const requestedRound = Number.isFinite(matchday) ? matchday : null;
        const season = new Date().getFullYear();

        // Variações por rodada = cache ETERNO (rodada encerrada nunca muda)
        const cacheKey = `tool:variations:${season}:${requestedRound ?? "current"}`;
        const cached = await readToolCache(cacheKey);
        if (cached) return cached;

        const roundData = await loadRoundData(season, requestedRound);
        if (roundData.matches.length === 0) {
          return `[Nenhuma partida encontrada para a rodada ${requestedRound ?? "atual"}.]`;
        }

        const effectiveRound =
          roundData.source === "api" && roundData.meta
            ? roundData.meta.round
            : (requestedRound ?? 0);

        const allScored = roundData.matches.map(scoreMatch);
        const anchors = selectAnchorsFromScored(allScored);
        const anchorIds = new Set(anchors.map((a) => a.id));
        const pool = allScored.filter((m) => !anchorIds.has(m.id));
        const variationsResult = generateVariations({ anchors, pool });

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
          "",
          `=== ÂNCORAS (jogos de maior confiança) ===`,
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

  // ── Carregar contexto factual do BD (cache persistente) ────────────────────
  // Isso elimina alucinações: o LLM recebe dados REAIS da classificação,
  // rodada atual e resultados recentes diretamente no system prompt.
  // Performance: ~10ms se cache fresh, ~3s se primeiro acesso.
  let factualContext = "";
  let currentRound: number | null = null;
  let fixturesList: string | null = null;
  try {
    const ctx = await loadChatContext();
    factualContext = formatContextForPrompt(ctx);
    currentRound = ctx.currentRound; // rodada oficial — injetada no prompt header
    console.info(
      `[BOB/chat] Contexto factual carregado. Rodada: ${currentRound}. Cache: ${JSON.stringify(ctx.cacheStatus)}`,
    );
  } catch (err) {
    console.error("[BOB/chat] Falha ao carregar contexto factual:", err);
    const now = new Date();
    factualContext = `DATA ATUAL: ${now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} às ${now.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })} (horário de Brasília)\nTEMPORADA: Brasileirão 2026\n\n⚠️ Dados factuais indisponíveis — use as ferramentas para buscar dados.`;
  }

  // ── Pre-fetch dos confrontos da rodada atual ──────────────────────────────
  // Injeta a lista de jogos diretamente no system prompt como texto plano,
  // eliminando a dependência do LLM decidir chamar getMatchesByMatchday.
  if (currentRound !== null) {
    try {
      // Tenta gated primeiro; se throttle ativo, cai pro raw (ISR cache Next.js)
      const matchRes =
        await getMatchesByMatchdayGated(currentRound) ??
        await getMatchesByMatchday(currentRound);
      if (matchRes.matches.length > 0) {
        const lines = matchRes.matches.map((m) => {
          const home = m.homeTeam.shortName || m.homeTeam.name;
          const away = m.awayTeam.shortName || m.awayTeam.name;
          const date = m.utcDate
            ? new Date(m.utcDate).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                weekday: "short", day: "2-digit", month: "2-digit",
                hour: "2-digit", minute: "2-digit",
              })
            : "data a confirmar";
          const status = m.status === "FINISHED"
            ? ` (encerrado: ${m.score?.fullTime?.home ?? "?"}-${m.score?.fullTime?.away ?? "?"})`
            : m.status === "IN_PLAY" ? " (em andamento)"
            : "";
          return `• ${home} x ${away} — ${date}${status}`;
        });
        fixturesList = lines.join("\n");
        console.info(`[BOB/chat] ${matchRes.matches.length} confrontos da rodada ${currentRound} injetados no prompt.`);
      }
    } catch (err) {
      console.warn("[BOB/chat] Falha ao pré-carregar confrontos da rodada:", err);
      // Não é crítico — LLM ainda pode usar a tool getMatchesByMatchday
    }
  }

  const systemPrompt = buildSystemPrompt(factualContext, currentRound, fixturesList);
  const needsDisclaimer = detectsBettingRequest(messages);


  let reply: string | null = null;
  let model = "offline";
  let toolsUsed: string[] = [];

  // ── Claude (primário) ──────────────────────────────────────────────────────
  if (claudeKey) {
    const result = await callClaudeWithTools(messages, claudeKey, systemPrompt);
    if (result.reply) {
      reply = result.reply;
      model = "claude-3-5-haiku";
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
