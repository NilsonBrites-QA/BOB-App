/**
 * Configuração central de autenticação.
 *
 * Antes desta refatoração, o email do admin principal estava hardcoded em
 * 4 arquivos diferentes (whitelist.ts, /auth/confirm/route.ts, /auth/callback/route.ts,
 * access-actions.ts). Mudar admin = mexer em código. Pior: um typo em um lugar
 * deixava bugs sutis.
 *
 * Agora: ÚNICA fonte da verdade. Suporta múltiplos admins primários (recomendado:
 * sempre ter pelo menos 2 — você + um backup, pra nunca ficar sem acesso).
 *
 * Como adicionar/remover admin primário: edite a constante abaixo e faça redeploy.
 * Admins primários são auto-promovidos a ADMIN+ativo no primeiro login.
 */

export const PRIMARY_ADMIN_EMAILS: ReadonlyArray<string> = [
  "nilson.brites@gmail.com",
  // Adicione um backup admin aqui:
  // "backup@example.com",
];

/**
 * Verifica se o email é admin primário (auto-promoção no login).
 * Sempre normaliza para lowercase antes de comparar.
 */
export function isPrimaryAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return PRIMARY_ADMIN_EMAILS.includes(normalized);
}
