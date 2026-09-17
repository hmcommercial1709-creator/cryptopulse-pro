create table if not exists public.cp_request_idempotency (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references public.cp_users(id) on delete cascade,
  telegram_user_id bigint not null,
  idempotency_key text not null,
  fingerprint text not null,
  response_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (telegram_user_id, idempotency_key)
);

create index if not exists cp_request_idempotency_created_idx on public.cp_request_idempotency(created_at desc);
alter table public.cp_request_idempotency enable row level security;
revoke all on public.cp_request_idempotency from anon, authenticated;
grant all on public.cp_request_idempotency to service_role;

create table if not exists public.cp_execution_audit (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  idempotency_key text not null,
  action text not null,
  status text not null,
  venue text,
  chain text,
  asset text,
  amount_usd numeric,
  tx_hash text,
  created_at timestamptz not null default now()
);

create index if not exists cp_execution_audit_user_created_idx on public.cp_execution_audit(telegram_user_id, created_at desc);
alter table public.cp_execution_audit enable row level security;
revoke all on public.cp_execution_audit from anon, authenticated;
grant all on public.cp_execution_audit to service_role;
