create extension if not exists pgcrypto;

create table if not exists public.cp_users (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null unique,
  username text,
  display_name text,
  experience text not null default 'beginner' check (experience in ('beginner','intermediate','advanced')),
  risk_profile text not null default 'beginner' check (risk_profile in ('beginner','balanced','advanced')),
  base_currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cp_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.cp_users(id) on delete cascade,
  symbol text not null,
  condition text not null check (condition in ('above','below','change24h')),
  threshold numeric not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.cp_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.cp_users(id) on delete cascade,
  plan text not null,
  status text not null check (status in ('active','expired','cancelled','pending')),
  telegram_payment_charge_id text unique,
  provider_payment_charge_id text,
  started_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.cp_market_snapshots (
  id bigint generated always as identity primary key,
  symbol text not null,
  price numeric not null,
  change24h numeric not null default 0,
  volume24h numeric not null default 0,
  observed_at timestamptz not null default now()
);

create index if not exists cp_alerts_active_idx on public.cp_alerts(active, symbol);
create index if not exists cp_market_snapshots_symbol_time_idx on public.cp_market_snapshots(symbol, observed_at desc);

alter table public.cp_users enable row level security;
alter table public.cp_alerts enable row level security;
alter table public.cp_subscriptions enable row level security;
alter table public.cp_market_snapshots enable row level security;

-- Bot service uses the server-side service role. No anonymous client access is granted.
