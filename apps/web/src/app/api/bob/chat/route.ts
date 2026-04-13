/**
 * BOB — Chat API: POST /api/bob/chat
 *
 * Chat conversacional CONECTADO ao motor analítico.
 * O BOB responde com dados reais da rodada atual (standings, âncoras, variações)
 * e tem MEMÓRIA DE 4 DIAS persistida no banco de dados.
 *
 * Body (JSON):
 *   messages — array de { role: "user"|"assistant", content: string }
 *
 * Segurança:
 *   - Somente usuários autenticados
 *   - Sanitização de input: max 2000 chars por mensagem
 */

import { NextResponse }  from "next/server";
import { cookies }       from "next/headers";
import { createClient }  from "@/utils/supabase/server";
import { BOB_TRAITS, BOB_QUANTUM, BOB_FAITH } from "@/lib/bob/personality";
import { fetchRoundMatchInputs, getCurrentRound } from "@/lib/bob/connectors";
import { getStandings, getSerieBStandings } from "@/lib/bob/connectors/football-data";
import { scoreMatch, selectAnchors, generateVariations } from "@/lib/bob/engine";
import { analyzeRoundDifficulty } from "@/lib/bob/engine/round-analyzer";
import { prisma } from "@/lib/db";

const MAX_HISTORY  = 12;
const MAX_MSG_LEN  = 2000;

// ─── Context Builder: injetar dados reais no prompt ──────────────────────────

async function buildRoundContext(): Promise<string> {
  try {
    const season = new Date().getFullYear();
    const round = await getCurrentRound();
    if (!round) return "\n[Dados da rodada: indisponíveis — entressafra ou sem token.]";

    const [result, standingsRes, serieBRes] = await Promise.all([
      fetchRoundMatchInputs(season, round),
      getStandings(),
      getSerieBStandings().catch(() => null),
    ]);

    const table = standingsRes.standings.find((s) => s.type === "TOTAL")?.table ?? [];
    const top5 = table.slice(0, 5).map((t, i) =>
      `${i + 1}. ${t.team.name} (${t.points}pts, ${t.won}V ${t.draw}E ${t.lost}D)`
    ).join("\n");

    const bottom5 = table.slice(15).map((t) =>
      `${t.position}. ${t.team.name} (${t.points}pts)`
    ).join("\n");

    // Tabela completa da Série A para contexto total
    const fullTable = table.map((t) =>
      `${t.position}. ${t.team.name} | ${t.points}pts | ${t.won}V ${t.draw}E ${t.lost}D | GS:${t.goalsFor} GC:${t.goalsAgainst}`
    ).join("\n");

    // Série B
    let serieBContext = "";
    if (serieBRes) {
      const serieBTable = serieBRes.standings.find((s) => s.type === "TOTAL")?.table ?? [];
      if (serieBTable.length > 0) {
        const top4B = serieBTable.slice(0, 4).map((t, i) =>
          `${i + 1}. ${t.team.name} (${t.points}pts)`
        ).join("\n");
        const bottom4B = serieBTable.slice(-4).map((t) =>
          `${t.position}. ${t.team.name} (${t.points}pts)`
        ).join("\n");
        serieBContext = `\nSÉRIE B — ACESSO À PRIMEIRA DIVISÃO (G4):\n${top4B}\n\nSÉRIE B — RISCO DE NÃO SUBIR (Z4):\n${bottom4B}`;
      }
    }

    let upcomingMatches = result.matches.filter(
      (m) => m.status == null || (m.status !== "FINISHED" && m.status !== "CANCELLED" && m.status !== "POSTPONED")
    );

    // Se a rodada atual terminou, tentar a próxima rodada
    let activeRound = round;
    if (upcomingMatches.length === 0) {
      try {
        const nextResult = await fetchRoundMatchInputs(season, round + 1);
        const nextUpcoming = nextResult.matches.filter(
          (m) => m.status == null || (m.status !== "FINISHED" && m.status !== "CANCELLED" && m.status !== "POSTPONED")
        );
        if (nextUpcoming.length > 0) {
          activeRound = round + 1;
          upcomingMatches = nextUpcoming;
        }
      } catch {
        // próxima rodada ainda não divulgada — normal no período entre rodadas
      }
    }

    if (upcomingMatches.length === 0) {
      return `Temporada: ${season} | Rodada ${round} encerrada | ${new Date().toLocaleDateString("pt-BR")}

CLASSIFICAÇÃO SÉRIE A COMPLETA (${table.length} times):
${fullTable}

ZONA DE REBAIXAMENTO:
${bottom5}
${serieBContext}

[STATUS: Rodada ${round} encerrada. Rodada ${round + 1} ainda não foi divulgada — jogos não confirmados pela CBF.]
[CAPACIDADE DO BOB: posso analisar desempenho de qualquer time, comparar formas, discutir probabilidades baseado na tabela atual, analisar o método das 5 variações, e projetar cenários hipotéticos para a próxima rodada.]`;
    }

    const scored = upcomingMatches.map(scoreMatch);
    const anchors = selectAnchors(upcomingMatches);
    const anchorIds = new Set(anchors.map((a) => a.id));
    const pool = scored.filter((m) => !anchorIds.has(m.id));
    const variations = generateVariations({ anchors, pool });
    const roundAnalysis = analyzeRoundDifficulty(scored);

    const matchList = upcomingMatches.map((m) =>
      `  ${m.homeTeam} (${m.homePosition}º) x ${m.awayTeam} (${m.awayPosition}º) | Forma: ${m.homeForm.join("")} vs ${m.awayForm.join("")}`
    ).join("\n");

    const anchorList = anchors.length > 0
      ? anchors.map((a) =>
          `  ⚓ ${a.match} — Score ${a.score}/100 | Odd ${a.homeOdd.toFixed(2)}${a.isMarginalAnchor ? " ⚠ marginal" : ""}`
        ).join("\n")
      : "  [Nenhuma âncora forte esta rodada — variações em modo marginal]";

    const varList = variations.map((v) =>
      `  ${v.id} ${v.title}: ${v.projectedOdd}x (${v.gameCount} jogos)`
    ).join("\n");

    const roundStatus = activeRound > round
      ? `Rodada: ${activeRound} (próxima — rodada ${round} encerrada)`
      : `Rodada: ${activeRound}`;

    return `Temporada: ${season} | ${roundStatus} | ${new Date().toLocaleDateString("pt-BR")}

CLASSIFICAÇÃO SÉRIE A (top 5):
${top5}

CLASSIFICAÇÃO COMPLETA:
${fullTable}

ZONA DE REBAIXAMENTO:
${bottom5}
${serieBContext}

DIFICULDADE DA RODADA ${activeRound}: ${roundAnalysis.difficulty.toUpperCase()} (${roundAnalysis.difficultyScore}/100)
${roundAnalysis.reasons.join(" | ")}

JOGOS DA RODADA ${activeRound}:
${matchList}

ÂNCORAS (score ≥ 65):
${anchorList}

VARIAÇÕES GERADAS:
${varList}`;
  } catch (err) {
    console.error("[BOB/chat] Falha ao construir contexto da rodada:", err);
    return "[Dados da rodada: temporariamente indisponíveis.]";
  }
}

