import { prisma } from "@/lib/db";
import { isPrimaryAdmin } from "@/lib/auth/config";

/**
 * Garante que admins primários (definidos em lib/auth/config.ts) tenham
 * sempre role=ADMIN e active=true. Idempotente. Chamada em /auth/confirm
 * a cada login do usuário primário, então nunca há risco de "perder admin".
 */
export async function ensurePrimaryAdminAccess(email: string) {
  if (!isPrimaryAdmin(email)) {
    return;
  }

  const normalized = email.trim().toLowerCase();

  await prisma.$executeRaw`
    insert into users (email, role, active)
    values (${normalized}, cast('ADMIN' as user_role), true)
    on conflict (email)
    do update set
      role = cast('ADMIN' as user_role),
      active = true,
      updated_at = now()
  `;
}

export async function isWhitelisted(email: string) {
  const rows = await prisma.$queryRaw<Array<{ active: boolean }>>`
    select active
    from users
    where email = ${email.trim().toLowerCase()}
    limit 1
  `;

  return rows[0]?.active === true;
}

/**
 * Registra um email que tentou autenticar mas não estava whitelisted.
 * Cria um registro em `users` com active=false e role=VIEWER.
 * Aparece no painel admin como "solicitação pendente" para o admin aprovar.
 *
 * Idempotente: se o email já existe, não faz nada (preserva role/active atuais).
 */
export async function registerPendingAccessRequest(email: string) {
  await prisma.$executeRaw`
    insert into users (email, role, active)
    values (${email.trim().toLowerCase()}, cast('VIEWER' as user_role), false)
    on conflict (email) do nothing
  `;
}

/**
 * Atualiza o timestamp de último login. Chamado em /auth/confirm após
 * autenticação bem-sucedida. Não-bloqueante: falha silenciosa não atrapalha
 * o login (apenas perde a métrica daquele acesso).
 */
export async function recordSuccessfulLogin(email: string) {
  try {
    await prisma.$executeRaw`
      update users
      set last_sign_in_at = now()
      where email = ${email.trim().toLowerCase()}
    `;
  } catch (err) {
    console.warn("[auth] Falha ao registrar last_sign_in_at:", err);
  }
}