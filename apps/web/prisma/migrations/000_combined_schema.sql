-- ─────────────────────────────────────────────────────────────────────────────
-- BOB — Big Odds Brasileirão · Schema completo e idempotente
-- Versão: 000 (combina 001_initial_schema + 002_feedback_loop)
--
-- INSTRUÇÃO: Execute APENAS este arquivo no Supabase SQL Editor:
-- https://supabase.com/dashboard/project/zravuslhqluaxjuakecp/sql/new
--
-- Este script é SEGURO para re-execução:
--   - Usa CREATE TYPE/TABLE/INDEX IF NOT EXISTS
--   - Usa ALTER COLUMN IF NOT EXISTS
--   - Usa CREATE OR REPLACE para funções e views
--   - Não duplica o seed da temporada 2026
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Extensões ────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ─── Enumerações ─────────────────────────────────────────────────────────────

do $$ begin
  create type user_role as enum ('ADMIN', 'VIEWER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type round_status as enum ('DRAFT', 'READY', 'DELIVERED', 'CLOSED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type variation_status as enum ('ACTIVE', 'REVISED', 'SUPERSEDED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pick_result as enum ('HOME', 'DRAW', 'AWAY');
exception when duplicate_object then null; end $$;

do $$ begin
  create type memory_layer as enum ('RAW', 'NORMALIZED', 'PATTERNS', 'DECISIONS');
exception when duplicate_object then null; end $$;

-- ─── Usuários (whitelist) ─────────────────────────────────────────────────────

create table if not exists users (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  name       text,
  role       user_role not null default 'VIEWER',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table users is 'Whitelist de usuários autorizados a acessar o BOB';

-- ─── Temporada ────────────────────────────────────────────────────────────────

create table if not exists seasons (
  id         uuid primary key default gen_random_uuid(),
  year       integer not null unique,
  league     text not null default 'Brasileirao Serie A',
  active     boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table seasons is 'Temporadas do Brasileirão rastreadas pelo BOB';

-- ─── Rodada ───────────────────────────────────────────────────────────────────

create table if not exists rounds (
  id             uuid primary key default gen_random_uuid(),
  season_id      uuid not null references seasons(id),
  number         integer not null,
  status         round_status not null default 'DRAFT',
  first_match_at timestamptz,
  cutoff_at      timestamptz,
  delivered_at   timestamptz,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique(season_id, number)
);

comment on table rounds is 'Cada rodada do Brasileirão com seu estado e janelas de tempo';
comment on column rounds.cutoff_at is 'Prazo máximo de entrega: 1h antes do primeiro jogo da rodada';

-- ─── Âncoras ─────────────────────────────────────────────────────────────────

create table if not exists anchors (
  id         uuid primary key default gen_random_uuid(),
  round_id   uuid not null references rounds(id) on delete cascade,
  team       text not null,
  opponent   text not null,
  score      float not null,
  reasons    jsonb not null default '[]',
  rank       integer not null check (rank between 1 and 4),
  match_date timestamptz,
  created_at timestamptz not null default now()
);

comment on table anchors is '4 âncoras selecionadas por rodada com base no scoring multifatorial';

-- ─── Variações ────────────────────────────────────────────────────────────────

create table if not exists variations (
  id               uuid primary key default gen_random_uuid(),
  round_id         uuid not null references rounds(id) on delete cascade,
  code             text not null,
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

-- ─── Picks ────────────────────────────────────────────────────────────────────

create table if not exists picks (
  id           uuid primary key default gen_random_uuid(),
  variation_id uuid not null references variations(id) on delete cascade,
  match        text not null,
  result       pick_result not null,
  odd          float not null,
  is_anchor    boolean not null default false,
  position     integer not null,
  created_at   timestamptz not null default now()
);

comment on table picks is 'Jogos individuais dentro de cada variação';

-- Campos adicionados pela migration 002 (feedback loop)
alter table picks
  add column if not exists actual_result text check (actual_result in ('HOME','DRAW','AWAY')),
  add column if not exists correct       boolean,
  add column if not exists fixture_id   text;

comment on column picks.actual_result is 'Resultado real do jogo (registrado após a rodada)';
comment on column picks.correct is 'true se o pick acertou o resultado; null = não registrado';
comment on column picks.fixture_id is 'ID do fixture na API-Football (para cruzamento de dados)';

-- ─── Eventos de Memória ───────────────────────────────────────────────────────

create table if not exists memory_events (
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid references rounds(id) on delete set null,
  layer           memory_layer not null,
  type            text not null,
  content         jsonb not null,
  source          text,
  relevance_score float,
  created_at      timestamptz not null default now()
);

comment on table memory_events is 'Camada de memória persistente: retém tudo, usa seletivamente';

-- ─── Resultado da Rodada ──────────────────────────────────────────────────────

create table if not exists round_results (
  id                  uuid primary key default gen_random_uuid(),
  round_id            uuid not null unique references rounds(id) on delete cascade,
  variation_played    text,
  stake_per_variation numeric(10,2) not null,
  total_staked        numeric(10,2) not null,
  gross_return        numeric(12,2) not null default 0,
  net_return          numeric(12,2) not null default 0,
  hit                 boolean not null default false,
  notes               text,
  registered_at       timestamptz not null default now()
);

comment on table round_results is 'Resultado real registrado após cada rodada para auditoria';

-- ─── Índices ──────────────────────────────────────────────────────────────────

create index if not exists idx_rounds_season     on rounds(season_id);
create index if not exists idx_rounds_status     on rounds(status);
create index if not exists idx_anchors_round     on anchors(round_id);
create index if not exists idx_variations_round  on variations(round_id);
create index if not exists idx_picks_variation   on picks(variation_id);
create index if not exists idx_memory_round      on memory_events(round_id);
create index if not exists idx_memory_layer      on memory_events(layer);
create index if not exists idx_memory_type       on memory_events(type);
create index if not exists idx_picks_correct     on picks(correct) where correct is null;

-- ─── Trigger updated_at ───────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$ begin
  create trigger trg_users_updated_at
    before update on users
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_rounds_updated_at
    before update on rounds
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

-- ─── Seed: temporada 2026 ─────────────────────────────────────────────────────

insert into seasons (year, league, active)
values (2026, 'Brasileirao Serie A', true)
on conflict (year) do nothing;

-- ─── Row Level Security (RLS) ─────────────────────────────────────────────────

alter table users          enable row level security;
alter table seasons        enable row level security;
alter table rounds         enable row level security;
alter table anchors        enable row level security;
alter table variations     enable row level security;
alter table picks          enable row level security;
alter table memory_events  enable row level security;
alter table round_results  enable row level security;

-- Políticas de leitura pública
do $$ begin
  create policy "Leitura pública seasons"
    on seasons for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Leitura pública rounds"
    on rounds for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Leitura pública anchors"
    on anchors for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Leitura pública variations"
    on variations for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Leitura pública picks"
    on picks for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Leitura pública results"
    on round_results for select using (true);
exception when duplicate_object then null; end $$;

-- Política de escrita para picks (admin — feedback loop)
do $$ begin
  create policy "Admin pode atualizar picks"
    on picks for update
    using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- ─── View: métricas por rodada ────────────────────────────────────────────────

create or replace view public.round_metrics as
select
  r.id              as round_id,
  r.number          as round_number,
  s.year            as season,
  r.status,
  count(distinct v.id)                                           as variation_count,
  count(p.id) filter (where p.correct is not null)              as picks_graded,
  count(p.id) filter (where p.correct = true)                   as picks_correct,
  round(
    count(p.id) filter (where p.correct = true)::numeric /
    nullif(count(p.id) filter (where p.correct is not null), 0) * 100,
    1
  )                                                              as hit_rate_pct,
  rr.stake_per_variation,
  rr.total_staked,
  rr.gross_return,
  rr.net_return,
  rr.hit    as round_hit,
  r.created_at
from rounds r
join seasons s on s.id = r.season_id
left join variations v on v.round_id = r.id
left join picks p on p.variation_id = v.id
left join round_results rr on rr.round_id = r.id
group by
  r.id, r.number, s.year, r.status,
  rr.stake_per_variation, rr.total_staked, rr.gross_return,
  rr.net_return, rr.hit, r.created_at
order by r.created_at desc;

comment on view round_metrics is 'Métricas consolidadas por rodada para o dashboard de performance';

grant select on public.round_metrics to anon, authenticated;
