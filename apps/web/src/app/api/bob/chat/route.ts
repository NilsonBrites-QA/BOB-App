/**
 * BOB — Chat API: POST /api/bob/chat
 *
 * Endpoint de chat conversacional isolado do motor analítico.
 *
 * O BOB responde como assistente analítico de apostas esportivas:
 *   - Responde dúvidas sobre o Brasileirão, método Camillo, apostas
 *   - NÃO modifica âncoras ou variações do motor
 *   - NÃO acessa dados em tempo real da API-Football via esta rota
 *   - Tem acesso ao contexto de personalidade (personality.ts)
 *
 * Para manter o foco e os custos controlados:
 *   - Máximo de 12 mensagens no histórico enviado ao modelo
 *   - Claude Sonnet se disponível, fallback para GPT-4o-mini
 *
 * Body (JSON):
 *   messages — array de { role: "user"|"assistant", content: string }
 *   (incluir histórico completo da conversa no client)
 *
 * Segurança:
 *   - Rate limit: de 1 req/s por user (via Vercel Edge — futuro)
 *   - Somente usuários autenticados
 *   - Sanitização de input: max 2000 chars por mensagem
 */

import { NextResponse }  from "next/server";
import { cookies }       from "next/headers";
import { createClient }  from "@/utils/supabase/server";
import { BOB_TRAITS }    from "@/lib/bob/personality";

const MAX_HISTORY  = 12;   // últimas N mensagens para context window
const MAX_MSG_LEN  = 2000; // chars máximos por mensagem

// ─── Sistema: quem o BOB é no chat ───────────────────────────────────────────

const SYSTEM_PROMPT = `Você é o BOB — Big Odds Brasileirão. ${BOB_TRAITS.manifesto ?? "Analista de apostas esportivas do Brasileirão com base em dados."}

Tom: ${BOB_TRAITS.tom?.publico ?? "assertivo, acessível, técnico quando necessário"}.

Regras:
- Foque exclusivamente em futebol brasileiro (Brasileirão Série A), apostas esportivas, estratégias analíticas e o método Camillo de variações.
- Nunca prometa ganhos, nunca incentive apostas irresponsáveis.
- Seja honesto sobre incerteza: "não sei" é uma resposta válida.
- Responda em português brasileiro.
- Máximo 200 palavras por resposta a menos que o usuário peça mais detalhes.
- Não acesse dados em tempo real — suas respostas são baseadas em conhecimento geral do Brasileirão.`;

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

  if (claudeKey) {
    const reply = await callClaude(messages, claudeKey);
    if (reply) {
      return NextResponse.json({ reply, model: "claude-sonnet" });
    }
  }

  if (openaiKey) {
    const reply = await callOpenAI(messages, openaiKey);
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

async function callClaude(messages: ChatMessage[], apiKey: string): Promise<string | null> {
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
        system:      SYSTEM_PROMPT,
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

async function callOpenAI(messages: ChatMessage[], apiKey: string): Promise<string | null> {
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
          { role: "system", content: SYSTEM_PROMPT },
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
