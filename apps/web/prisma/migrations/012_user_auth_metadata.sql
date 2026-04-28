-- ─── 012: User Auth Metadata ───────────────────────────────────────────────
--
-- Adiciona metadados de autenticação na tabela `users`:
--   1. must_change_password — quando admin reseta senha, força user a trocar
--      no próximo login (UX padrão de reset corporativo)
--   2. last_sign_in_at — sincronizado a partir do Supabase Auth no /auth/confirm.
--      Permite UI mostrar "ativo / nunca logou / X dias atrás".
--
-- Backfill: ambas as colunas são nullable, defaults seguros.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_sign_in_at      TIMESTAMP(3);

-- Índice para listagens admin que ordenam por último login
CREATE INDEX IF NOT EXISTS idx_users_last_sign_in_at
  ON users (last_sign_in_at DESC NULLS LAST);

COMMIT;
