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