import { runMarketData } from './market-agent-data';
import type { AgentFinding, SwarmContext } from './types';

const DEFAULT_SLIPPAGE_BPS = 50;
const MAX_SLIPPAGE_BPS = 300;

export async function runExecutionAgent(context: SwarmContext): Promise<AgentFinding> {
  const snapshots = await runMarketData(context.symbols);
  if (!snapshots.length) return { agent: 'execution', status: 'unavailable', title: 'Execution preparation unavailable', details: ['No live market snapshot was returned.'], evidence: {} };
  const requestedBps = Number(process.env.EXECUTION_DEFAULT_SLIPPAGE_BPS ?? DEFAULT_SLIPPAGE_BPS);
  const slippageBps = Math.min(MAX_SLIPPAGE_BPS, Math.max(1, Number.isFinite(requestedBps) ? requestedBps : DEFAULT_SLIPPAGE_BPS));
  const details = snapshots.map((item) => {
    const low = item.price * (1 - slippageBps / 10_000);
    const high = item.price * (1 + slippageBps / 10_000);
    return `${item.symbol}: reference $${item.price.toLocaleString()} · indicative ${slippageBps} bps band $${low.toFixed(4)}–$${high.toFixed(4)}.`;
  });
  return {
    agent: 'execution',
    status: 'partial',
    score: 100 - Math.round(slippageBps / 3),
    title: 'Execution window prepared; wallet/route still required',
    details: [...details, 'The agent does not sign or broadcast transactions. A connected execution venue and explicit wallet approval are required.'],
    evidence: { slippageBps, amountUsd: context.amountUsd ?? null, venue: null },
  };
}
