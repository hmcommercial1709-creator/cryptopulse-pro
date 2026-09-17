create table if not exists public.cp_watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.cp_users(id) on delete cascade,
  symbol text not null,
  created_at timestamptz not null default now(),
  constraint cp_watchlist_items_symbol_check check (symbol ~ '^[A-Z0-9]{2,20}$'),
  constraint cp_watchlist_items_user_symbol_unique unique (user_id, symbol)
);

create index if not exists cp_watchlist_items_user_created_idx on public.cp_watchlist_items(user_id, created_at desc);
create index if not exists cp_alerts_user_active_idx on public.cp_alerts(user_id, active, created_at desc);

alter table public.cp_watchlist_items enable row level security;
drop policy if exists cp_watchlist_items_service_only on public.cp_watchlist_items;
create policy cp_watchlist_items_service_only on public.cp_watchlist_items for all to service_role using (true) with check (true);

revoke all on table public.cp_watchlist_items from anon, authenticated;
grant all on table public.cp_watchlist_items to service_role;

revoke all on table public.cp_alerts from anon, authenticated;
grant all on table public.cp_alerts to service_role;
revoke all on table public.cp_users from anon, authenticated;
grant all on table public.cp_users to service_role;
revoke all on table public.cp_growth_events from anon, authenticated;
grant all on table public.cp_growth_events to service_role;
revoke all on table public.cp_referrals from anon, authenticated;
grant all on table public.cp_referrals to service_role;
revoke all on table public.cp_share_cards from anon, authenticated;
grant all on table public.cp_share_cards to service_role;
