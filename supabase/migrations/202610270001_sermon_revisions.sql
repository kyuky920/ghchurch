begin;

-- sermon_id is text so this works with existing UUID or numeric sermon IDs.
-- Source snapshots and editor instructions are only accessible through the leader API.
create table public.sermon_revision_requests (
  id uuid primary key,
  sermon_id text not null,
  target text not null,
  instruction text not null check (length(instruction) between 1 and 2000),
  base_snapshot jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','ready','failed','applied','discarded')),
  proposal jsonb,
  error_msg text,
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index sermon_revision_one_active on public.sermon_revision_requests(sermon_id) where status in ('pending','processing','ready');
create index sermon_revision_queue on public.sermon_revision_requests(status, created_at);
create index sermon_revision_history on public.sermon_revision_requests(sermon_id, created_at desc);
alter table public.sermon_revision_requests enable row level security;
revoke all on public.sermon_revision_requests from public, anon, authenticated;
grant select, insert, update, delete on public.sermon_revision_requests to service_role;

create function public.apply_sermon_revision(p_request_id uuid, p_update jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  request public.sermon_revision_requests;
  current_row public.sermons;
  replacement public.sermons;
  current_snapshot jsonb;
begin
  select * into request from public.sermon_revision_requests where id = p_request_id for update;
  if not found or request.status <> 'ready' or request.proposal->'review'->>'status' is distinct from 'passed' then
    raise exception 'request is not ready' using errcode = '40001';
  end if;
  select * into current_row from public.sermons where id::text = request.sermon_id for update;
  if not found then raise exception 'sermon removed' using errcode = '40001'; end if;
  current_snapshot := jsonb_build_object(
    'week',current_row.week,'service',current_row.service,'reference',current_row.reference,
    'sermon_title',current_row.sermon_title,'passage',current_row.passage,'sermon_points',current_row.sermon_points,
    'sermon_summary',current_row.sermon_summary,'questions',current_row.questions,'status',current_row.status
  );
  if current_snapshot is distinct from request.base_snapshot then
    raise exception 'source or content changed' using errcode = '40001';
  end if;
  -- Populate through the existing row type: compatible with text and JSON columns.
  replacement := jsonb_populate_record(current_row, p_update);
  update public.sermons set questions = replacement.questions,
    sermon_summary = replacement.sermon_summary, updated_at = replacement.updated_at
    where id = current_row.id;
  update public.sermon_revision_requests set status = 'applied', updated_at = now(), lease_token = null, lease_expires_at = null where id = p_request_id;
  return jsonb_build_object('id',p_request_id,'status','applied');
end;
$$;
revoke all on function public.apply_sermon_revision(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.apply_sermon_revision(uuid,jsonb) to service_role;
commit;
