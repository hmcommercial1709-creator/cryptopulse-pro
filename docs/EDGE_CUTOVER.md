# CryptoPulse Pro — Edge Cutover

## Primary runtime
- Telegram webhook: Cloudflare Worker `cryptopulse-pro-edge`
- Mini App: Cloudflare Workers via OpenNext
- Distributed idempotency + durable queue: dedicated Supabase project
- Recovery: Supabase lease expiry + automatic exponential backoff + Cloudflare Cron drain

## Required secrets
Set these in the Cloudflare Worker:
- `BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`

Variables:
- `SUPABASE_URL`
- `MINI_APP_URL`

## Database
Apply:
`supabase/migrations/20260918_edge_durable_execution.sql`

## Deployment
1. Deploy `cryptopulse-pro-edge` with `wrangler deploy --config wrangler.toml`.
2. Deploy the Mini App from `apps/web` with `npm run deploy:edge`.
3. Point Telegram's webhook to the deployed Edge Worker URL.
4. Keep Railway only as a rollback/fallback until the Edge webhook and Mini App have passed production smoke tests.
5. After verification, remove the old Telegram webhook/gateway path from production traffic.

## Safety property
Telegram retries do not create duplicate durable jobs because `cp_edge_accept` uses a unique idempotency key transactionally. Claimed jobs have leases; an interrupted worker leaves the job reclaimable after the lease expires. Failed jobs use bounded exponential backoff until `max_attempts`.