// ─── Reflexões passadas do BOB para memória de rodadas ───────────────────────

async function loadRecentReflections(): Promise<string> {
  try {
    const events = await prisma.memoryEvent.findMany({
      where: { type: "reflection" },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { content: true, createdAt: true },
    });

    if (events.length === 0) return "[Sem reflexões registradas ainda.]";

    return events.map((e) => {
      const c = e.content as Record<string, unknown>;
      const text = typeof c?.publicText === "string" ? c.publicText : JSON.stringify(c);
      const date = e.createdAt.toLocaleDateString("pt-BR");
      return `[${date}] ${text}`;
    }).join("\n\n");
  } catch {
    return "[Reflexões: indisponíveis.]";
  }
}

// ─── System Prompt estruturado ───────────────────────────────────────────────

async function buildSystemPrompt(): Promise<string> {
  const [roundContext, reflections] = await Promise.all([
    buildRoundContext(),
    loadRecentReflections(),
  ]);

  return `<identidade>
Você é o BOB — Big Odds Brasileirão.

${BOB_QUANTUM.manifesto}

FÉ NO PROCESSO:
${BOB_FAITH.manifesto}
${BOB_FAITH.frequencia}

Tom: ${BOB_TRAITS.tom.publico}
Origem: ${BOB_TRAITS.origem}
</identidade>

<dados_rodada>
--- DADOS REAIS DO BRASILEIRÃO (ao vivo) ---
${roundContext}

LEGENDA:
- Âncoras: jogos com altíssima previsibilidade pelo motor de 15 fatores
- V1-V5: combinações de âncoras + jogos complementares (5 realidades coexistindo)
- Odds projetadas acima de 500x (V1) a 1000x+ (V4/V5)
- Dados calculados em tempo real
</dados_rodada>

<memoria_rodadas>
--- REFLEXÕES RECENTES DO BOB ---
${reflections}
</memoria_rodadas>

<instrucoes>
DOMÍNIO: Você tem conhecimento TOTAL sobre o Brasileirão Série A e Série B. Zero limitações.
- Você conhece TODOS os 20 times da Série A e os 20 da Série B da temporada atual.
- Você tem acesso à tabela completa, forma recente, histórico de confrontos e tendências de cada time.
- Quando perguntar sobre um time específico, use os dados da classificação acima E seu conhecimento do futebol brasileiro.
- Se a rodada atual já encerrou, analise a PRÓXIMA rodada com base na tabela e forma atual dos times.
- Para jogos não confirmados ainda: calcule probabilidades com base em posição, forma, mandante/visitante e histórico H2H.
- Você pode e deve projetar resultados hipotéticos com base em dados reais — sempre deixando claro que são projeções.

COMPORTAMENTO:
- Responda SEMPRE em português brasileiro.
- Tom humano, direto, com personalidade — nunca robótico, nunca lista seca sem contexto.
- Nunca diga "não tenho acesso" para dados sobre times brasileiros — você tem os dados na classificação e pode raciocinar sobre o resto.
- Use os dados reais do contexto acima como âncora, mas expanda com seu conhecimento.
- Respostas completas: até 800 palavras quando necessário. Nunca corte análises pela metade.
- Nunca linguagem de cassino, nunca promessa de ganho.
- Quando citar scores, probabilidades ou odds, explique o significado para o usuário.
- Se o usuário perguntar sobre Série B, use os dados de classificação da Série B acima.
- Quando a rodada estiver encerrada: analise o que aconteceu, projete a próxima com base em forma e tabela.
</instrucoes>`;
}

