-- Direct Telegram webhook execution.
-- This migration intentionally removes the old durable-job/edge-idempotency objects.

create extension if not exists pgcrypto;

create table if not exists public.cp_telegram_updates (
  update_id bigint primary key,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  attempts integer not null default 1,
  locked_until timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cp_telegram_updates_status_idx
  on public.cp_telegram_updates(status, locked_until);

alter table public.cp_telegram_updates enable row level security;

revoke all on table public.cp_telegram_updates from anon, authenticated;
grant all on table public.cp_telegram_updates to service_role;

create or replace function public.cp_claim_telegram_update(
  p_update_id bigint,
  p_lease_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cp_telegram_updates(update_id,status,attempts,locked_until)
  values (
    p_update_id,
    'processing',
    1,
    now() + make_interval(secs => greatest(10, least(p_lease_seconds, 300)))
  )
  on conflict (update_id) do nothing;

  if found then
    return true;
  end if;

  update public.cp_telegram_updates
  set status = 'processing',
      attempts = attempts + 1,
      locked_until = now() + make_interval(secs => greatest(10, least(p_lease_seconds, 300))),
      updated_at = now()
  where update_id = p_update_id
    and (
      status = 'failed'
      or (status = 'processing' and locked_until is not null and locked_until < now())
    );

  return found;
end;
$$;

create or replace function public.cp_complete_telegram_update(
  p_update_id bigint,
  p_success boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cp_telegram_updates
  set status = case when p_success then 'completed' else 'failed' end,
      processed_at = case when p_success then now() else processed_at end,
      locked_until = null,
      last_error = case
        when p_success then null
        else left(coalesce(p_error, 'Unknown error'), 2000)
      end,
      updated_at = now()
  where update_id = p_update_id;

  return found;
end;
$$;

revoke all on function public.cp_claim_telegram_update(bigint, integer) from public, anon, authenticated;
revoke all on function public.cp_complete_telegram_update(bigint, boolean, text) from public, anon, authenticated;

grant execute on function public.cp_claim_telegram_update(bigint, integer) to service_role;
grant execute on function public.cp_complete_telegram_update(bigint, boolean, text) to service_role;

drop function if exists public.cp_edge_accept(text,text,text,text,jsonb,integer);
drop function if exists public.cp_claim_durable_jobs(integer,integer);
drop function if exists public.cp_claim_durable_jobs(integer,integer,integer,integer);
drop function if exists public.cp_complete_durable_job(uuid,boolean,jsonb,text,integer);
drop function if exists public.cp_complete_durable_job(uuid,boolean,jsonb,text,integer,uuid,boolean,jsonb,text,integer);

drop table if exists public.cp_durable_jobs;
drop table if exists public.cp_edge_idempotency;
