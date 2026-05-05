-- BOB — Tabela de Alavancagem (Event Sourcing / Append-Only)
--
-- PARADIGMA: cada GREEN/RED gera um registro IMUTÁVEL.
-- O "passo atual" é DERIVADO da leitura dos eventos, nunca armazenado.
-- NUNCA deletar linhas desta tabela.

CREATE TABLE IF NOT EXISTS leverage_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle_id    UUID NOT NULL,
  step        INT NOT NULL CHECK (step >= 1 AND step <= 15),
  result      TEXT NOT NULL CHECK (result IN ('GREEN', 'RED', 'PENDING', 'RESOLVED')),
  match_id    TEXT NOT NULL,
  home_team   TEXT NOT NULL,
  away_team   TEXT NOT NULL,
  pick_label  TEXT NOT NULL,
  pick_odd    NUMERIC(6,2) NOT NULL,
  stake       NUMERIC(12,2) NOT NULL,
  payout      NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index por usuário (query principal)
CREATE INDEX IF NOT EXISTS idx_leverage_events_user
  ON leverage_events(user_id, created_at ASC);

-- Index por ciclo (para montar o histórico de um ciclo)
CREATE INDEX IF NOT EXISTS idx_leverage_events_cycle
  ON leverage_events(cycle_id, step ASC);

-- Permite RLS: cada usuário só vê seus próprios eventos
ALTER TABLE leverage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY leverage_events_user_policy ON leverage_events
  FOR ALL USING (user_id = auth.uid());
