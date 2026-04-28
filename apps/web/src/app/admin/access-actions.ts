"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { sendAccessApprovedEmail } from "@/lib/email/send-access-approved";
import { sendPasswordResetByAdminEmail } from "@/lib/email/send-password-reset-by-admin";
import { sendPasswordRecoveryLinkEmail } from "@/lib/email/send-password-recovery-link";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { isPrimaryAdmin } from "@/lib/auth/config";
import { validateStrongPassword } from "@/lib/auth/password";

function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

/**
 * Garante que o caller é admin ativo. Lança se não for.
 * Toda server action sensível chama isto antes de operar.
 */
async function assertCallerIsAdmin() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    throw new Error("Sessão inválida.");
  }
  const dbUser = await prisma.user.findUnique({
    where: { email: user.email.toLowerCase() },
    select: { role: true, active: true },
  });
  if (!dbUser?.active || dbUser.role !== "ADMIN") {
    throw new Error("Acesso negado: somente ADMIN pode executar esta ação.");
  }
}

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
  await assertCallerIsAdmin();

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
  await assertCallerIsAdmin();

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "VIEWER");

  if (!email || !email.includes("@")) {
    throw new Error("E-mail inválido.");
  }
  const pwdCheck = validateStrongPassword(password);
  if (!pwdCheck.ok) {
    throw new Error(pwdCheck.reason);
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
  await assertCallerIsAdmin();

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

  if (isPrimaryAdmin(target.email) && !active) {
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
  await assertCallerIsAdmin();

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

  if (isPrimaryAdmin(target.email) && role !== "ADMIN") {
    throw new Error("O admin principal deve manter perfil ADMIN.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  revalidatePath("/admin");
}

/**
 * Admin reseta a senha de outro usuário. Define `must_change_password=true`
 * para forçar o usuário a trocar a senha no próximo login (UX padrão de
 * reset corporativo). A senha definida aqui é TEMPORÁRIA — o admin deve
 * comunicá-la ao usuário fora-do-app (mensagem, telefone, etc).
 *
 * Bloqueado contra resetar admin principal (proteção contra lockout).
 */
export async function adminResetUserPassword(formData: FormData) {
  await assertCallerIsAdmin();

  const userId = String(formData.get("userId") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");

  if (!userId) {
    throw new Error("Usuário inválido.");
  }
  const pwdCheck = validateStrongPassword(newPassword);
  if (!pwdCheck.ok) {
    throw new Error(pwdCheck.reason);
  }

  // Captura quem executou o reset (apenas o email — vai no email de notificação).
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user: caller } } = await supabase.auth.getUser();

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!target) {
    throw new Error("Usuário não encontrado.");
  }

  if (isPrimaryAdmin(target.email)) {
    throw new Error(
      "O admin principal não pode ter a senha resetada por outro admin. Use a tela /conta/senha logado como ele, ou edite via Supabase Dashboard.",
    );
  }

  // 1. Atualizar senha no Supabase Auth
  const supabaseAdmin = createAdminClient();
  const { data: list } = await supabaseAdmin.auth.admin.listUsers();
  const supabaseUser = list.users.find(
    (u) => u.email?.toLowerCase() === target.email.toLowerCase(),
  );

  if (!supabaseUser) {
    // Caso raro: existe no DB mas não no Supabase. Cria.
    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: target.email,
      password: newPassword,
      email_confirm: true,
    });
    if (createErr) {
      throw new Error(`Falha ao criar usuário no Supabase: ${createErr.message}`);
    }
  } else {
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
      supabaseUser.id,
      { password: newPassword, email_confirm: true },
    );
    if (updateErr) {
      throw new Error(`Falha ao atualizar senha: ${updateErr.message}`);
    }
  }

  // 2. Marcar must_change_password no DB para forçar troca no próximo login
  await prisma.user.update({
    where: { id: userId },
    data: { mustChangePassword: true },
  });

  // 3. Enviar email com a senha temporária (fire-and-forget, não bloqueia UI).
  // Inclui o email do admin que executou o reset — útil para auditoria pelo destinatário.
  const adminEmail = caller?.email;
  sendPasswordResetByAdminEmail({
    to: target.email,
    temporaryPassword: newPassword,
    adminEmail,
  })
    .then((result) => {
      if (!result.ok && !("skipped" in result)) {
        console.warn(`[admin] Falha ao enviar email de reset para ${target.email}: ${result.error}`);
      }
    })
    .catch((err) => {
      console.warn("[admin] Erro inesperado no email de reset:", err);
    });

  revalidatePath("/admin");
}

