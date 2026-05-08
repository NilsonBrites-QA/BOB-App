-- =============================================================================
-- MIGRATIONS PENDENTES: 004 → 013
-- Aplicar no Supabase SQL Editor:
-- https://supabase.com/dashboard/project/zravuslhqluakecp/sql/new
--
-- Última migration confirmada aplicada: 003
-- Execute este arquivo completo de uma vez.
-- Todas as operações são idempotentes (IF NOT EXISTS / IF EXISTS).
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 004: Push Subscription
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "push_subscription" TEXT;


-- ─────────────────────────────────────────────────────────────────────────────
-- 005: Simulation Results
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS simulation_results (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  season               INT         NOT NULL,
  round                INT         NOT NULL,
  anchor_count         INT         NOT NULL DEFAULT 0,
  anchors_correct      INT         NOT NULL DEFAULT 0,
  total_picks          INT         NOT NULL DEFAULT 0,
  correct_picks        INT         NOT NULL DEFAULT 0,
  variations_json      JSONB       NOT NULL DEFAULT '[]',
  best_odd_projected   NUMERIC(12,2),
  best_odd_real        NUMERIC(12,2),
  calibrated           BOOLEAN     NOT NULL DEFAULT FALSE,
  simulated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes                TEXT,
  UNIQUE (season, round)
);

CREATE INDEX IF NOT EXISTS idx_simulation_results_season_round
  ON simulation_results (season, round);


-- ─────────────────────────────────────────────────────────────────────────────
-- 006: Chat Messages
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL,
  role        TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT        NOT NULL,
  model       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created
  ON chat_messages (user_id, created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- 007: Criar Aposta — Enums + Tabelas
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'bet_match_status' AND n.nspname = 'public') THEN
    CREATE TYPE "public"."bet_match_status" AS ENUM ('SCHEDULED','LIVE','FINISHED','POSTPONED','CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'bet_market' AND n.nspname = 'public') THEN
    CREATE TYPE "public"."bet_market" AS ENUM ('RESULT_1X2','BTTS','OVER_UNDER','EXACT_SCORE','DOUBLE_CHANCE','ASIAN_HANDICAP','FIRST_HALF_GOALS','CORNERS','CARDS');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'bet_ticket_status' AND n.nspname = 'public') THEN
    CREATE TYPE "public"."bet_ticket_status" AS ENUM ('DRAFT','PLACED','WON','LOST','VOID');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'bet_selection_result' AND n.nspname = 'public') THEN
    CREATE TYPE "public"."bet_selection_result" AS ENUM ('WON','LOST','VOID');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'bettor_profile' AND n.nspname = 'public') THEN
    CREATE TYPE "public"."bettor_profile" AS ENUM ('CONSERVADOR','MODERADO','AGRESSIVO','MATEMATICO');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "public"."bet_matches" (
  "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
  "external_id"    TEXT        NOT NULL,
  "home_team"      TEXT        NOT NULL,
  "away_team"      TEXT        NOT NULL,
  "home_crest"     TEXT,
  "away_crest"     TEXT,
  "competition"    TEXT        NOT NULL,
  "season"         INTEGER     NOT NULL,
  "round"          INTEGER,
  "scheduled_at"   TIMESTAMPTZ NOT NULL,
  "status"         "bet_match_status" NOT NULL DEFAULT 'SCHEDULED',
  "home_score"     INTEGER,
  "away_score"     INTEGER,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "bet_matches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bet_matches_external_id_key" UNIQUE ("external_id")
);

CREATE INDEX IF NOT EXISTS "bet_matches_competition_season_idx"
  ON "public"."bet_matches" ("competition", "season", "scheduled_at");

