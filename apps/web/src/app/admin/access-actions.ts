"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { sendAccessApprovedEmail } from "@/lib/email/send-access-approved";
import { sendPasswordResetByAdminEmail } from "@/lib/email/send-password-reset-by-admin";
import { sendPasswordResetLinkEmail } from "@/lib/email/send-password-reset-link";
import { sendPasswordRecoveryLinkEmail } from "@/lib/email/send-password-recovery-link";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { isPrimaryAdmin } from "@/lib/auth/config";
import { validateStrongPassword } from "@/lib/auth/password";

// ─── Tipos de resposta padronizados ─────────────────────────────────────────
// NUNCA lançamos erros em server actions — retornamos objetos serializáveis.
// O Client Component lê { success, message } e exibe feedback sem crash.

export type ActionResult = {
  success: boolean;
  message: string;
  error?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

/**
 * Garante que o caller é admin ativo.
 * Retorna null se OK, string de erro se falhar.
 */
async function checkCallerIsAdmin(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return "Sessão inválida.";
    const dbUser = await prisma.user.findUnique({
      where: { email: user.email.toLowerCase() },
      select: { role: true, active: true },
    });
    if (!dbUser?.active || dbUser.role !== "ADMIN") {
      return "Acesso negado: somente ADMIN pode executar esta ação.";
    }
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Erro ao verificar permissões.";
  }
}

/** Envia email de boas-vindas em fire-and-forget */
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

// ─── Actions ─────────────────────────────────────────────────────────────────

export async function grantUserAccess(formData: FormData): Promise<ActionResult> {
  const authError = await checkCallerIsAdmin();
  if (authError) return { success: false, message: authError };

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const role = String(formData.get("role") ?? "VIEWER");

  if (!email || !email.includes("@")) {
    return { success: false, message: "E-mail inválido." };
  }
  if (role !== "VIEWER" && role !== "ADMIN") {
    return { success: false, message: "Perfil inválido." };
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { active: true },
    });

    await prisma.user.upsert({
      where: { email },
      create: { email, role, active: true },
      update: { role, active: true },
    });

    if (!existing || !existing.active) {
      notifyAccessApproved(email);
    }

    revalidatePath("/admin");
    return { success: true, message: `Acesso liberado para ${email} como ${role}.` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao liberar acesso.";
    console.error("[admin/grantUserAccess]", err);
    return { success: false, message: "Falha ao liberar acesso.", error: msg };
  }
}

/**
 * Cria usuário com email + senha via Supabase Admin API.
 * Requer SUPABASE_SERVICE_ROLE_KEY.
 */
export async function createUserWithPassword(formData: FormData): Promise<ActionResult> {
  const authError = await checkCallerIsAdmin();
  if (authError) return { success: false, message: authError };

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "VIEWER");

  if (!email || !email.includes("@")) {
    return { success: false, message: "E-mail inválido." };
  }
  const pwdCheck = validateStrongPassword(password);
  if (!pwdCheck.ok) {
    return { success: false, message: pwdCheck.reason };
  }
  if (role !== "VIEWER" && role !== "ADMIN") {
    return { success: false, message: "Perfil inválido." };
  }

  try {
    const supabaseAdmin = createAdminClient();

    const { error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      // Se já existe no Supabase, apenas atualiza a senha
      if (error.message.toLowerCase().includes("already")) {
        const { data: list } = await supabaseAdmin.auth.admin.listUsers();
        const existing = list.users.find((u) => u.email?.toLowerCase() === email);
        if (existing) {
          const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
            password,
            email_confirm: true,
          });
          if (updateErr) {
            return { success: false, message: `Falha ao atualizar senha: ${updateErr.message}` };
          }
        } else {
          return { success: false, message: `Não foi possível criar usuário: ${error.message}` };
        }
      } else {
        return { success: false, message: `Não foi possível criar usuário: ${error.message}` };
      }
    }

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { active: true },
    });

    await prisma.user.upsert({
      where: { email },
      create: { email, role, active: true },
      update: { role, active: true },
    });

    if (!existing || !existing.active) {
      notifyAccessApproved(email);
    }

    revalidatePath("/admin");
    return { success: true, message: `Usuário ${email} criado com perfil ${role}.` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao criar usuário.";
    console.error("[admin/createUserWithPassword]", err);
    return { success: false, message: "Falha ao criar usuário.", error: msg };
  }
}