/**
 * Admin remove completamente um usuário (Supabase Auth + DB).
 * Operação destrutiva: recomendamos confirmação dupla na UI.
 *
 * Bloqueado contra deletar admin principal e contra deletar a si mesmo
 * (proteção contra lockout).
 */
export async function adminDeleteUser(formData: FormData) {
  await assertCallerIsAdmin();

  const userId = String(formData.get("userId") ?? "");
  if (!userId) {
    throw new Error("Usuário inválido.");
  }

  // Caller (não pode deletar a si mesmo)
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user: caller } } = await supabase.auth.getUser();

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!target) {
    throw new Error("Usuário não encontrado.");
  }

  if (isPrimaryAdmin(target.email)) {
    throw new Error("O admin principal não pode ser deletado.");
  }

  if (caller?.email?.toLowerCase() === target.email.toLowerCase()) {
    throw new Error("Você não pode deletar sua própria conta.");
  }

  // 1. Remover do Supabase Auth
  const supabaseAdmin = createAdminClient();
  const { data: list } = await supabaseAdmin.auth.admin.listUsers();
  const supabaseUser = list.users.find(
    (u) => u.email?.toLowerCase() === target.email.toLowerCase(),
  );
  if (supabaseUser) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(supabaseUser.id);
    if (error) {
      console.warn(`[admin] Falha ao remover ${target.email} do Supabase Auth:`, error.message);
      // Continua mesmo assim — admin pode limpar manualmente depois
    }
  }

  // 2. Remover do DB
  await prisma.user.delete({ where: { id: userId } });

  revalidatePath("/admin");
}

/**
 * Endpoint público (chamado em /login → "Esqueci a senha"): dispara email
 * de recovery via Supabase. O email tem um link mágico que valida sessão e
 * redireciona pra /conta/senha onde o user define nova senha.
 *
 * NÃO indica se o email existe ou não (proteção contra enumeration attack).
 * Sempre retorna sucesso na UI.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = normalizeEmail(String(formData.get("email") ?? ""));

  if (!email || !email.includes("@")) {
    throw new Error("E-mail inválido.");
  }

  // Só dispara se o email está na whitelist ativa (evita spam de pessoas
  // aleatórias tentando descobrir emails válidos). Falha silenciosa se não.
  const dbUser = await prisma.user.findUnique({
    where: { email },
    select: { active: true },
  });

  if (!dbUser?.active) {
    // Não revelar — apenas registra log e retorna ok.
    console.warn(`[auth] Reset solicitado para email não-whitelisted/inativo: ${email}`);
    return;
  }

  const supabaseAdmin = createAdminClient();
  // Link de recovery: leva pro /auth/confirm que então redireciona pra /conta/senha
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  if (error || !data?.properties?.action_link) {
    console.warn(`[auth] Falha ao gerar link de recovery para ${email}:`, error?.message);
    // Não propaga o erro — retorna ok pra UI por motivo de segurança
    return;
  }

  // Envia o email com nosso template customizado (não usa o template padrão do Supabase).
  // Fire-and-forget: falhas só vão pro log do servidor.
  sendPasswordRecoveryLinkEmail({
    to: email,
    recoveryLink: data.properties.action_link,
  })
    .then((result) => {
      if (!result.ok && !("skipped" in result)) {
        console.warn(`[auth] Falha ao enviar email de recovery para ${email}: ${result.error}`);
      }
    })
    .catch((err) => {
      console.warn("[auth] Erro inesperado no email de recovery:", err);
    });
}
