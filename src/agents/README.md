# CryptoPulse Agent Layer

The agent layer is analysis-only. Agents never hold keys, sign transactions, or call an execution connector.

`committee.ts` aggregates Risk, Liquidity, and Momentum results into a `CommitteeReport`. Liquidity explicitly reports when pool/order-book depth data is unavailable rather than inferring it from 24h volume.
