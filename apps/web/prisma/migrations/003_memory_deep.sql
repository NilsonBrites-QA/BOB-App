-- ─────────────────────────────────────────────────────────────────────────────
-- BOB — Migration 003: Memória Profunda + ABQC
--
-- Execute no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/zravuslhqluaxjuakecp/sql/new
--
-- Cria:
--   1. Tabela factor_weights  — snapshot dos pesos do motor por rodada
--   2. Tabela conditional_patterns — padrões de combinação de fatores
--
-- pgvector é opcional nesta migration (conditional_patterns usa vector se disponível)
-- Se pgvector não estiver ativo, a coluna embedding fica como TEXT.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Ativar pgvector (se disponível no plano Supabase)
--    Comentar esta linha se o plano não suportar.
-- CREATE EXTENSION IF NOT EXISTS vector;

-- ─── factor_weights ───────────────────────────────────────────────────────────
-- Armazena o snapshot de pesos do motor após cada calibração.
-- Uma linha por rodada calibrada.

CREATE TABLE IF NOT EXISTS factor_weights (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  season          INT         NOT NULL,
  round           INT         NOT NULL,
  -- Pesos dos 10 fatores (0–100, somam 100)
  table_context   NUMERIC(5,2) NOT NULL DEFAULT 14,
  recent_form     NUMERIC(5,2) NOT NULL DEFAULT 10,
  momentum        NUMERIC(5,2) NOT NULL DEFAULT 7,
  home_away       NUMERIC(5,2) NOT NULL DEFAULT 11,
  goals_xg        NUMERIC(5,2) NOT NULL DEFAULT 16,
  h2h             NUMERIC(5,2) NOT NULL DEFAULT 8,
  absences        NUMERIC(5,2) NOT NULL DEFAULT 14,
  calendar        NUMERIC(5,2) NOT NULL DEFAULT 8,
  market          NUMERIC(5,2) NOT NULL DEFAULT 9,
  motivation      NUMERIC(5,2) NOT NULL DEFAULT 3,
  -- Metadados da calibração
  overall_accuracy  NUMERIC(5,4), -- acurácia geral da rodada (0–1)
  anchor_accuracy   NUMERIC(5,4), -- acurácia dos picks âncora (0–1)
  samples           INT,          -- quantidade de picks com resultado registrado
  calibration_notes TEXT,         -- resumo textual do ajuste
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (season, round)
);

-- Índice para consulta temporal
CREATE INDEX IF NOT EXISTS idx_factor_weights_season_round
  ON factor_weights (season, round DESC);

-- ─── conditional_patterns ────────────────────────────────────────────────────
-- Padrões emergentes de combinações de fatores que sistematicamente acertam
-- ou erram. Usado pelo ABQC para descoberta de anti-correlações.

CREATE TABLE IF NOT EXISTS conditional_patterns (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identificação do padrão
  pattern_key     TEXT        NOT NULL UNIQUE, -- hash determinístico da combinação
  factors         TEXT[]      NOT NULL,         -- fatores envolvidos
  condition       TEXT        NOT NULL,         -- descrição legível do padrão
  -- Estatísticas
  occurrences     INT         NOT NULL DEFAULT 0,
  correct         INT         NOT NULL DEFAULT 0,
  accuracy        NUMERIC(5,4) GENERATED ALWAYS AS (
    CASE WHEN occurrences > 0 THEN correct::NUMERIC / occurrences ELSE 0 END
  ) STORED,
  -- Sinalizadores
  is_anti_corr    BOOLEAN     NOT NULL DEFAULT FALSE, -- padrão anti-correlacionado?
  is_suppressed   BOOLEAN     NOT NULL DEFAULT FALSE, -- desativado manualmente?
  last_seen_round INT,
  last_seen_season INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice por acurácia (para ranking de padrões mais confiáveis)
CREATE INDEX IF NOT EXISTS idx_conditional_patterns_accuracy
  ON conditional_patterns (accuracy DESC, occurrences DESC);

-- Índice por fatores (busca por combinação específica)
CREATE INDEX IF NOT EXISTS idx_conditional_patterns_factors
  ON conditional_patterns USING GIN (factors);

-- Trigger: atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION update_conditional_patterns_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conditional_patterns_updated_at ON conditional_patterns;
CREATE TRIGGER trg_conditional_patterns_updated_at
  BEFORE UPDATE ON conditional_patterns
  FOR EACH ROW EXECUTE FUNCTION update_conditional_patterns_updated_at();
