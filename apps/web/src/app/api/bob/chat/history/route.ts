/**
 * BOB — Chat History: GET /api/bob/chat/history
 *
 * Retorna o histórico de mensagens do chat do usuário autenticado.
 * TTL virtual: últimas 50 mensagens dos últimos 4 dias.
 *
 * Segurança:
 *   - Somente usuários autenticados (Supabase SSR)
 *   - Filtra estritamente por userId do usuário autenticado
 */

import { NextResponse } from "next/server";
import { cookies }      from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { prisma }       from "@/lib/db";

const TTL_DAYS  = 4;
const MAX_MSGS  = 50;

export async function GET() {
  const cookieStore = await cookies();
  const supabase    = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const since = new Date();
  since.setDate(since.getDate() - TTL_DAYS);

  const messages = await prisma.chatMessage.findMany({
    where: {
      userId:    user.id,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "asc" },
    take:    MAX_MSGS,
    select: {
      id:        true,
      role:      true,
      content:   true,
      model:     true,
      createdAt: true,
    },
  });

  return NextResponse.json({ messages });
}
