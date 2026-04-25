"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { sendAccessApprovedEmail } from "@/lib/email/send-access-approved";
import { createAdminClient } from "@/utils/supabase/admin";

function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

const PRIMARY_ADMIN_EMAIL = "nilson.brites@gmail.com";

/** Envia email de boas-vindas em fire-and-forget (não bloqueia se Resend falhar) */
function notifyAccessApproved(email: string) {
  sendAccessApprovedEmail({ to: email })
    .then((result) => {
      if (!result.ok && !("skipped" in result)) {
        console.warn(`[admin] Falha ao enviar email de aprovação para ${email}: ${result.error}`);
      }
    })
    .catch((err) => {
      console.warn(`[admin] Erro inesperado no email de aprovação:`, err);
    });
}

export async function grantUserAccess(formData: FormData) {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const role = String(formData.get("role") ?? "VIEWER");

  if (!email || !email.includes("@")) {
    throw new Error("E-mail inválido.");
  }

  if (role !== "VIEWER" && role !== "ADMIN") {
    throw new Error("Perfil inválido.");
  }

  // Verifica se já existia ativo (para não enviar email repetido)
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { active: true },
  });

  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      role,
      active: true,
    },
    update: {
      role,
      active: true,
    },
  });

  // Envia notificação apenas para novos ou recém-ativados
  if (!existing || !existing.active) {
    notifyAccessApproved(email);
  }

  revalidatePath("/admin");
}

/**
 * Cria um usuário com email + senha via Supabase Admin API e ativa
 * imediatamente no banco com o role solicitado. Usado pelo painel
 * admin para liberar acesso sem depender de signup público.
 *
 * Requer SUPABASE_SERVICE_ROLE_KEY no ambiente.
 */
export async function createUserWithPassword(formData: FormData) {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "VIEWER");

  if (!email || !email.includes("@")) {
    throw new Error("E-mail inválido.");
  }
  if (password.length < 8) {
    throw new Error("Senha deve ter pelo menos 8 caracteres.");
  }
  if (role !== "VIEWER" && role !== "ADMIN") {
    throw new Error("Perfil inválido.");
  }

  const supabaseAdmin = createAdminClient();

  // 1. Criar usuário no Supabase Auth (email já confirmado, sem confirmação por email)
  const { error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    // Se já existe no Supabase, tenta apenas atualizar a senha
    if (error.message.toLowerCase().includes("already")) {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers();
      const existing = list.users.find((u) => u.email?.toLowerCase() === email);
      if (existing) {
        await supabaseAdmin.auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
        });
      } else {
        throw new Error(`Não foi possível criar usuário: ${error.message}`);
      }
    } else {
      throw new Error(`Não foi possível criar usuário: ${error.message}`);
    }
  }

  // 2. Garantir registro no banco como ativo + role correto
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { active: true },
  });

  await prisma.user.upsert({
    where: { email },
    create: { email, role, active: true },
    update: { role, active: true },
  });

  // 3. Notificar (fire-and-forget) somente novos ou recém-ativados
  if (!existing || !existing.active) {
    notifyAccessApproved(email);
  }

  revalidatePath("/admin");
}

export async function toggleUserAccess(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  if (!userId) {
    throw new Error("Usuário inválido.");
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!target) {
    throw new Error("Usuário não encontrado.");
  }

  if (target.email.toLowerCase() === PRIMARY_ADMIN_EMAIL && !active) {
    throw new Error("O admin principal não pode ser desativado.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { active },
  });

  // Quando reativa, dispara notificação
  if (active && target.email) {
    notifyAccessApproved(target.email);
  }

  revalidatePath("/admin");
}

export async function changeUserRole(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");

  if (!userId) {
    throw new Error("Usuário inválido.");
  }

  if (role !== "VIEWER" && role !== "ADMIN") {
    throw new Error("Perfil inválido.");
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!target) {
    throw new Error("Usuário não encontrado.");
  }

  if (target.email.toLowerCase() === PRIMARY_ADMIN_EMAIL && role !== "ADMIN") {
    throw new Error("O admin principal deve manter perfil ADMIN.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  revalidatePath("/admin");
}
