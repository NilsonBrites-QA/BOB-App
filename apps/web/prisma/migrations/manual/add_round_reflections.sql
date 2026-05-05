-- BOB — Reflexão Pós-Rodada (Imutável)
--
-- Uma reflexão por rodada. Nunca deletada, nunca atualizada.
-- Contém os dados brutos de acerto/erro e a narrativa gerada pelo BOB.
--
-- Idempotência: o @@unique(season, round) impede duplicatas.

CREATE TABLE IF NOT EXISTS round_reflections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season          INT NOT NULL,
  round           INT NOT NULL,
  round_id        UUID REFERENCES rounds(id) ON DELETE SET NULL,

  -- Dados brutos de acerto
  total_picks     INT NOT NULL DEFAULT 0,
  correct_picks   INT NOT NULL DEFAULT 0,
  hit_rate        NUMERIC(5,2) NOT NULL DEFAULT 0,

  total_anchors   INT NOT NULL DEFAULT 0,
  correct_anchors INT NOT NULL DEFAULT 0,
  anchor_hit_rate NUMERIC(5,2) NOT NULL DEFAULT 0,

  -- Detalhes por variação (V1–V5)
  variations_detail JSONB NOT NULL DEFAULT '[]',
  -- Formato: [{code:"V1", title:"...", totalPicks:10, correctPicks:7, hitRate:70, green:false, combinedOdd:12.5, picks:[{match,pick,actual,correct}]}]

  -- Detalhes das âncoras
  anchors_detail    JSONB NOT NULL DEFAULT '[]',
  -- Formato: [{team:"Flamengo", opponent:"Palmeiras", predicted:"HOME", actual:"HOME", correct:true, score:85}]

  -- Narrativa gerada pelo BOB (LLM)
  bob_narrative     TEXT,
  narrative_provider TEXT, -- "claude" | "gemini" | "heuristic"

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(season, round)
);

CREATE INDEX IF NOT EXISTS idx_round_reflections_season_round
  ON round_reflections(season, round);
