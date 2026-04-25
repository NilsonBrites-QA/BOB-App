-- Migration 010: VariationJudgement (análise LLM pré-computada)
-- Pré-computado via cron (1x/hora ou sob demanda) → leitura O(1) no SSR.
-- Elimina latência de LLM no caminho do usuário.
--
-- Campo `payload` (JSONB) contém:
--   - enrichments: Array<{ variationId, bobNarrative, keyInsight, riskAlerts, confidence }>
--   - replacements: Array<{ variationId, fromMatchId, toMatchId, reason, approved }>
--   - anchorIds: Array<string>
--   - generatedAt: ISO timestamp

CREATE TABLE IF NOT EXISTS variation_judgements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season      INTEGER NOT NULL,
  round       INTEGER NOT NULL,
  payload     JSONB NOT NULL,
  provider    TEXT NOT NULL, -- "claude" | "gpt" | "gemini" | "heuristic"
  tokens_in   INTEGER,
  tokens_out  INTEGER,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT variation_judgements_season_round_unique UNIQUE (season, round)
);

CREATE INDEX IF NOT EXISTS variation_judgements_season_round_idx
  ON variation_judgements (season, round);

-- Trigger para atualizar updated_at automaticamente
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

COMMENT ON TABLE variation_judgements IS 'Análise LLM pré-computada das variações por (season, round). Lida no SSR sem custo de tokens.';
