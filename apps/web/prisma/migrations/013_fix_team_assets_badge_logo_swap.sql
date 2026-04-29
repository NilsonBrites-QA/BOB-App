-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 013: Fix team_assets badge_url / logo_url swap
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Contexto:
--   A migration 008 definiu os campos com semântica invertida em relação ao
--   que o frontend e o código Prisma esperam:
--
--   Convenção ORIGINAL (008):
--     logo_url  = strTeamBadge  (escudo redondo — o que o UI precisa)
--     badge_url = strTeamLogo   (logotipo tipográfico — geralmente null)
--
--   Convenção CORRETA (esperada pelo frontend via Prisma):
--     badge_url = strTeamBadge  (escudo redondo — exibido no UI)
--     logo_url  = strTeamLogo   (logotipo tipográfico)
--
--   Todos os registros existentes foram gravados com a convenção antiga.
--   O código em persistTeamAsset() foi corrigido (PR anterior), mas o banco
--   ainda tem os dados invertidos. Esta migration faz o backfill atômico.
--
-- Estratégia:
--   Swap em uma única transação usando coluna temporária para evitar conflito.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Adiciona coluna temporária para o swap seguro
ALTER TABLE team_assets ADD COLUMN IF NOT EXISTS _swap_tmp TEXT;

-- Copia badge_url (atualmente contém strTeamLogo) para temp
UPDATE team_assets SET _swap_tmp = badge_url;

-- badge_url recebe logo_url (que contém strTeamBadge — escudo real)
UPDATE team_assets SET badge_url = logo_url;

-- logo_url recebe o valor original de badge_url (strTeamLogo)
UPDATE team_assets SET logo_url = _swap_tmp;

-- Remove coluna temporária
ALTER TABLE team_assets DROP COLUMN IF EXISTS _swap_tmp;

-- Corrige comentários das colunas para refletir a semântica correta
COMMENT ON COLUMN team_assets.badge_url IS 'strTeamBadge: escudo/crest principal do time (PNG redondo — exibido no UI).';
COMMENT ON COLUMN team_assets.logo_url  IS 'strTeamLogo: logotipo tipográfico alternativo (geralmente null).';

COMMIT;
