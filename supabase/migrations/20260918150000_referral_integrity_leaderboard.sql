-- Referral integrity, risk scoring and leaderboard for CryptoPulse Pro.
alter table public.cp_referral_commissions
  add column if not exists risk_score integer not null default 0 check (risk_score between 0 and 100),
  add column if not exists eligibility_status text not null default 'eligible'
    check (eligibility_status in ('eligible','review','blocked','reversed')),
  add column if not exists hold_until timestamptz,
  add column if not exists risk_reasons jsonb not null default '[]'::jsonb,
  add column if not exists reviewed_at timestamptz;

create index if not exists cp_referral_commissions_leaderboard_idx
  on public.cp_referral_commissions(referrer_user_id, eligibility_status, status, created_at desc);

create table if not exists public.cp_referral_risk_events (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid references public.cp_users(id) on delete cascade,
  referred_user_id uuid references public.cp_users(id) on delete cascade,
  payment_id uuid references public.cp_stars_payments(id) on delete set null,
  risk_score integer not null check (risk_score between 0 and 100),
  decision text not null check (decision in ('clear','review','blocked')),
  reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cp_referral_risk_events_referrer_idx on public.cp_referral_risk_events(referrer_user_id, created_at desc);
create index if not exists cp_referral_risk_events_payment_idx on public.cp_referral_risk_events(payment_id);
alter table public.cp_referral_risk_events enable row level security;
revoke all on public.cp_referral_risk_events from anon, authenticated;
grant all on public.cp_referral_risk_events to service_role;

create or replace view public.cp_referral_leaderboard as
select c.referrer_user_id as user_id,u.telegram_user_id,u.username,u.display_name,
 count(distinct c.referred_user_id)::bigint as qualifying_paid_users,
 coalesce(sum(c.commission_stars) filter (where c.status <> 'reversed' and c.eligibility_status='eligible'),0)::bigint as accrued_stars,
 row_number() over(order by count(distinct c.referred_user_id) desc,coalesce(sum(c.commission_stars) filter (where c.status <> 'reversed' and c.eligibility_status='eligible'),0) desc,min(c.created_at))::bigint as rank
from public.cp_referral_commissions c join public.cp_users u on u.id=c.referrer_user_id
where c.status <> 'reversed' and c.eligibility_status='eligible'
group by c.referrer_user_id,u.telegram_user_id,u.username,u.display_name;

revoke all on public.cp_referral_leaderboard from anon, authenticated;
grant select on public.cp_referral_leaderboard to service_role;