export async function toggleUserAccess(formData: FormData): Promise<ActionResult> {
  const authError = await checkCallerIsAdmin();
  if (authError) return { success: false, message: authError };

  const userId = String(formData.get("userId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  if (!userId) return { success: false, message: "Usuário inválido." };

  try {
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!target) return { success: false, message: "Usuário não encontrado." };

    if (isPrimaryAdmin(target.email) && !active) {
      return { success: false, message: "O admin principal não pode ser desativado." };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { active },
    });

    if (active && target.email) {
      notifyAccessApproved(target.email);
    }

    revalidatePath("/admin");
    return {
      success: true,
      message: `Usuário ${target.email} ${active ? "ativado" : "bloqueado"}.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao alterar acesso.";
    console.error("[admin/toggleUserAccess]", err);
    return { success: false, message: "Falha ao alterar acesso.", error: msg };
  }
}

export async function changeUserRole(formData: FormData): Promise<ActionResult> {
  const authError = await checkCallerIsAdmin();
  if (authError) return { success: false, message: authError };

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");

  if (!userId) return { success: false, message: "Usuário inválido." };
  if (role !== "VIEWER" && role !== "ADMIN") return { success: false, message: "Perfil inválido." };

  try {
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!target) return { success: false, message: "Usuário não encontrado." };

    if (isPrimaryAdmin(target.email) && role !== "ADMIN") {
      return { success: false, message: "O admin principal deve manter perfil ADMIN." };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    revalidatePath("/admin");
    return { success: true, message: `Perfil de ${target.email} alterado para ${role}.` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao alterar perfil.";
    console.error("[admin/changeUserRole]", err);
    return { success: false, message: "Falha ao alterar perfil.", error: msg };
  }
}

/**
 * Admin reseta a senha de outro usuário.
 *
 * mode="link"      → gera link de recovery (recomendado, senha nunca trafega)
 * mode="temporary" → admin define senha temporária e envia por email
 *
 * Usa supabaseAdmin (service_role) para poder gerar links e atualizar
 * senhas de outros usuários sem depender da sessão do admin.
 */
export async function adminResetUserPassword(formData: FormData): Promise<ActionResult> {
  const authError = await checkCallerIsAdmin();
  if (authError) return { success: false, message: authError };

  const userId = String(formData.get("userId") ?? "");
  const mode = String(formData.get("mode") ?? "link") as "link" | "temporary";
  const newPassword = String(formData.get("newPassword") ?? "");

  if (!userId) return { success: false, message: "Usuário inválido." };
  if (mode !== "link" && mode !== "temporary") return { success: false, message: "Modo de reset inválido." };
  if (mode === "temporary") {
    const pwdCheck = validateStrongPassword(newPassword);
    if (!pwdCheck.ok) return { success: false, message: pwdCheck.reason };
  }

  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user: caller } } = await supabase.auth.getUser();

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!target) return { success: false, message: "Usuário não encontrado." };

    const supabaseAdmin = createAdminClient();
    const adminEmail = caller?.email;
    const isSelfReset = adminEmail?.toLowerCase() === target.email.toLowerCase();

    if (isPrimaryAdmin(target.email) && !isSelfReset) {
      return {
        success: false,
        message: "O admin principal não pode ter a senha resetada por outro admin. Use o botão Reset na sua própria linha.",
      };
    }

    if (isSelfReset && mode === "temporary") {
      return {
        success: false,
        message: "Para redefinir sua própria senha, use o modo 'Enviar link' — mais seguro.",
      };
    }

    if (mode === "link") {
      // Verifica se o usuário existe no Supabase Auth antes de gerar o link
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const supabaseUser = listData?.users?.find(
        (u) => u.email?.toLowerCase() === target.email.toLowerCase(),
      );

      if (!supabaseUser) {
        return {
          success: false,
          message: `Usuário ${target.email} não encontrado no Supabase Auth. Use o modo 'Senha temporária' para criar o acesso primeiro.`,
        };
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://bob.qaplay.com.br";
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: target.email,
        options: {
          // redirectTo aponta para /auth/callback que detecta type=recovery
          // e redireciona para /conta?forced=1
          redirectTo: `${appUrl}/auth/callback?type=recovery`,
        },
      });

      if (error || !data?.properties?.action_link) {
        return {
          success: false,
          message: `Falha ao gerar link de reset: ${error?.message ?? "link ausente"}. Tente o modo 'Senha temporária'.`,
        };
      }

      await prisma.user.update({
        where: { id: userId },
        data: { mustChangePassword: true },
      });

      sendPasswordResetLinkEmail({
        to: target.email,
        resetLink: data.properties.action_link,
        adminEmail,
      })
        .then((result) => {
          if (!result.ok && !("skipped" in result)) {
            console.warn(`[admin] Falha ao enviar email de reset (link) para ${target.email}: ${result.error}`);
          }
        })
        .catch((err) => console.warn("[admin] Erro no email de reset (link):", err));

      revalidatePath("/admin");
      return { success: true, message: `Link de reset enviado para ${target.email}.` };

    } else {
      // Modo temporário: admin define senha via service_role
      const { data: list } = await supabaseAdmin.auth.admin.listUsers();
      const supabaseUser = list.users.find(
        (u) => u.email?.toLowerCase() === target.email.toLowerCase(),
      );

      if (!supabaseUser) {
        const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: target.email,
          password: newPassword,
          email_confirm: true,
        });
        if (createErr) {
          return { success: false, message: `Falha ao criar usuário no Supabase: ${createErr.message}` };
        }
      } else {
        const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
          supabaseUser.id,
          { password: newPassword, email_confirm: true },
        );
        if (updateErr) {
          return { success: false, message: `Falha ao atualizar senha: ${updateErr.message}` };
        }
      }

      await prisma.user.update({
        where: { id: userId },
        data: { mustChangePassword: true },
      });

      sendPasswordResetByAdminEmail({
        to: target.email,
        temporaryPassword: newPassword,
        adminEmail,
      })
        .then((result) => {
          if (!result.ok && !("skipped" in result)) {
            console.warn(`[admin] Falha ao enviar email de reset (senha) para ${target.email}: ${result.error}`);
          }
        })
        .catch((err) => console.warn("[admin] Erro no email de reset (senha):", err));

      revalidatePath("/admin");
      return { success: true, message: `Senha temporária definida e enviada para ${target.email}.` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao resetar senha.";
    console.error("[admin/adminResetUserPassword]", err);
    return { success: false, message: "Falha ao resetar senha.", error: msg };
  }
}

/**
 * Admin remove completamente um usuário (Supabase Auth + DB).
 * Bloqueado contra deletar admin principal e contra auto-delete.
 */
export async function adminDeleteUser(formData: FormData): Promise<ActionResult> {
  const authError = await checkCallerIsAdmin();
  if (authError) return { success: false, message: authError };

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { success: false, message: "Usuário inválido." };

  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user: caller } } = await supabase.auth.getUser();

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!target) return { success: false, message: "Usuário não encontrado." };

    if (isPrimaryAdmin(target.email)) {
      return { success: false, message: "O admin principal não pode ser deletado." };
    }

    if (caller?.email?.toLowerCase() === target.email.toLowerCase()) {
      return { success: false, message: "Você não pode deletar sua própria conta." };
    }

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

    await prisma.user.delete({ where: { id: userId } });

    revalidatePath("/admin");
    return { success: true, message: `Usuário ${target.email} deletado.` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao deletar usuário.";
    console.error("[admin/adminDeleteUser]", err);
    return { success: false, message: "Falha ao deletar usuário.", error: msg };
  }
}

/**
 * Endpoint público: dispara email de recovery para o usuário via Supabase Admin API.
 * Usa generateLink (service_role) para criar o link e nosso template de email.
 * Retorna sempre { success: true } na UI por motivo de segurança (anti-enumeration).
 */
export async function requestPasswordReset(formData: FormData): Promise<ActionResult> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));

  if (!email || !email.includes("@")) {
    return { success: false, message: "E-mail inválido." };
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { email },
      select: { active: true },
    });

    if (!dbUser?.active) {
      console.warn(`[auth] Reset solicitado para email não-whitelisted/inativo: ${email}`);
      // Retorna success para não revelar se o email existe
      return { success: true, message: "Se o email estiver cadastrado, você receberá as instruções em breve." };
    }

    const supabaseAdmin = createAdminClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://bob.qaplay.com.br";

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${appUrl}/auth/callback?type=recovery`,
      },
    });

    if (error || !data?.properties?.action_link) {
      console.warn(`[auth] Falha ao gerar link de recovery para ${email}:`, error?.message);
      return { success: true, message: "Se o email estiver cadastrado, você receberá as instruções em breve." };
    }

    sendPasswordRecoveryLinkEmail({
      to: email,
      recoveryLink: data.properties.action_link,
    })
      .then((result) => {
        if (!result.ok && !("skipped" in result)) {
          console.warn(`[auth] Falha ao enviar email de recovery para ${email}: ${result.error}`);
        }
      })
      .catch((err) => console.warn("[auth] Erro inesperado no email de recovery:", err));

    return { success: true, message: "Se o email estiver cadastrado, você receberá as instruções em breve." };
  } catch (err) {
    console.error("[auth/requestPasswordReset]", err);
    // Não revela detalhes ao usuário — retorna ok
    return { success: true, message: "Se o email estiver cadastrado, você receberá as instruções em breve." };
  }
}
