-- =============================================================================
-- Migration 008 — Fase 1: Assets de Times + Log de Sincronização de APIs
-- BOB — Big Odds Brasileirão
-- =============================================================================
--
-- Cria duas tabelas de infraestrutura para a política de cache do PRD §9:
--
--   1. team_assets    — Cache permanente DB-first de logos/escudos (TheSportsDB).
--                       Sincronizado UMA VEZ por time. Imutável e append-only.
--
--   2. api_sync_log   — Log Event Sourcing de cada sincronização bem-sucedida.
--                       Camada L2 do cache-gate.ts. Imutável e append-only.
--
-- SEGURANÇA DE DADOS:
--   Nenhum comando DELETE, TRUNCATE ou DROP é executado nesta migration.
--   Todas as tabelas são criadas com IF NOT EXISTS (idempotente).
--   Estas tabelas NÃO podem ter triggers de limpeza automática.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. team_assets
-- ─────────────────────────────────────────────────────────────────────────────
-- Armazena permanentemente os assets visuais de cada time.
-- IDs cruzados (football_data_id, api_football_id) permitem matching entre
-- as diferentes fontes de dados usadas pelo orquestrador.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_assets (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Chave primária de lookup: ID do time no TheSportsDB (ex: "133613").
  -- UNIQUE garante que cada time é sincronizado exatamente uma vez.
  tsdb_id          TEXT        NOT NULL UNIQUE,

  name             TEXT        NOT NULL,
  short_name       TEXT,

  -- URLs dos assets — armazenadas como-é da API; nunca re-validadas externamente.
  -- logo_url  = strTeamBadge  (escudo principal, PNG)
  -- badge_url = strTeamLogo   (logo alternativo, se existir)
  -- banner_url= strTeamBanner (banner HD para uso em backgrounds)
  logo_url         TEXT,
  badge_url        TEXT,
  banner_url       TEXT,

  stadium_name     TEXT,
  stadium_thumb    TEXT,           -- URL da foto do estádio
  country          TEXT,

  -- IDs de fontes cruzadas para matching sem nova chamada de API.
  -- Preenchidos pelo conector index.ts quando a correlação é conhecida.
  football_data_id INTEGER,        -- ID no football-data.org
  api_football_id  INTEGER,        -- ID no API-Football (v3.football.api-sports.io)

  -- Imutável: registra quando o asset foi persistido pela primeira vez.
  -- Não possui updated_at: modificações geram nova linha, não sobrescrevem.
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  team_assets             IS 'Cache permanente de assets (TheSportsDB). Append-only. Nunca deletar.';
COMMENT ON COLUMN team_assets.tsdb_id     IS 'ID do time no TheSportsDB — chave de lookup DB-first.';
COMMENT ON COLUMN team_assets.logo_url    IS 'strTeamBadge: escudo/logo principal (PNG).';
COMMENT ON COLUMN team_assets.badge_url   IS 'strTeamLogo: logo alternativo (se disponível).';
COMMENT ON COLUMN team_assets.banner_url  IS 'strTeamBanner: imagem banner HD do time.';
COMMENT ON COLUMN team_assets.created_at  IS 'Data da primeira e única sincronização com a API externa.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. api_sync_log
-- ─────────────────────────────────────────────────────────────────────────────
-- Log imutável (Event Sourcing) de cada chamada bem-sucedida às APIs externas.
-- É a camada L2 (persistente) do cache-gate.ts — o L1 (Map em memória) é
-- volátil e não sobrevive a cold starts de servidor; esta tabela garante
-- que o histórico de syncs é preservado mesmo após redeploys na Vercel.
--
-- O conector que recebe `{ allowed: true }` do cache-gate DEVE inserir uma
-- linha aqui APÓS receber resposta HTTP 2xx da API externa.
--
-- Uso primário pelo cache-gate:
--   SELECT MAX(synced_at) FROM api_sync_log
--   WHERE source = $1 AND cache_key = $2 AND window_label IS NOT DISTINCT FROM $3
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_sync_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Fonte da sincronização.
  -- CHECK hardcodeado aqui; qualquer novo source deve ser adicionado ao PRD
  -- antes de ser inserido nesta coluna (não alterar sem aprovação arquitetural).
  source       TEXT        NOT NULL
               CHECK (source IN ('thesportsdb', 'football-data', 'api-football', 'oddspapi')),

  -- Chave de cache no mesmo formato do cache-gate.ts.
  -- Exemplos: "BSA-2026-standings", "fixtures-round-10", "lineups-fixture-123456"
  cache_key    TEXT        NOT NULL,

  -- Janela da API-Football em que o sync ocorreu.
  -- NULL para TheSportsDB, football-data.org e OddsPapi.
  -- Constraint garante que apenas valores válidos do PRD §9 são inseridos.
  window_label TEXT
               CHECK (window_label IN ('T-48h', 'T-24h', 'T-1h') OR window_label IS NULL),

  -- Kickoff UTC do jogo-alvo. Preenchido apenas para source='api-football'.
  -- Necessário para que o cache-gate recalcule se a janela ainda é válida.
  kickoff_at   TIMESTAMPTZ,

  -- Quando a resposta 2xx chegou da API externa (não quando a requisição saiu).
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- HTTP status da resposta (200, 206, etc.). NULL se não disponível.
  status_code  SMALLINT,

  -- Quantidade de registros retornados pela API nesta chamada.
  -- Usado para monitorar qualidade dos dados (ex: 0 resultados = dado suspeito).
  record_count INTEGER,

  -- Contexto operacional livre para observabilidade no Brain Console.
  -- Ex: "Sinal interrompido — fallback ativo", "Janela T-1h: escalação confirmada"
  notes        TEXT
);

-- Índice primário de lookup: encontrar o último sync de uma chave+janela.
-- Usado pelo conector para passar `lastSyncedAt` ao cache-gate.
-- DESC no synced_at: a query LIMIT 1 pega diretamente o mais recente.
CREATE INDEX IF NOT EXISTS idx_api_sync_log_lookup
  ON api_sync_log (source, cache_key, window_label, synced_at DESC);

-- Índice de observabilidade: lista todos os syncs de uma fonte em ordem temporal.
-- Usado pelo BOB Live Brain Console para visualizar o log cognitivo.
CREATE INDEX IF NOT EXISTS idx_api_sync_log_source_time
  ON api_sync_log (source, synced_at DESC);

COMMENT ON TABLE  api_sync_log             IS 'Log imutável (Event Sourcing) de syncs com APIs externas. Nunca deletar.';
COMMENT ON COLUMN api_sync_log.source      IS 'Fonte: thesportsdb | football-data | api-football | oddspapi.';
COMMENT ON COLUMN api_sync_log.cache_key   IS 'Chave de cache no formato do cache-gate.ts.';
COMMENT ON COLUMN api_sync_log.window_label IS 'Janela da API-Football: T-48h | T-24h | T-1h. NULL para demais fontes.';
COMMENT ON COLUMN api_sync_log.kickoff_at  IS 'Kickoff UTC do jogo-alvo (apenas api-football).';
COMMENT ON COLUMN api_sync_log.synced_at   IS 'Timestamp da resposta 2xx confirmada. Nunca atualizar.';
COMMENT ON COLUMN api_sync_log.record_count IS 'Qtd de registros retornados. 0 = dado suspeito.';
