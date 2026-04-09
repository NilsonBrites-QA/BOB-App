-- ─────────────────────────────────────────────────────────────────────────────
-- BOB — Big Odds Bot • Schema inicial do banco de dados
-- Versão: 001
-- Execute este script no Supabase SQL Editor:
-- https://supabase.com/dashboard/project/zravuslhqluaxjuakecp/sql/new
-- ─────────────────────────────────────────────────────────────────────────────

-- Habilitar extensão para UUIDs
create extension if not exists "pgcrypto";

-- ─── Enumerações ─────────────────────────────────────────────────────────────

create type user_role as enum ('ADMIN', 'VIEWER');
create type round_status as enum ('DRAFT', 'READY', 'DELIVERED', 'CLOSED');
create type variation_status as enum ('ACTIVE', 'REVISED', 'SUPERSEDED');
create type pick_result as enum ('HOME', 'DRAW', 'AWAY');
create type memory_layer as enum ('RAW', 'NORMALIZED', 'PATTERNS', 'DECISIONS');

-- ─── Usuários (whitelist) ────────────────────────────────────────────────────

create table users (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  name       text,
  role       user_role not null default 'VIEWER',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table users is 'Whitelist de usuários autorizados a acessar o BOB';

-- ─── Temporada ───────────────────────────────────────────────────────────────

create table seasons (
  id         uuid primary key default gen_random_uuid(),
  year       integer not null unique,
  league     text not null default 'Brasileirao Serie A',
  active     boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table seasons is 'Temporadas do Brasileirão rastreadas pelo BOB';

-- ─── Rodada ──────────────────────────────────────────────────────────────────

create table rounds (
  id             uuid primary key default gen_random_uuid(),
  season_id      uuid not null references seasons(id),
  number         integer not null,
  status         round_status not null default 'DRAFT',
  first_match_at timestamptz,
  cutoff_at      timestamptz, -- calculado: first_match_at - interval '1 hour'
  delivered_at   timestamptz,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique(season_id, number)
);

comment on table rounds is 'Cada rodada do Brasileirão com seu estado e janelas de tempo';
comment on column rounds.cutoff_at is 'Prazo máximo de entrega: 1h antes do primeiro jogo da rodada';

-- ─── Âncoras ─────────────────────────────────────────────────────────────────

create table anchors (
  id         uuid primary key default gen_random_uuid(),
  round_id   uuid not null references rounds(id) on delete cascade,
  team       text not null,
  opponent   text not null,
  score      float not null, -- 0–100
  reasons    jsonb not null default '[]', -- string[]
  rank       integer not null check (rank between 1 and 4),
  match_date timestamptz,
  created_at timestamptz not null default now()
);

comment on table anchors is '4 âncoras selecionadas por rodada com base no scoring multifatorial';

-- ─── Variações ───────────────────────────────────────────────────────────────

create table variations (
  id               uuid primary key default gen_random_uuid(),
  round_id         uuid not null references rounds(id) on delete cascade,
  code             text not null,           -- V1, V2, V3, V4, V5
  title            text not null,
  posture          text not null,
  projected_odd    float not null,
  game_count       integer not null,
  anchors_together boolean not null,
  summary          text not null,
  status           variation_status not null default 'ACTIVE',
  created_at       timestamptz not null default now()
);

comment on table variations is '5 variações fixas por rodada (+ extras sob demanda)';

-- ─── Picks (jogos de cada variação) ──────────────────────────────────────────

create table picks (
  id           uuid primary key default gen_random_uuid(),
  variation_id uuid not null references variations(id) on delete cascade,
  match        text not null,         -- "Flamengo x Palmeiras"
  result       pick_result not null,  -- HOME=1, DRAW=X, AWAY=2
  odd          float not null,
  is_anchor    boolean not null default false,
  position     integer not null,      -- ordem no bilhete
  created_at   timestamptz not null default now()
);

comment on table picks is 'Jogos individuais dentro de cada variação';

-- ─── Eventos de Memória ───────────────────────────────────────────────────────

create table memory_events (
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid references rounds(id) on delete set null,
  layer           memory_layer not null,
  type            text not null,   -- lineup, injury, form, result, weather, etc.
  content         jsonb not null,  -- dado bruto estruturado
  source          text,            -- API de origem
  relevance_score float,           -- 0–1, preenchido na normalização
  created_at      timestamptz not null default now()
);

comment on table memory_events is 'Camada de memória persistente: retém tudo, usa seletivamente';

-- ─── Resultado da Rodada ─────────────────────────────────────────────────────

create table round_results (
  id                  uuid primary key default gen_random_uuid(),
  round_id            uuid not null unique references rounds(id) on delete cascade,
  variation_played    text,            -- V1–V5 ou null (várias jogadas)
  stake_per_variation numeric(10,2) not null,
  total_staked        numeric(10,2) not null,
  gross_return        numeric(12,2) not null default 0,
  net_return          numeric(12,2) not null default 0,
  hit                 boolean not null default false,
  notes               text,
  registered_at       timestamptz not null default now()
);

comment on table round_results is 'Resultado real registrado após cada rodada para auditoria';

-- ─── Índices de performance ───────────────────────────────────────────────────

create index idx_rounds_season     on rounds(season_id);
create index idx_rounds_status     on rounds(status);
create index idx_anchors_round     on anchors(round_id);
create index idx_variations_round  on variations(round_id);
create index idx_picks_variation   on picks(variation_id);
create index idx_memory_round      on memory_events(round_id);
create index idx_memory_layer      on memory_events(layer);
create index idx_memory_type       on memory_events(type);

-- ─── Trigger updated_at automático ───────────────────────────────────────────

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_users_updated_at
  before update on users
  for each row execute function set_updated_at();

create trigger trg_rounds_updated_at
  before update on rounds
  for each row execute function set_updated_at();

-- ─── Seed: temporada 2026 ─────────────────────────────────────────────────────

insert into seasons (year, league, active)
values (2026, 'Brasileirao Serie A', true);

-- ─── Row Level Security (RLS) ─────────────────────────────────────────────────
-- Habilitar RLS em todas as tabelas (obrigatório com publishable key no browser)

alter table users          enable row level security;
alter table seasons        enable row level security;
alter table rounds         enable row level security;
alter table anchors        enable row level security;
alter table variations     enable row level security;
alter table picks          enable row level security;
alter table memory_events  enable row level security;
alter table round_results  enable row level security;

-- Política de leitura pública para seasons, rounds, anchors, variations, picks
-- (ajustar quando auth estiver implementado)
create policy "Leitura pública seasons"    on seasons    for select using (true);
create policy "Leitura pública rounds"     on rounds     for select using (true);
create policy "Leitura pública anchors"    on anchors    for select using (true);
create policy "Leitura pública variations" on variations for select using (true);
create policy "Leitura pública picks"      on picks      for select using (true);
create policy "Leitura pública results"    on round_results for select using (true);
