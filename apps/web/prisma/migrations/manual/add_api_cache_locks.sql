create table if not exists public.api_cache_locks (
  cache_key text primary key,
  locked_until timestamptz not null,
  owner text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists api_cache_locks_locked_until_idx
  on public.api_cache_locks (locked_until);

create or replace function public.set_api_cache_locks_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_api_cache_locks_updated_at on public.api_cache_locks;
create trigger set_api_cache_locks_updated_at
before update on public.api_cache_locks
for each row
execute function public.set_api_cache_locks_updated_at();
