-- ─────────────────────────────────────────────────────────────────────────────
-- BOB — Migration 002: resultado por pick (feedback loop)
-- Versão: 002
-- Execute no Supabase SQL Editor:
-- https://supabase.com/dashboard/project/zravuslhqluaxjuakecp/sql/new
-- ─────────────────────────────────────────────────────────────────────────────

-- Adiciona campos de resultado real em cada pick
-- actual_result: o que aconteceu de fato (HOME, DRAW, AWAY)
-- correct: se o pick estava certo

alter table picks
  add column if not exists actual_result text check (actual_result in ('HOME','DRAW','AWAY')),
  add column if not exists correct       boolean;

comment on column picks.actual_result is 'Resultado real do jogo (registrado pelo usuário após a rodada)';
comment on column picks.correct       is 'true se o pick acertou o resultado; null = jogo ainda não registrado';

-- Adiciona campo fixture_id para vincular o pick ao jogo na API-Football
alter table picks
  add column if not exists fixture_id text;

comment on column picks.fixture_id is 'ID do fixture na API-Football (para cruzamento de dados)';

-- Índice para buscas de picks pendentes de resultado
create index if not exists idx_picks_correct on picks(correct) where correct is null;

-- ─── Política RLS para escrita de picks (admin) ───────────────────────────────
-- Permite que usuários autenticados atualizem actual_result e correct

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'picks'
      and policyname = 'Admin pode atualizar picks'
  ) then
    execute 'create policy "Admin pode atualizar picks"
      on picks for update
      using (auth.role() = ''authenticated'')';
  end if;
end $$;

-- ─── View: métricas de acerto por rodada ─────────────────────────────────────
-- Facilita consultas do dashboard de performance sem joins complexos

create or replace view public.round_metrics as
select
  r.id              as round_id,
  r.number          as round_number,
  s.year            as season,
  r.status,
  -- Variações
  count(distinct v.id)                          as variation_count,
  -- Picks totais com resultado registrado
  count(p.id) filter (where p.correct is not null) as picks_graded,
  count(p.id) filter (where p.correct = true)      as picks_correct,
  -- Taxa de acerto (null se nenhum pick foi registrado)
  round(
    count(p.id) filter (where p.correct = true)::numeric /
    nullif(count(p.id) filter (where p.correct is not null), 0) * 100,
    1
  )                                             as hit_rate_pct,
  -- Financeiro
  rr.stake_per_variation,
  rr.total_staked,
  rr.gross_return,
  rr.net_return,
  rr.hit            as round_hit,
  r.created_at
from rounds r
join seasons s on s.id = r.season_id
left join variations v on v.round_id = r.id
left join picks p on p.variation_id = v.id
left join round_results rr on rr.round_id = r.id
group by r.id, r.number, s.year, r.status, rr.stake_per_variation,
         rr.total_staked, rr.gross_return, rr.net_return, rr.hit, r.created_at
order by r.created_at desc;

comment on view round_metrics is 'Métricas consolidadas por rodada para o dashboard de performance';

-- ─── Política de leitura da view ─────────────────────────────────────────────

grant select on public.round_metrics to anon, authenticated;
