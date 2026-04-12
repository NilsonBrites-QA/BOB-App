-- Migration 005: Simulation Results
-- Armazena métricas por variação de cada rodada simulada pelo motor cego.
-- "Simulação cega" = motor roda como se fosse rodada atual → compara com real a posteriori.

CREATE TABLE IF NOT EXISTS simulation_results (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  season               INT         NOT NULL,
  round                INT         NOT NULL,

  -- Acurácia das âncoras
  anchor_count         INT         NOT NULL DEFAULT 0,
  anchors_correct      INT         NOT NULL DEFAULT 0,

  -- Acurácia geral dos picks (todos as variações)
  total_picks          INT         NOT NULL DEFAULT 0,
  correct_picks        INT         NOT NULL DEFAULT 0,

  -- Detalhamento por variação (V1–V5): [{code, picksTotal, picksCorrect, won, projectedOdd}]
  variations_json      JSONB       NOT NULL DEFAULT '[]',

  -- Melhor odd projetada vs real (da variação vencedora, se houver)
  best_odd_projected   NUMERIC(12,2),
  best_odd_real        NUMERIC(12,2),

  -- Meta
  calibrated           BOOLEAN     NOT NULL DEFAULT FALSE, -- selfCalibrate() já rodou para esta simulação
  simulated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes                TEXT,

  UNIQUE (season, round)
);

-- Índice para ordenação cronológica
CREATE INDEX IF NOT EXISTS idx_simulation_results_season_round
  ON simulation_results (season, round);
