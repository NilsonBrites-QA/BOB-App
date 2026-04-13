-- =============================================================================
-- Migration 007: Feature "Criar Aposta"
-- Tabelas: bet_matches, bet_odds, bet_tickets, bet_selections, bob_suggestions
-- Executar no SQL Editor do Supabase após fazer `prisma generate`
-- =============================================================================

-- ─── Enums ────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'bet_match_status'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."bet_match_status" AS ENUM (
      'SCHEDULED',
      'LIVE',
      'FINISHED',
      'POSTPONED',
      'CANCELLED'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'bet_market'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."bet_market" AS ENUM (
      'RESULT_1X2',
      'BTTS',
      'OVER_UNDER',
      'EXACT_SCORE',
      'DOUBLE_CHANCE',
      'ASIAN_HANDICAP',
      'FIRST_HALF_GOALS',
      'CORNERS',
      'CARDS'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'bet_ticket_status'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."bet_ticket_status" AS ENUM (
      'DRAFT',
      'PLACED',
      'WON',
      'LOST',
      'VOID'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'bet_selection_result'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."bet_selection_result" AS ENUM (
      'WON',
      'LOST',
      'VOID'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'bettor_profile'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."bettor_profile" AS ENUM (
      'CONSERVADOR',
      'MODERADO',
      'AGRESSIVO',
      'MATEMATICO'
    );
  END IF;
END$$;

-- ─── Partidas (importadas de football-data.org / OddsPapi) ───────────────────

CREATE TABLE IF NOT EXISTS "public"."bet_matches" (
  "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
  "external_id"    TEXT        NOT NULL,
  "home_team"      TEXT        NOT NULL,
  "away_team"      TEXT        NOT NULL,
  "home_crest"     TEXT,
  "away_crest"     TEXT,
  "competition"    TEXT        NOT NULL, -- 'Serie A' | 'Serie B'
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

-- ─── Odds por mercado por partida ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "public"."bet_odds" (
  "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
  "match_id"     UUID        NOT NULL,
  "market"       "bet_market" NOT NULL,
  "option"       TEXT        NOT NULL, -- 'home' | 'draw' | 'away' | 'over_2.5' | 'btts_yes' | ...
  "option_label" TEXT        NOT NULL, -- 'Vitória do Mandante' | 'Empate' | ...
  "odd"          DOUBLE PRECISION NOT NULL,
  "is_active"    BOOLEAN     NOT NULL DEFAULT TRUE,
  "source"       TEXT,                -- 'oddspapi' | 'manual'
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "bet_odds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bet_odds_match_market_option_key" UNIQUE ("match_id", "market", "option"),
  CONSTRAINT "bet_odds_match_id_fkey" FOREIGN KEY ("match_id")
    REFERENCES "public"."bet_matches" ("id") ON DELETE CASCADE
);

-- ─── Bilhetes de aposta do usuário ──────────────────────────────────────────

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

-- ─── Seleções individuais dentro de um bilhete ───────────────────────────────

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
  CONSTRAINT "bet_selections_ticket_id_fkey" FOREIGN KEY ("ticket_id")
    REFERENCES "public"."bet_tickets" ("id") ON DELETE CASCADE,
  CONSTRAINT "bet_selections_match_id_fkey" FOREIGN KEY ("match_id")
    REFERENCES "public"."bet_matches" ("id")
);

-- ─── Sugestões do BOB por partida e perfil ───────────────────────────────────

CREATE TABLE IF NOT EXISTS "public"."bob_suggestions" (
  "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
  "match_id"     UUID        NOT NULL,
  "profile"      "bettor_profile" NOT NULL,
  "market"       "bet_market" NOT NULL,
  "option"       TEXT        NOT NULL,
  "option_label" TEXT        NOT NULL,
  "odd"          DOUBLE PRECISION NOT NULL,
  "confidence"   DOUBLE PRECISION NOT NULL, -- 0.0 a 1.0
  "justification" TEXT       NOT NULL,
  "is_active"    BOOLEAN     NOT NULL DEFAULT TRUE,
  "result"       "bet_selection_result",   -- preenchido após o jogo
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "bob_suggestions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bob_suggestions_match_profile_key" UNIQUE ("match_id", "profile", "market"),
  CONSTRAINT "bob_suggestions_match_id_fkey" FOREIGN KEY ("match_id")
    REFERENCES "public"."bet_matches" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "bob_suggestions_match_id_idx"
  ON "public"."bob_suggestions" ("match_id");

-- ─── Trigger: atualiza updated_at automaticamente ────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'bet_matches_updated_at') THEN
    CREATE TRIGGER bet_matches_updated_at
      BEFORE UPDATE ON "public"."bet_matches"
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'bet_odds_updated_at') THEN
    CREATE TRIGGER bet_odds_updated_at
      BEFORE UPDATE ON "public"."bet_odds"
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'bet_tickets_updated_at') THEN
    CREATE TRIGGER bet_tickets_updated_at
      BEFORE UPDATE ON "public"."bet_tickets"
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END$$;
