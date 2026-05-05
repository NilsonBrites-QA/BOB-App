CREATE TABLE IF NOT EXISTS chat_context_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE NOT NULL,
  data JSONB NOT NULL,
  season INTEGER,
  round INTEGER,
  ttl_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_context_cache_key ON chat_context_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_chat_context_cache_season_round ON chat_context_cache(season, round);
