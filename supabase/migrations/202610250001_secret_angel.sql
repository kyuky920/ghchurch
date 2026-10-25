-- Private 10–20 person season snapshots. Only the server service role may access.
begin;
create table public.secret_angel_seasons (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  version integer not null default 0,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.secret_angel_sessions (
  token_hash text primary key,
  season_slug text references public.secret_angel_seasons(slug) on delete cascade,
  participant_id uuid,
  epoch integer not null default 0,
  is_admin boolean not null default false,
  expires_at timestamptz not null,
  check ((is_admin and participant_id is null and season_slug is null) or
         (not is_admin and participant_id is not null and season_slug is not null))
);
create index on public.secret_angel_sessions(expires_at);
create table public.secret_angel_limits (
  key text primary key,
  attempts integer not null,
  resets_at timestamptz not null
);
alter table public.secret_angel_seasons enable row level security;
alter table public.secret_angel_sessions enable row level security;
alter table public.secret_angel_limits enable row level security;
revoke all on public.secret_angel_seasons, public.secret_angel_sessions, public.secret_angel_limits from public, anon, authenticated;
grant select, insert, update, delete on public.secret_angel_seasons, public.secret_angel_sessions, public.secret_angel_limits to service_role;

-- Atomic, persistent limiter shared by all serverless instances. No browser RPC access.
create function public.secret_angel_rate_limit(p_key text, p_max integer, p_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare hits integer;
begin
  insert into public.secret_angel_limits(key, attempts, resets_at)
    values(p_key, 1, now() + make_interval(secs => p_seconds))
  on conflict(key) do update set
    attempts = case when secret_angel_limits.resets_at <= now() then 1 else secret_angel_limits.attempts + 1 end,
    resets_at = case when secret_angel_limits.resets_at <= now() then now() + make_interval(secs => p_seconds) else secret_angel_limits.resets_at end
  returning attempts into hits;
  return hits <= p_max;
end;
$$;
revoke all on function public.secret_angel_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.secret_angel_rate_limit(text, integer, integer) to service_role;
commit;
