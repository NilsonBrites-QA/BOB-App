-- ─── 011: Round Versioning + Freeze ──────────────────────────────────────────
--
-- Habilita o congelamento de rodadas após entrega (DELIVERED) e mantém histórico
-- de versões quando o admin regenera. Resolve a "sensação" de que as variações
-- mudam sozinhas — a partir desta migration, toda variação entregue é IMUTÁVEL.
--
-- Mudanças:
--   1. Novo valor `SUPERSEDED` no enum `round_status`
--   2. Colunas em `rounds`: frozen_at, version, previous_round_id, superseded_at
--   3. Remove constraint unique (season_id, number) — agora múltiplas versões
--      podem coexistir; a unicidade é garantida em código (apenas uma rodada
--      ativa = não-SUPERSEDED por par season+number)
--   4. Cria índice simples e FK auto-referencial

BEGIN;

-- 1. Novo valor no enum (Postgres permite com qualquer ordem; vai pro fim)
ALTER TYPE round_status ADD VALUE IF NOT EXISTS 'SUPERSEDED';

-- 2. Colunas novas (todas nullable / com default — backfill seguro)
ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS frozen_at         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS version           INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS previous_round_id UUID,
  ADD COLUMN IF NOT EXISTS superseded_at     TIMESTAMP(3);

-- 3. FK auto-referencial (uma versão aponta pra anterior). ON DELETE SET NULL
--    evita perda de cadeia quando uma versão antiga é purgada.
ALTER TABLE rounds
  ADD CONSTRAINT rounds_previous_round_id_fkey
  FOREIGN KEY (previous_round_id)
  REFERENCES rounds(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Substitui unique (season_id, number) por índice simples
--    (lógica de unicidade ativa fica no código)
ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_season_id_number_key;
CREATE INDEX IF NOT EXISTS rounds_season_id_number_idx
  ON rounds(season_id, number);

-- 5. Backfill: rodadas existentes em DELIVERED já são consideradas frozen
UPDATE rounds
   SET frozen_at = COALESCE(frozen_at, delivered_at, updated_at)
 WHERE status = 'DELIVERED'
   AND frozen_at IS NULL;

COMMIT;