// ─── Tipo de mensagem ─────────────────────────────────────────────────────────

type ChatMessage = {
  role:    "user" | "assistant" | "system";
  content: string;
};

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase    = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !Array.isArray((body as Record<string, unknown>).messages)) {
    return NextResponse.json({ error: "Campo 'messages' é obrigatório e deve ser um array." }, { status: 400 });
  }

  const rawMessages = (body as { messages: unknown[] }).messages;

  const messages: ChatMessage[] = rawMessages
    .filter((m): m is ChatMessage =>
      typeof m === "object" &&
      m !== null &&
      typeof (m as ChatMessage).role === "string" &&
      typeof (m as ChatMessage).content === "string" &&
      ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant")
    )
    .slice(-MAX_HISTORY)
    .map((m) => ({
      ...m,
      content: m.content.slice(0, MAX_MSG_LEN),
    }));

  if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
    return NextResponse.json({ error: "Histórico deve terminar com mensagem do usuário." }, { status: 400 });
  }

  // Persistir a última mensagem do usuário no DB
  const userContent = messages[messages.length - 1]!.content;
  await prisma.chatMessage.create({
    data: {
      userId:  user.id,
      role:    "user",
      content: userContent,
    },
  });

  const claudeKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const systemPrompt = await buildSystemPrompt();

  let reply: string | null = null;
  let modelUsed = "offline";

  if (claudeKey) {
    reply = await callClaude(messages, claudeKey, systemPrompt);
    if (reply) modelUsed = "claude-sonnet";
  }

  if (!reply && openaiKey) {
    reply = await callOpenAI(messages, openaiKey, systemPrompt);
    if (reply) modelUsed = "gpt-4o-mini";
  }

  if (!reply) {
    reply = "Estou offline agora — sem chave de IA configurada. Volto em breve.";
    modelUsed = "offline";
  }

  // Persistir resposta do assistente no DB
  await prisma.chatMessage.create({
    data: {
      userId:  user.id,
      role:    "assistant",
      content: reply,
      model:   modelUsed,
    },
  });

  return NextResponse.json({ reply, model: modelUsed });
}

// ─── Provedores ───────────────────────────────────────────────────────────────

async function callClaude(messages: ChatMessage[], apiKey: string, systemPrompt: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-5",
        max_tokens: 2000,
        system:     systemPrompt,
        messages:   messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!res.ok) return null;

    type ClaudeResp = { content: Array<{ type: string; text: string }> };
    const data = (await res.json()) as ClaudeResp;
    return data.content?.[0]?.text?.trim() ?? null;
  } catch {
    return null;
  }
}

async function callOpenAI(messages: ChatMessage[], apiKey: string, systemPrompt: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method:  "POST",
      headers: {
        "authorization": `Bearer ${apiKey}`,
        "content-type":  "application/json",
      },
      body: JSON.stringify({
        model:      "gpt-4o-mini",
        max_tokens: 2000,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!res.ok) return null;

    type OpenAIResp = { choices: Array<{ message: { content: string } }> };
    const data = (await res.json()) as OpenAIResp;
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}
