-- Migration 015: Análises da Rodada com Persistência Versionada
-- Feature: Radar BOB / Análises da Rodada
-- Padrão: DB-first, append-only, versionamento explícito por season+round+roundVersion
-- 
-- Tabelas criadas:
-- 1. bob_round_analysis — snapshot de análise completa da rodada por versão
-- 2. bob_match_analysis — análise de cada jogo dentro da rodada
-- 3. bob_match_market_snapshot — snapshot de odds e contexto de mercado

-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  -- Criar tabela bob_round_analysis se não existir
  CREATE TABLE IF NOT EXISTS "public"."bob_round_analysis" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "season" integer NOT NULL,
    "round" integer NOT NULL,
    "round_version" integer NOT NULL DEFAULT 1,
    "data_source" text NOT NULL DEFAULT 'cached', -- 'live', 'partial', 'cached', 'fallback'
    "analysis_status" text NOT NULL DEFAULT 'pending', -- 'pending', 'analyzing', 'completed', 'failed'
    "analyzed_at" timestamp with time zone,
    "api_status" text, -- JSON: { "odds": "ok", "lineups": "partial", ... }
    "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
  );
  
  EXCEPTION WHEN duplicate_table THEN
    NULL;
END $$;

-- Índices para bob_round_analysis
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "bob_round_analysis_unique" 
    ON "public"."bob_round_analysis"("season", "round", "round_version");
  CREATE INDEX IF NOT EXISTS "bob_round_analysis_lookup" 
    ON "public"."bob_round_analysis"("season", "round");
  CREATE INDEX IF NOT EXISTS "bob_round_analysis_latest" 
    ON "public"."bob_round_analysis"("season", "round", "round_version" DESC);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  -- Criar tabela bob_match_analysis se não existir
  CREATE TABLE IF NOT EXISTS "public"."bob_match_analysis" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "round_analysis_id" uuid NOT NULL,
    "match_id" uuid NOT NULL,
    "fixture_id" text,
    "home_team" text NOT NULL,
    "away_team" text NOT NULL,
    "home_badge_url" text,
    "away_badge_url" text,
    "scheduled_at" timestamp with time zone NOT NULL,
    "status" text NOT NULL DEFAULT 'SCHEDULED',
    "home_score" integer,
    "away_score" integer,
    "confidence" integer NOT NULL DEFAULT 50,
    "recommendation" text NOT NULL,
    "risk_flags" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "insight_blocks" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id"),
    FOREIGN KEY ("round_analysis_id") 
      REFERENCES "public"."bob_round_analysis"("id") ON DELETE CASCADE
  );

  EXCEPTION WHEN duplicate_table THEN
    NULL;
END $$;

-- Índices para bob_match_analysis
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "bob_match_analysis_unique" 
    ON "public"."bob_match_analysis"("round_analysis_id", "match_id");
  CREATE INDEX IF NOT EXISTS "bob_match_analysis_round" 
    ON "public"."bob_match_analysis"("round_analysis_id");
  CREATE INDEX IF NOT EXISTS "bob_match_analysis_match" 
    ON "public"."bob_match_analysis"("match_id");
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  -- Criar tabela bob_match_market_snapshot se não existir
  CREATE TABLE IF NOT EXISTS "public"."bob_match_market_snapshot" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "match_analysis_id" uuid NOT NULL UNIQUE,
    "home_odd" numeric(6, 3),
    "draw_odd" numeric(6, 3),
    "away_odd" numeric(6, 3),
    "odd_source" text,
    "snapshot_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prior_odds" text,
    PRIMARY KEY ("id"),
    FOREIGN KEY ("match_analysis_id") 
      REFERENCES "public"."bob_match_analysis"("id") ON DELETE CASCADE
  );

  EXCEPTION WHEN duplicate_table THEN
    NULL;
END $$;

-- Índices para bob_match_market_snapshot
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS "bob_match_market_snapshot_match" 
    ON "public"."bob_match_market_snapshot"("match_analysis_id");
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Comentários para documentação
DO $$ BEGIN
  COMMENT ON TABLE "public"."bob_round_analysis" IS 
    'Snapshots de análise completa da rodada, versionados por season+round+roundVersion. Append-only, nunca DELETE.';
  COMMENT ON TABLE "public"."bob_match_analysis" IS 
    'Análise individual de cada jogo dentro de uma rodada versionada. Contém confiança, riscos e insights.';
  COMMENT ON TABLE "public"."bob_match_market_snapshot" IS 
    'Snapshot de odds e contexto de mercado no momento da análise. Histórico preservado para rastreabilidade.';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
