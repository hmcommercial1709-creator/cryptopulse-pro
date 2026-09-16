import type { MarketSnapshot } from './domain.js';

const BINANCE_MARKET_URL = 'https://data-api.binance.vision/api/v3/ticker/24hr';

const symbolMap: Record<string, string> = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT',
};

interface BinanceTicker {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  volume: string;
  closeTime: number;
}

export async function getMarketSnapshot(symbol: string): Promise<MarketSnapshot> {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pair = symbolMap[normalized] ?? `${normalized}USDT`;
  const url = `${BINANCE_MARKET_URL}?symbol=${encodeURIComponent(pair)}`;

  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Binance market data request failed: HTTP ${response.status}`);
  }

  const ticker = (await response.json()) as BinanceTicker;
  const price = Number(ticker.lastPrice);
  const change24h = Number(ticker.priceChangePercent);
  const volume24h = Number(ticker.volume);

  if (!Number.isFinite(price)) throw new Error(`Invalid Binance price for ${pair}`);

  return {
    symbol: normalized,
    price,
    change24h: Number.isFinite(change24h) ? change24h : 0,
    volume24h: Number.isFinite(volume24h) ? volume24h : 0,
    updatedAt: new Date(ticker.closeTime || Date.now()).toISOString(),
  };
}
