"use server";

/**
 * Server actions de "conta" — operações que o próprio usuário pode fazer
 * em si mesmo (não exigem ADMIN).
 */

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { createClient } from "@/utils/supabase/server";

/**
 * Limpa a flag `must_change_password` do usuário logado.
 * Chamado por /conta/senha após troca bem-sucedida.
 *
 * Idempotente. Falha silenciosa se sessão expirou (UI já trata redirect).
 */
export async function clearMustChangePassword() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) return;

  await prisma.user
    .update({
      where: { email: user.email.toLowerCase() },
      data: { mustChangePassword: false },
    })
    .catch((err) => {
      console.warn("[conta] Falha ao limpar mustChangePassword:", err);
    });
}
