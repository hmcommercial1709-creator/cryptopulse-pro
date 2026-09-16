# CryptoPulse Pro — Product Spec

## Core promise
Make crypto market information understandable and actionable for a complete beginner without pretending that any trade is guaranteed to profit.

## User journey
1. Start bot.
2. Choose experience level.
3. Choose asset.
4. See a current market snapshot.
5. Review trend, volatility, momentum, support/resistance and volume context.
6. Choose a risk profile.
7. See an educational trade plan and maximum-loss calculation.
8. Create optional alerts.
9. Review the complete plan before any execution.
10. Use paper trading before connecting real funds.

## Analysis engine
The analysis engine combines independent evidence rather than pretending to predict outcomes:
- RSI, MACD, EMA/SMA, ATR and volatility regime.
- Recent support/resistance levels.
- Trend and momentum context.
- Explicit risk flags when data is missing, volatile or conflicting.
- `noTrade` state when evidence is insufficient or the market is neutral.
- Transparent evidence score; it is not a probability of profit.

## Data architecture
- Provider-agnostic market adapter interface.
- Normalized candles and market snapshots.
- Historical snapshots persisted in Supabase.
- Caching and rate-limit protection before high-frequency polling.
- Provider credentials stored only in deployment secrets.

## Beginner UX
Every technical metric must have a one-line explanation and a plain-language interpretation. The user should be able to ask “What does this mean?” at every important step.

## Alerts
- Price above threshold.
- Price below threshold.
- Absolute 24h percentage change threshold.
- Active/inactive state.
- Persistent user ownership in Supabase.
- Future worker evaluates due alerts and sends Telegram notifications.

## Monetization
- Free market information and limited alerts.
- Premium analytics and higher alert limits.
- Telegram Stars for Telegram digital services.
- Clear subscription status and `/paysupport` support flow.
- No deceptive urgency or guaranteed-profit messaging.

## Execution safety
- Paper trading first.
- Exchange connectors use least-privilege credentials.
- Withdrawals disabled by default.
- Never commit API keys or exchange secrets.
- Explicit confirmation before any real-money action.
- Keep execution separate from the analysis engine.

## SEO web platform
- Server-rendered pages.
- Quality-controlled asset pages instead of mass-generated thin pages.
- Educational hubs, glossary, calculators and factual comparison pages.
- FAQ/HowTo structured data only where the content qualifies.
- Canonical URLs, XML sitemap and robots rules.
- Strong internal linking graph.
- Fast mobile-first rendering.
- Telegram deep links for relevant market pages and alerts.

## Production gates
A feature is not considered live until it has:
1. TypeScript checks passing.
2. Automated tests passing.
3. Required environment variables documented.
4. Database schema verified.
5. Runtime deployment configured.
6. End-to-end Telegram testing completed.
7. Logs and failure handling verified.
