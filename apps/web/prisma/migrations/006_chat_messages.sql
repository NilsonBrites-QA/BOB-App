-- Migration 006: Chat Messages
-- Histórico de mensagens do chat por usuário com TTL virtual de 4 dias.
-- Criada em: 13/04/2026

CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL,
  role        TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT        NOT NULL,
  model       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chat_messages_pkey PRIMARY KEY (id)
);

-- Index para queries por usuário ordenadas por data (TTL filter + histórico)
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created
  ON chat_messages (user_id, created_at DESC);
