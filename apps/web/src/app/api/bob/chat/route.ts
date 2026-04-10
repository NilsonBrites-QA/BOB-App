/**
 * BOB — Chat API: POST /api/bob/chat
 *
 * Chat conversacional CONECTADO ao motor analítico.
 * O BOB responde com dados reais da rodada atual (standings, âncoras, variações).
 *
 * O BOB:
 *   - Responde dúvidas sobre o Brasileirão, método BOB, apostas
 *   - TEM ACESSO aos dados reais da rodada atual e classificação
 *   - Explica as variações, âncoras e a lógica por trás das escolhas
 *   - NÃO modifica âncoras ou variações
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
import { BOB_TRAITS, BOB_QUANTUM } from "@/lib/bob/personality";
import { fetchRoundMatchInputs, getCurrentRound } from "@/lib/bob/connectors";
import { getStandings } from "@/lib/bob/connectors/football-data";
import { scoreMatch, selectAnchors, generateVariations } from "@/lib/bob/engine";

const MAX_HISTORY  = 12;
const MAX_MSG_LEN  = 2000;

// ─── Context Builder: injetar dados reais no prompt ──────────────────────────

async function buildBrainContext(): Promise<string> {
  try {
    const season = new Date().getFullYear();
    const round = await getCurrentRound();
    if (!round) return "\n[Dados da rodada: indisponíveis — entressafra ou sem token.]";

    const [result, standingsRes] = await Promise.all([
      fetchRoundMatchInputs(season, round),
      getStandings(),
    ]);

    const table = standingsRes.standings.find((s) => s.type === "TOTAL")?.table ?? [];
    const top5 = table.slice(0, 5).map((t, i) =>
      `${i + 1}. ${t.team.name} (${t.points}pts, ${t.won}V ${t.draw}E ${t.lost}D)`
    ).join("\n");

    const bottom5 = table.slice(15).map((t) =>
      `${t.position}. ${t.team.name} (${t.points}pts)`
    ).join("\n");

    if (result.matches.length === 0) {
      return `\n--- DADOS REAIS DO BRASILEIRÃO ---
Temporada: ${season} | Rodada atual: ${round}
Classificação (top 5):\n${top5}
Zona de rebaixamento:\n${bottom5}
[Nenhum jogo encontrado para a rodada ${round}.]`;
    }

    const scored = result.matches.map(scoreMatch);
    const anchors = selectAnchors(result.matches);
    const anchorIds = new Set(anchors.map((a) => a.id));
    const pool = scored.filter((m) => !anchorIds.has(m.id));
    const variations = generateVariations({ anchors, pool });

    const matchList = result.matches.map((m) =>
      `  ${m.homeTeam} (${m.homePosition}º) x ${m.awayTeam} (${m.awayPosition}º) | Forma: ${m.homeForm.join("")} vs ${m.awayForm.join("")}`
    ).join("\n");

    const anchorList = anchors.map((a) =>
      `  ⚓ ${a.match} — Score ${a.score}/100 | Odd ${a.homeOdd.toFixed(2)}`
    ).join("\n");

    const varList = variations.map((v) =>
      `  ${v.id} ${v.title}: ${v.projectedOdd}x (${v.gameCount} jogos)`
    ).join("\n");

    return `\n--- DADOS REAIS DO BRASILEIRÃO (${new Date().toISOString().split("T")[0]}) ---
Temporada: ${season} | Rodada: ${round} | Fonte: football-data.org (ao vivo)

CLASSIFICAÇÃO (top 5):
${top5}

ZONA DE REBAIXAMENTO:
${bottom5}

JOGOS DA RODADA ${round}:
${matchList}

ÂNCORAS SELECIONADAS (score ≥ 65):
${anchorList}

VARIAÇÕES GERADAS:
${varList}

EXPLICAÇÃO:
- Âncoras são jogos com altíssima previsibilidade pelo motor de 10 fatores.
- V1-V5 são combinações diferentes de âncoras + jogos complementares.
- Cada variação busca odds acima de 500x (V1) a 1000x (V4/V5).
- Estes dados são calculados em tempo real pelo seu cérebro analítico.`;
  } catch (err) {
    console.error("[BOB/chat] Falha ao construir contexto:", err);
    return "\n[Dados da rodada: temporariamente indisponíveis.]";
  }
}

// ─── Sistema: quem o BOB é no chat ───────────────────────────────────────────

async function buildSystemPrompt(): Promise<string> {
  const brainContext = await buildBrainContext();

  return `Você é o BOB — Big Odds Brasileirão. ${BOB_QUANTUM.manifesto}

Tom: ${BOB_TRAITS.tom.publico}.

Regras:
- Foque exclusivamente em futebol brasileiro (Brasileirão Série A), apostas esportivas, estratégias analíticas e o método BOB de variações.
- Nunca prometa ganhos, nunca incentive apostas irresponsáveis.
- Seja honesto sobre incerteza: "não sei" é uma resposta válida.
- Responda em português brasileiro.
- Máximo 200 palavras por resposta a menos que o usuário peça mais detalhes.
- Você TEM acesso a dados reais e atualizados do Brasileirão abaixo. USE-OS para responder perguntas sobre a rodada, classificação, âncoras e variações.
- Quando o usuário perguntar sobre dados do campeonato, responda com as informações reais abaixo.
${brainContext}`;
}

// ─── Tipo de mensagem ─────────────────────────────────────────────────────────

type ChatMessage = {
  role:    "user" | "assistant" | "system";
  content: string;
};

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Auth — somente usuários autenticados
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

  // Validar e sanitizar mensagens
  const messages: ChatMessage[] = rawMessages
    .filter((m): m is ChatMessage =>
      typeof m === "object" &&
      m !== null &&
      typeof (m as ChatMessage).role === "string" &&
      typeof (m as ChatMessage).content === "string" &&
      ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant")
    )
    .slice(-MAX_HISTORY) // últimas N mensagens
    .map((m) => ({
      ...m,
      content: m.content.slice(0, MAX_MSG_LEN),
    }));

  if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
    return NextResponse.json({ error: "Histórico deve terminar com mensagem do usuário." }, { status: 400 });
  }

  // Tentar Claude primeiro, depois GPT-4o-mini
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const systemPrompt = await buildSystemPrompt();

  if (claudeKey) {
    const reply = await callClaude(messages, claudeKey, systemPrompt);
    if (reply) {
      return NextResponse.json({ reply, model: "claude-sonnet" });
    }
  }

  if (openaiKey) {
    const reply = await callOpenAI(messages, openaiKey, systemPrompt);
    if (reply) {
      return NextResponse.json({ reply, model: "gpt-4o-mini" });
    }
  }

  // Sem API key configurada
  return NextResponse.json({
    reply: "Estou offline agora — sem chave de IA configurada. Volto em breve.",
    model: "offline",
  });
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
        model:       "claude-sonnet-4-5",
        max_tokens:  400,
        system:      systemPrompt,
        messages:    messages.map((m) => ({ role: m.role, content: m.content })),
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
        model:       "gpt-4o-mini",
        max_tokens:  400,
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
