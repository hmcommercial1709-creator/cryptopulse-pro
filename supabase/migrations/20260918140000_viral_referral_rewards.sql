-- Viral affiliate/referral rewards ledger for CryptoPulse Pro.
-- Telegram's native Mini App affiliate program is separate; this table records
-- CryptoPulse's own validated reward accruals so payout can be audited and controlled.

create table if not exists public.cp_referral_commissions (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references public.cp_users(id) on delete cascade,
  referred_user_id uuid not null references public.cp_users(id) on delete cascade,
  payment_id uuid not null unique references public.cp_stars_payments(id) on delete cascade,
  payment_stars bigint not null check (payment_stars > 0),
  commission_permille integer not null check (commission_permille >= 0 and commission_permille <= 1000),
  commission_stars bigint not null check (commission_stars >= 0),
  status text not null default 'accrued' check (status in ('accrued','approved','paid','reversed')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  paid_at timestamptz
);

create index if not exists cp_referral_commissions_referrer_created_idx
  on public.cp_referral_commissions(referrer_user_id, created_at desc);

create index if not exists cp_referral_commissions_referred_idx
  on public.cp_referral_commissions(referred_user_id);

alter table public.cp_referral_commissions enable row level security;
revoke all on public.cp_referral_commissions from anon, authenticated;
grant all on public.cp_referral_commissions to service_role;

-- Configurable viral milestones. Existing rows are preserved and the smaller
-- milestones are added only when missing.
insert into public.cp_referral_reward_levels (paid_users_threshold, reward_stars)
values
  (10, 50),
  (100, 500)
on conflict (paid_users_threshold) do nothing;

-- Make the intended default rate explicit: 150‰ = 15%.
update public.cp_referral_program_config
set telegram_commission_permille = 150,
    updated_at = now()
where id = true
  and telegram_commission_permille is null;

