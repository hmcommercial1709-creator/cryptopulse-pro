-- Global Mega-Viral milestone catalog.
-- Thresholds are unbounded by application logic; this catalog provides strategic
-- milestones through 100M qualifying paid referrals. Commission rates remain
-- constrained by the actual Telegram affiliate program configuration.

insert into public.cp_referral_reward_levels (paid_users_threshold, reward_stars)
values
  (1000, 5000),
  (10000, 100000),
  (100000, 1000000),
  (1000000, 10000000),
  (10000000, 100000000),
  (100000000, 1000000000)
on conflict (paid_users_threshold) do update
set reward_stars = excluded.reward_stars;

-- Optional CryptoPulse VIP revenue-share tiers. These are internal program
-- targets and MUST NOT be represented as Telegram's native commission rate.
create table if not exists public.cp_referral_vip_tiers (
  id bigserial primary key,
  paid_users_threshold bigint not null unique check (paid_users_threshold > 0),
  title text not null,
  internal_share_permille integer not null check (internal_share_permille between 0 and 250),
  created_at timestamptz not null default now()
);

insert into public.cp_referral_vip_tiers (paid_users_threshold,title,internal_share_permille)
values
  (1000,'VIP',50),
  (10000,'Royal',100),
  (100000,'Imperial',150),
  (1000000,'Global Legend',200),
  (10000000,'Global Empire',225),
  (100000000,'Mega Empire',250)
on conflict (paid_users_threshold) do update
set title=excluded.title, internal_share_permille=excluded.internal_share_permille;

alter table public.cp_referral_vip_tiers enable row level security;
revoke all on public.cp_referral_vip_tiers from anon, authenticated;
grant all on public.cp_referral_vip_tiers to service_role;

create index if not exists cp_referral_vip_tiers_threshold_idx
on public.cp_referral_vip_tiers(paid_users_threshold);
