create table if not exists public.cp_exchange_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.cp_users(id) on delete cascade,
  exchange text not null check (exchange in ('bybit','binance','okx','kraken')),
  label text not null default 'Primary',
  api_key_ciphertext text not null,
  api_secret_ciphertext text not null,
  testnet boolean not null default true,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, exchange, label)
);

create table if not exists public.cp_auto_strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.cp_users(id) on delete cascade,
  name text not null,
  exchange_connection_id uuid references public.cp_exchange_connections(id) on delete cascade,
  mode text not null default 'paper' check (mode in ('paper','live')),
  enabled boolean not null default false,
  symbols text[] not null default '{}',
  risk_percent numeric not null default 0.5 check (risk_percent > 0 and risk_percent <= 5),
  max_open_positions integer not null default 3 check (max_open_positions between 1 and 50),
  max_daily_loss_percent numeric not null default 3 check (max_daily_loss_percent > 0 and max_daily_loss_percent <= 25),
  stop_loss_percent numeric not null default 1.5 check (stop_loss_percent > 0 and stop_loss_percent <= 20),
  take_profit_percent numeric not null default 3 check (take_profit_percent > 0 and take_profit_percent <= 50),
  emergency_stop boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cp_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.cp_users(id) on delete cascade,
  strategy_id uuid references public.cp_auto_strategies(id) on delete set null,
  exchange_connection_id uuid references public.cp_exchange_connections(id) on delete set null,
  mode text not null check (mode in ('paper','live')),
  exchange_order_id text,
  client_order_id text,
  symbol text not null,
  side text not null check (side in ('buy','sell')),
  order_type text not null check (order_type in ('market','limit')),
  quantity numeric not null check (quantity > 0),
  entry_price numeric,
  stop_loss numeric,
  take_profit numeric,
  status text not null default 'pending' check (status in ('pending','accepted','filled','cancelled','rejected','closed')),
  pnl numeric,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cp_exchange_connections_user_idx on public.cp_exchange_connections(user_id, enabled);
create index if not exists cp_auto_strategies_user_idx on public.cp_auto_strategies(user_id, enabled);
create index if not exists cp_orders_user_status_idx on public.cp_orders(user_id, status, created_at desc);

alter table public.cp_exchange_connections enable row level security;
alter table public.cp_auto_strategies enable row level security;
alter table public.cp_orders enable row level security;

-- Exchange credentials are encrypted by the bot before storage and are never exposed to Telegram clients.
