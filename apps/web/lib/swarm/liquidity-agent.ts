import { runMarketData } from './market-agent-data';
import type { AgentFinding, SwarmContext } from './types';

export async function runLiquidityAgent(context: SwarmContext): Promise<AgentFinding> {
  const snapshots = await runMarketData(context.symbols);
  if (!snapshots.length) {
    return { agent: 'liquidity', status: 'unavailable', title: 'Liquidity evidence unavailable', details: ['No market snapshot was returned.'], evidence: {} };
  }
  const details = snapshots.map((item) => `${item.symbol}: 24h volume $${item.volume24h.toLocaleString()} | 24h move ${item.change24h.toFixed(2)}%.`);
  return {
    agent: 'liquidity',
    status: 'partial',
    score: Math.min(100, Math.round(snapshots.reduce((sum, item) => sum + Math.log10(Math.max(item.volume24h, 1)), 0) / snapshots.length * 12)),
    title: 'Market-liquidity proxy evaluated',
    details: [...details, 'This is a market-volume proxy, not order-book depth or executable route liquidity.'],
    evidence: { assets: snapshots.length, source: 'CoinMarketCap quotes' },
  };
}
