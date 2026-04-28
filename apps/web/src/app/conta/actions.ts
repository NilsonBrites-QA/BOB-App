"use server";

/**
 * Server actions de "conta" — operações que o próprio usuário pode fazer
 * em si mesmo (não exigem ADMIN).
 */

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { createClient } from "@/utils/supabase/server";
import { sendPasswordChangedEmail } from "@/lib/email/send-password-changed";

/**
 * Limpa a flag `must_change_password` do usuário logado E dispara email
 * de notificação de segurança ("sua senha foi alterada").
 *
 * Chamado por /conta/senha após troca bem-sucedida.
 *
 * Idempotente. Falha silenciosa se sessão expirou (UI já trata redirect).
 * O email é fire-and-forget — não bloqueia o usuário se Resend estiver fora.
 */
export async function clearMustChangePassword() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) return;

  const email = user.email.toLowerCase();

  await prisma.user
    .update({
      where: { email },
      data: { mustChangePassword: false },
    })
    .catch((err) => {
      console.warn("[conta] Falha ao limpar mustChangePassword:", err);
    });

  // Notifica o usuário que a senha foi alterada (segurança — padrão de bancos).
  // Fire-and-forget: erro do Resend só vai pro log.
  sendPasswordChangedEmail({ to: email })
    .then((result) => {
      if (!result.ok && !("skipped" in result)) {
        console.warn(`[conta] Falha ao enviar email de senha alterada para ${email}: ${result.error}`);
      }
    })
    .catch((err) => {
      console.warn("[conta] Erro inesperado no email de senha alterada:", err);
    });
}
