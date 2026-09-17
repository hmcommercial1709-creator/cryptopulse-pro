import type { MarketSnapshot } from './domain.js';
import { config } from './config.js';

const CMC_QUOTES_URL = 'https://pro-api.coinmarketcap.com/v3/cryptocurrency/quotes/latest';

// Stable CoinMarketCap IDs for the core assets. Unknown assets fall back to symbol lookup.
const coinIds: Record<string, number> = {
  BTC: 1,
  ETH: 1027,
  SOL: 5426,
};

interface CmcQuote {
  id: number;
  name: string;
  symbol: string;
  quote?: {
    USD?: {
      price?: number;
      volume_24h?: number;
      percent_change_24h?: number;
      last_updated?: string;
    };
  };
}

interface CmcResponse {
  data?: Record<string, CmcQuote>;
  status?: { error_code?: number; error_message?: string };
}

export async function getMarketSnapshot(symbol: string): Promise<MarketSnapshot> {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!normalized) throw new Error('Invalid market symbol');

  const params = new URLSearchParams({ convert: 'USD' });
  const id = coinIds[normalized];
  if (id) params.set('id', String(id));
  else params.set('symbol', normalized);

  const headers: Record<string, string> = { accept: 'application/json' };
  if (config.marketApiKey) headers['X-CMC_PRO_API_KEY'] = config.marketApiKey;

  const response = await fetch(`${CMC_QUOTES_URL}?${params.toString()}`, { headers });
  if (!response.ok) {
    throw new Error(`CoinMarketCap market data request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as CmcResponse;
  if (payload.status?.error_code) {
    throw new Error(`CoinMarketCap API error ${payload.status.error_code}: ${payload.status.error_message ?? 'Unknown error'}`);
  }

  const quote = Object.values(payload.data ?? {})[0];
  const usd = quote?.quote?.USD;
  const price = Number(usd?.price);
  const change24h = Number(usd?.percent_change_24h);
  const volume24h = Number(usd?.volume_24h);

  if (!Number.isFinite(price)) {
    throw new Error(`CoinMarketCap returned no valid USD price for ${normalized}`);
  }

  return {
    symbol: quote?.symbol ?? normalized,
    price,
    change24h: Number.isFinite(change24h) ? change24h : 0,
    volume24h: Number.isFinite(volume24h) ? volume24h : 0,
    updatedAt: usd?.last_updated ?? new Date().toISOString(),
  };
}
