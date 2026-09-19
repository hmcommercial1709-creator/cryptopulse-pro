-- Keep application data inaccessible through public PostgREST roles.
-- CryptoPulse server routes use the Supabase service role, which bypasses RLS.
alter table public.cp_user_preferences enable row level security;
alter table public.cp_subscription_plans enable row level security;
alter table public.cp_agent_tasks enable row level security;
alter table public.cp_trading_connections enable row level security;

-- Cover foreign-key lookups identified by Supabase performance advisor.
create index if not exists cp_referral_reward_claims_paid_users_threshold_idx
  on public.cp_referral_reward_claims (paid_users_threshold);

create index if not exists cp_referral_risk_events_referred_user_id_idx
  on public.cp_referral_risk_events (referred_user_id);

-- Keep the unique user subscription index; remove the redundant duplicate.
drop index if exists public.cp_subscriptions_user_idx;
