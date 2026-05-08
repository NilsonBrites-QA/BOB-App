-- Migration 014: initial_odd em bet_odds
-- Permite detectar queda de odd (homeOddDropped) comparando odd atual vs baseline inicial.

ALTER TABLE "public"."bet_odds"
  ADD COLUMN IF NOT EXISTS "initial_odd" DOUBLE PRECISION;

-- Backfill seguro: registros antigos passam a usar a odd atual como baseline inicial.
UPDATE "public"."bet_odds"
   SET "initial_odd" = "odd"
 WHERE "initial_odd" IS NULL
   AND "odd" > 1;
