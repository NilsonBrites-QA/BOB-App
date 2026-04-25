import { prisma } from "@/lib/db";

const PRIMARY_ADMIN_EMAIL = "nilson.brites@gmail.com";

export async function ensurePrimaryAdminAccess(email: string) {
  if (email !== PRIMARY_ADMIN_EMAIL) {
    return;
  }

  await prisma.$executeRaw`
    insert into users (email, role, active)
    values (${PRIMARY_ADMIN_EMAIL}, cast('ADMIN' as user_role), true)
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
    where email = ${email}
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
    values (${email}, cast('VIEWER' as user_role), false)
    on conflict (email) do nothing
  `;
}