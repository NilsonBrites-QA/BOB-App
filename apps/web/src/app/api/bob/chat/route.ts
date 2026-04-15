/**
 * BOB — Chat API: POST /api/bob/chat
 *
 * Handler HTTP para o Chat Consultivo (PRD §8).
 * Responsabilidades: autenticação, validação de input, persistência DB.
 *
 * Toda a lógica de IA, personalidade, tools e isolamento do Motor Oficial
 * está encapsulada em @/lib/bob/engine/chat-agent (runConsultiveChat).
 *
 * Body (JSON):
 *   messages — array de { role: "user"|"assistant", content: string }
 *
 * Segurança:
 *   - Somente usuários autenticados
 *   - Sanitização de input: max 2000 chars por mensagem
 */

import { NextResponse } from "next/server";
import { cookies }      from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { prisma }       from "@/lib/db";
import { runConsultiveChat } from "@/lib/bob/engine/chat-agent";
import type { ChatMessage }  from "@/lib/bob/engine/chat-agent";

const MAX_HISTORY = 12;
const MAX_MSG_LEN = 2000;

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
  // try/catch: falha de DB não deve bloquear o usuário de receber resposta
  const userContent = messages[messages.length - 1]!.content;
  try {
    await prisma.chatMessage.create({
      data: {
        userId:  user.id,
        role:    "user",
        content: userContent,
      },
    });
  } catch (dbErr) {
    console.error("[BOB/chat] Falha ao persistir mensagem do usuário:", dbErr);
  }

  // ── Motor Consultivo — isolado do Motor Oficial (PRD §8) ────────────────────
  const result = await runConsultiveChat(messages);

  // Persistir resposta do BOB (falha silenciosa — resposta já produzida)
  try {
    await prisma.chatMessage.create({
      data: {
        userId:  user.id,
        role:    "assistant",
        content: result.reply,
        model:   result.model,
      },
    });
  } catch (dbErr) {
    console.error("[BOB/chat] Falha ao persistir resposta do BOB:", dbErr);
  }

  return NextResponse.json({
    reply:              result.reply,
    model:              result.model,
    toolsUsed:          result.toolsUsed,
    disclaimerInjected: result.disclaimerInjected,
  });
}


