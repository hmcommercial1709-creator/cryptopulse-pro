-- CryptoPulse multi-user trading vault.
-- API credentials are encrypted before insertion; plaintext secrets never belong in this database.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null unique,
  locale text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exchange_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  exchange text not null check (exchange in ('binance','bybit','okx','kraken')),
  api_key_ciphertext text not null,
  api_secret_ciphertext text not null,
  passphrase_ciphertext text,
  api_key_iv text not null,
  api_secret_iv text not null,
  passphrase_iv text,
  api_key_tag text not null,
  api_secret_tag text not null,
  passphrase_tag text,
  key_version text not null default 'v1',
  live_enabled boolean not null default false,
  last_validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, exchange)
);

create table if not exists public.trade_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  default_quote_amount numeric,
  max_positions integer not null default 3,
  stop_loss_pct numeric,
  take_profit_pct numeric,
  trailing_stop_pct numeric,
  auto_trading_enabled boolean not null default false,
  strategy_id text,
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  connection_id uuid not null references public.exchange_connections(id) on delete cascade,
  exchange_order_id text,
  symbol text not null,
  side text not null check (side in ('BUY','SELL')),
  order_type text not null,
  quantity numeric not null,
  requested_price numeric,
  executed_quantity numeric,
  average_price numeric,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  symbol text not null,
  condition text not null,
  threshold numeric not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.exchange_connections enable row level security;
alter table public.trade_preferences enable row level security;
alter table public.orders enable row level security;
alter table public.alerts enable row level security;

-- Server-side service role is the only actor that should read/write exchange secrets.
-- No client policy is created for exchange_connections by design.
