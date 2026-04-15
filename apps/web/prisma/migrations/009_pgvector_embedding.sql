-- =============================================================================
-- Migration 009 — Fase 1: pgvector + Embedding Semântico
-- BOB — Big Odds Brasileirão
-- =============================================================================
--
-- Ativa a extensão pgvector no Supabase e adiciona coluna de embedding
-- semântico à tabela `conditional_patterns` (Memória de Padrões do Cérebro).
--
-- OBJETIVO:
--   Habilitar busca por similaridade vetorial (coseno, HNSW) na Memória
--   Semântica do Orquestrador, conforme PRD §5 — "Memória de Padrões".
--
--   Exemplo de uso futuro:
--     "Quais padrões anteriores se assemelham à situação atual de Palmeiras
--      em jogo fora após Copa Libertadores com desfalques no ataque?"
--
-- VETOR: 1536 dimensões = padrão do modelo text-embedding-3-small (OpenAI).
--        Compatível com text-embedding-ada-002 (legado) se migrarmos.
--
-- ÍNDICE HNSW:
--   Approximate nearest neighbor — muito mais rápido que busca exata para
--   grandes volumes. operator class `vector_cosine_ops` = distância coseno.
--   m=16, ef_construction=64 = configuração padrão Supabase para 1536d.
--
-- SEGURANÇA DE DADOS:
--   Apenas ADD COLUMN IF NOT EXISTS e CREATE INDEX IF NOT EXISTS.
--   Nenhum dado existente é modificado, removido ou truncado.
--   Esta migration é idempotente e segura para re-execução.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Ativar extensão pgvector
-- ─────────────────────────────────────────────────────────────────────────────
-- Requer plano Supabase Free ou superior (disponível nativamente).
-- Se a extensão já estiver ativa, IF NOT EXISTS evita erro.
-- Se o plano não suportar pgvector (caso improvável no Supabase), esta linha
-- falha — neste caso, comente-a e a coluna abaixo não será criada (aplicação
-- continua funcional; apenas a busca semântica fica indisponível).

CREATE EXTENSION IF NOT EXISTS vector;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Adicionar coluna embedding em conditional_patterns
-- ─────────────────────────────────────────────────────────────────────────────
-- Nullable (sem NOT NULL): padrões existentes não têm embedding até o próximo
-- ciclo de calibração que gerar o vetor via API de embeddings da OpenAI.
--
-- Política de preenchimento (a ser implementada na Fase 3 — Memória):
--   - Ao criar/atualizar um ConditionalPattern, o worker de calibração chama
--     openai.embeddings.create({ input: pattern.condition, model: "..." })
--   - O vetor retornado é gravado nesta coluna via SQL raw ($executeRaw).
--   - Prisma não consegue mapear Unsupported("vector") — use sempre SQL raw
--     para leituras e escritas deste campo.

ALTER TABLE conditional_patterns
  ADD COLUMN IF NOT EXISTS embedding vector(1536);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Índice HNSW para busca de similaridade coseno
-- ─────────────────────────────────────────────────────────────────────────────
-- HNSW (Hierarchical Navigable Small World) é o algoritmo recomendado pelo
-- pgvector para volumes > 1000 vetores. É significativamente mais rápido que
-- IVFFlat para buscas online (sem fase de treino).
--
-- vector_cosine_ops: mede distância pelo coseno, ideal para embeddings de texto
-- (invariante à magnitude — padrões com texto de comprimentos diferentes são
-- comparados corretamente).
--
-- Parâmetros:
--   m = 16                — número de conexões por camada do grafo (padrão)
--   ef_construction = 64  — profundidade de busca durante construção (padrão)
--
-- NOTA: O índice é criado AFTER ADD COLUMN para não bloquear o DDL anterior.
-- Em tabelas grandes (>100k linhas), criar o índice com CONCURRENTLY em produção.

CREATE INDEX IF NOT EXISTS idx_conditional_patterns_embedding_hnsw
  ON conditional_patterns
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

COMMENT ON COLUMN conditional_patterns.embedding IS
  'Embedding semântico do padrão (vector(1536), OpenAI text-embedding-3-small). '
  'Usado para busca por similaridade coseno (HNSW). '
  'Preenchido pelo worker de calibração (Fase 3). Queries via SQL raw ($queryRaw).';
