/**
 * BOB — /chat
 *
 * Server Component wrapper: verifica autenticação antes de renderizar o chat.
 * Usuário não logado → redirect para /login.
 * Usuário logado → renderiza o ChatClient.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { ChatClient } from "./chat-client";

export const metadata = {
  title: "Chat · BOB",
  description: "Chat analítico com o BOB — perguntas sobre o Brasileirão, método e apostas.",
};

export default async function ChatPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const dbUser = await prisma.user
    .findUnique({
      where: { email: user.email!.toLowerCase() },
      select: { active: true },
    })
    .catch(() => null);

  if (!dbUser?.active) {
    redirect("/login");
  }

  return <ChatClient />;
}
