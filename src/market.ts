import type { MarketSnapshot } from './domain.js';

const demoPrices: Record<string, number> = {
  BTC: 65000,
  ETH: 2500,
  SOL: 150,
};

export async function getMarketSnapshot(symbol: string): Promise<MarketSnapshot> {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const price = demoPrices[normalized] ?? 100;
  return {
    symbol: normalized,
    price,
    change24h: 0,
    volume24h: 0,
    updatedAt: new Date().toISOString(),
  };
}
