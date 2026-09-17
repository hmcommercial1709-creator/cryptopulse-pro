create policy cp_growth_events_service_only on public.cp_growth_events for all to service_role using (true) with check (true);
create policy cp_inline_queries_service_only on public.cp_inline_queries for all to service_role using (true) with check (true);
create policy cp_referrals_service_only on public.cp_referrals for all to service_role using (true) with check (true);
create policy cp_share_cards_service_only on public.cp_share_cards for all to service_role using (true) with check (true);
