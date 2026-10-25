-- Run against a disposable local/staging PostgreSQL database after migration.
-- All test rows are rolled back. Never requires production data.
begin;
do $$
begin
  if has_table_privilege('anon', 'public.secret_angel_seasons', 'select')
     or has_table_privilege('authenticated', 'public.secret_angel_seasons', 'update')
     or has_table_privilege('anon', 'public.secret_angel_sessions', 'select')
     or has_function_privilege('anon', 'public.secret_angel_rate_limit(text,integer,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.secret_angel_rate_limit(text,integer,integer)', 'execute') then
    raise exception 'Private table or limiter is exposed';
  end if;
  if (select count(*) from pg_class where oid in ('public.secret_angel_seasons'::regclass, 'public.secret_angel_sessions'::regclass, 'public.secret_angel_limits'::regclass) and relrowsecurity) <> 3 then
    raise exception 'RLS missing';
  end if;
end $$;
set local role anon;
do $$
begin
  begin
    perform * from public.secret_angel_seasons;
    raise exception 'Anonymous read was allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.secret_angel_rate_limit('test-denied', 1, 60);
    raise exception 'Anonymous RPC was allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$
begin
  begin
    perform * from public.secret_angel_sessions;
    raise exception 'Authenticated read was allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
insert into public.secret_angel_seasons(slug, state) values('migration-test-only', '{"private":"not for browsers"}');
insert into public.secret_angel_sessions(token_hash, season_slug, participant_id, expires_at)
  values('test-token-hash', 'migration-test-only', '00000000-0000-4000-8000-000000000001', now() + interval '1 hour');
do $$
declare n integer;
begin
  update public.secret_angel_seasons set version = 1 where slug = 'migration-test-only' and version = 0;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'First CAS must succeed'; end if;
  update public.secret_angel_seasons set version = 2 where slug = 'migration-test-only' and version = 0;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Stale CAS must fail'; end if;
  if not public.secret_angel_rate_limit('migration-test-only', 2, 60)
     or not public.secret_angel_rate_limit('migration-test-only', 2, 60)
     or public.secret_angel_rate_limit('migration-test-only', 2, 60) then
    raise exception 'Atomic rate limiter failed';
  end if;
  delete from public.secret_angel_seasons where slug = 'migration-test-only';
  if exists(select 1 from public.secret_angel_sessions where token_hash = 'test-token-hash') then
    raise exception 'Session cascade failed';
  end if;
end $$;
reset role;
rollback;
