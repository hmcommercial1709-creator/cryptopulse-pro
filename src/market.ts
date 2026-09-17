import type { MarketSnapshot } from './domain.js';
import { config } from './config.js';

const CMC_QUOTES_URL = 'https://pro-api.coinmarketcap.com/v3/cryptocurrency/quotes/latest';
const REQUEST_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 45_000;

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

const cache = new Map<string, { value: MarketSnapshot; expiresAt: number }>();

function normalizeSymbol(symbol: string): string {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!normalized) throw new Error('Invalid market symbol');
  return normalized;
}

function requestHeaders(): Record<string, string> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (config.marketApiKey) headers['X-CMC_PRO_API_KEY'] = config.marketApiKey;
  return headers;
}

function toSnapshot(requested: string, quote: CmcQuote | undefined): MarketSnapshot {
  const usd = quote?.quote?.USD;
  const price = Number(usd?.price);
  const change24h = Number(usd?.percent_change_24h);
  const volume24h = Number(usd?.volume_24h);
  if (!Number.isFinite(price)) throw new Error(`CoinMarketCap returned no valid USD price for ${requested}`);

  return {
    symbol: quote?.symbol ?? requested,
    price,
    change24h: Number.isFinite(change24h) ? change24h : 0,
    volume24h: Number.isFinite(volume24h) ? volume24h : 0,
    updatedAt: usd?.last_updated ?? new Date().toISOString(),
  };
}

async function fetchQuotes(symbols: string[]): Promise<Map<string, MarketSnapshot>> {
  const normalized = [...new Set(symbols.map(normalizeSymbol))];
  const allKnown = normalized.every((symbol) => Boolean(coinIds[symbol]));
  const params = new URLSearchParams({ convert: 'USD' });

  if (allKnown) params.set('id', normalized.map((symbol) => coinIds[symbol]).join(','));
  else params.set('symbol', normalized.join(','));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${CMC_QUOTES_URL}?${params.toString()}`, {
      headers: requestHeaders(),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`CoinMarketCap market data request failed: HTTP ${response.status}`);

    const payload = (await response.json()) as CmcResponse;
    if (payload.status?.error_code) {
      throw new Error(`CoinMarketCap API error ${payload.status.error_code}: ${payload.status.error_message ?? 'Unknown error'}`);
    }

    const result = new Map<string, MarketSnapshot>();
    for (const quote of Object.values(payload.data ?? {})) {
      const snapshot = toSnapshot(quote.symbol, quote);
      result.set(snapshot.symbol.toUpperCase(), snapshot);
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

export async function getMarketSnapshots(symbols: string[]): Promise<MarketSnapshot[]> {
  const normalized = [...new Set(symbols.map(normalizeSymbol))];
  const now = Date.now();
  const result = new Map<string, MarketSnapshot>();
  const missing: string[] = [];

  for (const symbol of normalized) {
    const cached = cache.get(symbol);
    if (cached && cached.expiresAt > now) result.set(symbol, cached.value);
    else missing.push(symbol);
  }

  if (missing.length > 0) {
    const fetched = await fetchQuotes(missing);
    for (const symbol of missing) {
      const snapshot = fetched.get(symbol);
      if (!snapshot) throw new Error(`CoinMarketCap returned no quote for ${symbol}`);
      cache.set(symbol, { value: snapshot, expiresAt: now + CACHE_TTL_MS });
      result.set(symbol, snapshot);
    }
  }

  return normalized.map((symbol) => result.get(symbol)!).filter(Boolean);
}

export async function getMarketSnapshot(symbol: string): Promise<MarketSnapshot> {
  const [snapshot] = await getMarketSnapshots([symbol]);
  return snapshot;
}
