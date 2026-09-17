alter table public.cp_orders add column if not exists idempotency_key text;
alter table public.cp_orders add column if not exists idempotency_fingerprint text;
create unique index if not exists cp_orders_user_idempotency_unique on public.cp_orders(user_id, idempotency_key) where idempotency_key is not null;
create index if not exists cp_orders_user_created_idx on public.cp_orders(user_id, created_at desc);
