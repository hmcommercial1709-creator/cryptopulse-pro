-- CryptoPulse Pro: Edge-native durable execution primitives
-- Apply this migration to the dedicated CryptoPulse Supabase project.

create extension if not exists pgcrypto;

create table if not exists public.cp_edge_idempotency (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  operation text not null,
  actor_key text,
  status text not null default 'accepted' check (status in ('accepted','processing','completed','failed')),
  result jsonb,
  attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cp_edge_idempotency_status_idx
  on public.cp_edge_idempotency(status, locked_until);

create table if not exists public.cp_durable_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null unique,
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 8,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cp_durable_jobs_claim_idx
  on public.cp_durable_jobs(status, next_attempt_at, locked_until);

create or replace function public.cp_edge_accept(
  p_idempotency_key text,
  p_operation text,
  p_actor_key text,
  p_job_type text,
  p_payload jsonb,
  p_max_attempts integer default 8
)
returns table(accepted boolean, idempotency_id uuid, job_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_job_id uuid;
begin
  insert into cp_edge_idempotency(idempotency_key, operation, actor_key, status)
  values (p_idempotency_key, p_operation, p_actor_key, 'accepted')
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from cp_edge_idempotency
    where idempotency_key = p_idempotency_key
    limit 1;
    return query select false, v_id, null::uuid;
    return;
  end if;

  insert into cp_durable_jobs(job_key, job_type, payload, max_attempts)
  values (p_idempotency_key, p_job_type, coalesce(p_payload, '{}'::jsonb), greatest(1, least(p_max_attempts, 32)))
  returning id into v_job_id;

  update cp_edge_idempotency
  set status = 'processing', updated_at = now()
  where id = v_id;

  return query select true, v_id, v_job_id;
end;
$$;

create or replace function public.cp_claim_durable_jobs(
  p_limit integer default 20,
  p_lease_seconds integer default 30
)
returns setof public.cp_durable_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from cp_durable_jobs
    where (
      status = 'queued'
      or (status = 'processing' and locked_until is not null and locked_until < now())
    )
    and next_attempt_at <= now()
    order by created_at
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  )
  update cp_durable_jobs j
  set status = 'processing',
      attempts = j.attempts + 1,
      locked_until = now() + make_interval(secs => greatest(5, least(p_lease_seconds, 300))),
      updated_at = now()
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;

create or replace function public.cp_complete_durable_job(
  p_job_id uuid,
  p_success boolean,
  p_error text default null,
  p_backoff_seconds integer default 0,
  p_result jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_attempts integer;
  v_max integer;
begin
  select status, attempts, max_attempts
    into v_status, v_attempts, v_max
  from cp_durable_jobs
  where id = p_job_id
  for update;

  if not found then return false; end if;

  if p_success then
    update cp_durable_jobs
    set status='completed', locked_until=null, last_error=null, updated_at=now()
    where id=p_job_id;
    update cp_edge_idempotency
    set status='completed', result=coalesce(p_result, result), updated_at=now()
    where id=(select id from cp_edge_idempotency where idempotency_key=(select job_key from cp_durable_jobs where id=p_job_id));
    return true;
  end if;

  if v_attempts >= v_max then
    update cp_durable_jobs
    set status='failed', locked_until=null, last_error=left(coalesce(p_error,'unknown error'), 2000), updated_at=now()
    where id=p_job_id;
    update cp_edge_idempotency
    set status='failed', updated_at=now()
    where id=(select id from cp_edge_idempotency where idempotency_key=(select job_key from cp_durable_jobs where id=p_job_id));
  else
    update cp_durable_jobs
    set status='queued', locked_until=null,
        next_attempt_at=now()+make_interval(secs => greatest(1, least(p_backoff_seconds, 3600))),
        last_error=left(coalesce(p_error,'unknown error'), 2000), updated_at=now()
    where id=p_job_id;
  end if;

  return true;
end;
$$;

revoke all on function public.cp_edge_accept(text,text,text,text,jsonb,integer) from public, anon, authenticated;
revoke all on function public.cp_claim_durable_jobs(integer,integer) from public, anon, authenticated;
revoke all on function public.cp_complete_durable_job(uuid,boolean,text,integer,jsonb) from public, anon, authenticated;

grant execute on function public.cp_edge_accept(text,text,text,text,jsonb,integer) to service_role;
grant execute on function public.cp_claim_durable_jobs(integer,integer) to service_role;
grant execute on function public.cp_complete_durable_job(uuid,boolean,text,integer,jsonb) to service_role;