CREATE TABLE IF NOT EXISTS "public"."bet_odds" (
  "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
  "match_id"     UUID        NOT NULL,
  "market"       "bet_market" NOT NULL,
  "option"       TEXT        NOT NULL,
  "option_label" TEXT        NOT NULL,
  "odd"          DOUBLE PRECISION NOT NULL,
  "is_active"    BOOLEAN     NOT NULL DEFAULT TRUE,
  "source"       TEXT,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "bet_odds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bet_odds_match_market_option_key" UNIQUE ("match_id", "market", "option"),
  CONSTRAINT "bet_odds_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."bet_matches" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."bet_tickets" (
  "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
  "user_id"          UUID        NOT NULL,
  "status"           "bet_ticket_status" NOT NULL DEFAULT 'DRAFT',
  "stake"            NUMERIC(10, 2),
  "total_odds"       DOUBLE PRECISION,
  "potential_return" NUMERIC(12, 2),
  "notes"            TEXT,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "bet_tickets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "bet_tickets_user_id_idx"
  ON "public"."bet_tickets" ("user_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "public"."bet_selections" (
  "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
  "ticket_id"    UUID        NOT NULL,
  "match_id"     UUID        NOT NULL,
  "market"       "bet_market" NOT NULL,
  "option"       TEXT        NOT NULL,
  "option_label" TEXT        NOT NULL,
  "odd"          DOUBLE PRECISION NOT NULL,
  "result"       "bet_selection_result",
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "bet_selections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bet_selections_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."bet_tickets" ("id") ON DELETE CASCADE,
  CONSTRAINT "bet_selections_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."bet_matches" ("id")
);

CREATE TABLE IF NOT EXISTS "public"."bob_suggestions" (
  "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
  "match_id"     UUID        NOT NULL,
  "profile"      "bettor_profile" NOT NULL,
  "market"       "bet_market" NOT NULL,
  "option"       TEXT        NOT NULL,
  "option_label" TEXT        NOT NULL,
  "odd"          DOUBLE PRECISION NOT NULL,
  "confidence"   DOUBLE PRECISION NOT NULL,
  "justification" TEXT       NOT NULL,
  "is_active"    BOOLEAN     NOT NULL DEFAULT TRUE,
  "result"       "bet_selection_result",
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "bob_suggestions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bob_suggestions_match_profile_key" UNIQUE ("match_id", "profile", "market"),
  CONSTRAINT "bob_suggestions_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."bet_matches" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "bob_suggestions_match_id_idx"
  ON "public"."bob_suggestions" ("match_id");


-- ─────────────────────────────────────────────────────────────────────────────
-- 008a: Bet Analyzer (bet_profiles, match_analysis, market_suggestions, created_bets)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bet_profiles (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  min_odd DECIMAL(4,2) NOT NULL DEFAULT 1.20,
  max_odd DECIMAL(4,2) NOT NULL DEFAULT 1.70,
  risk_level VARCHAR(20) NOT NULL,
  strategy TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_analysis (
  id SERIAL PRIMARY KEY,
  match_id VARCHAR(100) NOT NULL,
  season INTEGER NOT NULL,
  round INTEGER NOT NULL,
  home_team VARCHAR(100) NOT NULL,
  away_team VARCHAR(100) NOT NULL,
  scheduled_at TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  home_win_probability DECIMAL(5,4),
  draw_probability DECIMAL(5,4),
  away_win_probability DECIMAL(5,4),
  btts_yes_probability DECIMAL(5,4),
  over_25_probability DECIMAL(5,4),
  raw_data JSONB,
  analysis_factors JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  analyzed_at TIMESTAMP,
  UNIQUE(match_id, season)
);

CREATE TABLE IF NOT EXISTS market_suggestions (
  id SERIAL PRIMARY KEY,
  match_analysis_id INTEGER REFERENCES match_analysis(id) ON DELETE CASCADE,
  profile_id INTEGER REFERENCES bet_profiles(id) ON DELETE CASCADE,
  market VARCHAR(50) NOT NULL,
  selection VARCHAR(50) NOT NULL,
  selection_label VARCHAR(100),
  suggested_odd DECIMAL(6,3) NOT NULL,
  implied_probability DECIMAL(5,4) NOT NULL,
  calculated_probability DECIMAL(5,4) NOT NULL,
  expected_value DECIMAL(5,4),
  confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100),
  quality_rating VARCHAR(10),
  ai_justification TEXT,
  ai_factors JSONB,
  is_recommended BOOLEAN DEFAULT false,
  is_primary_pick BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(match_analysis_id, profile_id, market, selection)
);

CREATE TABLE IF NOT EXISTS created_bets (
  id SERIAL PRIMARY KEY,
  match_analysis_id INTEGER REFERENCES match_analysis(id) ON DELETE CASCADE,
  profile_id INTEGER REFERENCES bet_profiles(id) ON DELETE CASCADE,
  bet_type VARCHAR(50) NOT NULL,
  name VARCHAR(200),
  suggestion_ids INTEGER[],
  total_odd DECIMAL(8,3) NOT NULL,
  target_odd DECIMAL(6,3),
  combined_probability DECIMAL(5,4),
  expected_value DECIMAL(5,4),
  confidence_level INTEGER CHECK (confidence_level >= 0 AND confidence_level <= 100),
  full_justification TEXT,
  risk_assessment TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  result VARCHAR(20),
  profit_loss DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT NOW(),
  resulted_at TIMESTAMP,
  UNIQUE(match_analysis_id, profile_id, bet_type, suggestion_ids)
);

CREATE INDEX IF NOT EXISTS idx_match_analysis_match_id ON match_analysis(match_id);
CREATE INDEX IF NOT EXISTS idx_match_analysis_season_round ON match_analysis(season, round);
CREATE INDEX IF NOT EXISTS idx_match_analysis_status ON match_analysis(status);
CREATE INDEX IF NOT EXISTS idx_market_suggestions_analysis_id ON market_suggestions(match_analysis_id);
CREATE INDEX IF NOT EXISTS idx_market_suggestions_profile_id ON market_suggestions(profile_id);
CREATE INDEX IF NOT EXISTS idx_market_suggestions_recommended ON market_suggestions(is_recommended) WHERE is_recommended = true;
CREATE INDEX IF NOT EXISTS idx_created_bets_analysis_id ON created_bets(match_analysis_id);
CREATE INDEX IF NOT EXISTS idx_created_bets_profile_id ON created_bets(profile_id);

-- Inserir perfis padrão (somente se ainda não existirem)
INSERT INTO bet_profiles (slug, name, description, min_odd, max_odd, risk_level, strategy)
SELECT 'conservador', 'Conservador', 'Maximizar probabilidade de ganho com retornos menores.', 1.20, 1.70, 'baixo', 'Seleciona mercados com alta probabilidade de acerto.'
WHERE NOT EXISTS (SELECT 1 FROM bet_profiles WHERE slug = 'conservador');

INSERT INTO bet_profiles (slug, name, description, min_odd, max_odd, risk_level, strategy)
SELECT 'moderado', 'Moderado', 'Balancear risco e retorno.', 1.75, 4.50, 'medio', 'Combina mercados com probabilidade média-alta.'
WHERE NOT EXISTS (SELECT 1 FROM bet_profiles WHERE slug = 'moderado');

INSERT INTO bet_profiles (slug, name, description, min_odd, max_odd, risk_level, strategy)
SELECT 'agressivo', 'Agressivo', 'Potencializar ganhos aceitando maior risco.', 3.00, 15.00, 'alto', 'Seleciona mercados com odds altas.'
WHERE NOT EXISTS (SELECT 1 FROM bet_profiles WHERE slug = 'agressivo');

INSERT INTO bet_profiles (slug, name, description, min_odd, max_odd, risk_level, strategy)
SELECT 'matematico', 'Matemático/Sistema', 'Maximizar valor esperado (EV).', 1.50, 20.00, 'extremo', 'Identifica apostas onde probabilidade real supera odds (EV positivo).'
WHERE NOT EXISTS (SELECT 1 FROM bet_profiles WHERE slug = 'matematico');

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_bet_profiles_updated_at ON bet_profiles;
CREATE TRIGGER update_bet_profiles_updated_at BEFORE UPDATE ON bet_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_market_suggestions_updated_at ON market_suggestions;
CREATE TRIGGER update_market_suggestions_updated_at BEFORE UPDATE ON market_suggestions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ─────────────────────────────────────────────────────────────────────────────
-- 008b: Team Assets + API Sync Log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_assets (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tsdb_id          TEXT        NOT NULL UNIQUE,
  name             TEXT        NOT NULL,
  short_name       TEXT,
  logo_url         TEXT,
  badge_url        TEXT,
  banner_url       TEXT,
  stadium_name     TEXT,
  stadium_thumb    TEXT,
  country          TEXT,
  football_data_id INTEGER,
  api_football_id  INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_sync_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source       TEXT        NOT NULL CHECK (source IN ('thesportsdb', 'football-data', 'api-football', 'oddspapi')),
  cache_key    TEXT        NOT NULL,
  window_label TEXT        CHECK (window_label IN ('T-48h', 'T-24h', 'T-1h') OR window_label IS NULL),
  kickoff_at   TIMESTAMPTZ,
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_code  SMALLINT,
  record_count INTEGER,
  notes        TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_sync_log_lookup
  ON api_sync_log (source, cache_key, window_label, synced_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_sync_log_source_time
  ON api_sync_log (source, synced_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- 009: pgvector Embedding
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE conditional_patterns
  ADD COLUMN IF NOT EXISTS embedding vector(1536);


-- ─────────────────────────────────────────────────────────────────────────────
-- 010: Variation Judgements
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS variation_judgements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season      INTEGER NOT NULL,
  round       INTEGER NOT NULL,
  payload     JSONB NOT NULL,
  provider    TEXT NOT NULL,
  tokens_in   INTEGER,
  tokens_out  INTEGER,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT variation_judgements_season_round_unique UNIQUE (season, round)
);

CREATE INDEX IF NOT EXISTS variation_judgements_season_round_idx
  ON variation_judgements (season, round);

CREATE OR REPLACE FUNCTION update_variation_judgements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS variation_judgements_updated_at_trigger ON variation_judgements;
CREATE TRIGGER variation_judgements_updated_at_trigger
  BEFORE UPDATE ON variation_judgements
  FOR EACH ROW
  EXECUTE FUNCTION update_variation_judgements_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- 011: Round Versioning + Freeze  ← CRÍTICO: desbloqueia admin 500
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE round_status ADD VALUE IF NOT EXISTS 'SUPERSEDED';

ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS frozen_at         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS version           INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS previous_round_id UUID,
  ADD COLUMN IF NOT EXISTS superseded_at     TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'rounds_previous_round_id_fkey'
      AND table_name = 'rounds'
  ) THEN
    ALTER TABLE rounds
      ADD CONSTRAINT rounds_previous_round_id_fkey
      FOREIGN KEY (previous_round_id)
      REFERENCES rounds(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_season_id_number_key;

CREATE INDEX IF NOT EXISTS rounds_season_id_number_idx
  ON rounds(season_id, number);

UPDATE rounds
   SET frozen_at = COALESCE(frozen_at, delivered_at, updated_at)
 WHERE status = 'DELIVERED'
   AND frozen_at IS NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 012: User Auth Metadata
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_sign_in_at      TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS idx_users_last_sign_in_at
  ON users (last_sign_in_at DESC NULLS LAST);


-- ─────────────────────────────────────────────────────────────────────────────
-- 013: Fix team_assets badge_url / logo_url swap
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE team_assets ADD COLUMN IF NOT EXISTS _swap_tmp TEXT;
UPDATE team_assets SET _swap_tmp = badge_url;
UPDATE team_assets SET badge_url = logo_url;
UPDATE team_assets SET logo_url = _swap_tmp;
ALTER TABLE team_assets DROP COLUMN IF EXISTS _swap_tmp;

COMMENT ON COLUMN team_assets.badge_url IS 'strTeamBadge: escudo/crest principal do time (PNG redondo — exibido no UI).';
COMMENT ON COLUMN team_assets.logo_url  IS 'strTeamLogo: logotipo tipográfico alternativo (geralmente null).';
