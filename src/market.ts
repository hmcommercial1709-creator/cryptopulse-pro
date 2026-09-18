import type { MarketSnapshot } from './domain.js';
import { config } from './config.js';

const CMC_URL = 'https://pro-api.coinmarketcap.com/v3/cryptocurrency/quotes/latest';
const CG_URL = 'https://api.coingecko.com/api/v3/simple/price';
const REQUEST_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 45_000;
const STALE_CACHE_TTL_MS = 10 * 60_000;

const coinIds: Record<string, number> = { BTC: 1, ETH: 1027, SOL: 5426 };
const geckoIds: Record<string, string> = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana' };

type Cached = { value: MarketSnapshot; freshUntil: number; staleUntil: number };
const cache = new Map<string, Cached>();

function normalizeSymbol(symbol: string): string {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!normalized) throw new Error('Invalid market symbol');
  return normalized;
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`Market source HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function snapshot(symbol: string, price: unknown, change24h: unknown, volume24h: unknown, updatedAt?: unknown): MarketSnapshot {
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) throw new Error(`Invalid live price for ${symbol}`);
  const c = Number(change24h);
  const v = Number(volume24h);
  return {
    symbol,
    price: p,
    change24h: Number.isFinite(c) ? c : 0,
    volume24h: Number.isFinite(v) ? v : 0,
    updatedAt: typeof updatedAt === 'string' ? updatedAt : new Date().toISOString(),
  };
}

async function fetchCoinMarketCap(symbols: string[]): Promise<Map<string, MarketSnapshot>> {
  if (!config.marketApiKey) throw new Error('CoinMarketCap API key is not configured');
  const ids = symbols.filter(s => coinIds[s]).map(s => coinIds[s]).join(',');
  if (!ids) throw new Error('No supported CoinMarketCap symbols requested');
  const payload = await fetchJson(`${CMC_URL}?convert=USD&id=${ids}`, {
    headers: { accept: 'application/json', 'X-CMC_PRO_API_KEY': config.marketApiKey },
  });
  if (payload.status?.error_code) throw new Error(`CoinMarketCap ${payload.status.error_code}: ${payload.status.error_message ?? 'API error'}`);
  const result = new Map<string, MarketSnapshot>();
  for (const quote of Object.values<any>(payload.data ?? {})) {
    const s = normalizeSymbol(String(quote.symbol));
    result.set(s, snapshot(s, quote.quote?.USD?.price, quote.quote?.USD?.percent_change_24h, quote.quote?.USD?.volume_24h, quote.quote?.USD?.last_updated));
  }
  return result;
}

async function fetchCoinGecko(symbols: string[]): Promise<Map<string, MarketSnapshot>> {
  const supported = symbols.filter(s => geckoIds[s]);
  if (!supported.length) throw new Error('No supported CoinGecko symbols requested');
  const ids = supported.map(s => geckoIds[s]).join(',');
  const payload = await fetchJson(`${CG_URL}?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`, {
    headers: { accept: 'application/json' },
  });
  const result = new Map<string, MarketSnapshot>();
  for (const symbol of supported) {
    const row = payload[geckoIds[symbol]];
    if (!row) continue;
    result.set(symbol, snapshot(symbol, row.usd, row.usd_24h_change, row.usd_24h_vol));
  }
  if (!result.size) throw new Error('CoinGecko returned no usable market data');
  return result;
}

async function fetchSources(symbols: string[]): Promise<Map<string, MarketSnapshot>> {
  const result = new Map<string, MarketSnapshot>();
  const errors: string[] = [];

  // Query providers concurrently. A dead/slow provider must never block a healthy one
  // behind its full timeout. The first complete valid provider data wins per symbol.
  const settled = await Promise.allSettled([
    fetchCoinMarketCap(symbols),
    fetchCoinGecko(symbols),
  ]);

  for (const item of settled) {
    if (item.status === 'fulfilled') {
      for (const [symbol, value] of item.value) {
        if (!result.has(symbol)) result.set(symbol, value);
      }
    } else {
      errors.push(item.reason instanceof Error ? item.reason.message : String(item.reason));
    }
  }

  if (!result.size) throw new Error(`All market providers failed: ${errors.join(' | ')}`);
  return result;
}

export async function getMarketSnapshots(symbols: string[]): Promise<MarketSnapshot[]> {
  const normalized = [...new Set(symbols.map(normalizeSymbol))];
  if (!normalized.length) return [];
  const now = Date.now();
  const result = new Map<string, MarketSnapshot>();
  const missing: string[] = [];

  for (const symbol of normalized) {
    const cached = cache.get(symbol);
    if (cached && cached.freshUntil > now) result.set(symbol, cached.value);
    else missing.push(symbol);
  }

  if (missing.length) {
    const staleSymbols = missing.filter((symbol) => {
      const cached = cache.get(symbol);
      return Boolean(cached && cached.staleUntil > now);
    });
    const coldSymbols = missing.filter((symbol) => !staleSymbols.includes(symbol));

    // Stale-while-revalidate: return known-good data immediately and refresh it in the
    // background. Cold symbols still await the first usable provider response.
    for (const symbol of staleSymbols) {
      const cached = cache.get(symbol);
      if (cached) result.set(symbol, cached.value);
    }

    if (coldSymbols.length) {
      try {
        const fetched = await fetchSources(coldSymbols);
        for (const symbol of coldSymbols) {
          const value = fetched.get(symbol);
          if (!value) continue;
          cache.set(symbol, { value, freshUntil: now + CACHE_TTL_MS, staleUntil: now + STALE_CACHE_TTL_MS });
          result.set(symbol, value);
        }
      } catch (error) {
        console.error('Cold market providers failed:', error);
      }
    }

    if (staleSymbols.length) {
      void fetchSources(staleSymbols).then((fetched) => {
        const refreshNow = Date.now();
        for (const symbol of staleSymbols) {
          const value = fetched.get(symbol);
          if (value) {
            cache.set(symbol, { value, freshUntil: refreshNow + CACHE_TTL_MS, staleUntil: refreshNow + STALE_CACHE_TTL_MS });
          }
        }
      }).catch((error) => {
        console.warn('Background market refresh failed; stale cache remains active:', error);
      });
    }
  }

  const unresolved: string[] = [];
  for (const symbol of normalized) {
    if (result.has(symbol)) continue;
    const cached = cache.get(symbol);
    if (cached && cached.staleUntil > now) result.set(symbol, cached.value);
    else unresolved.push(symbol);
  }

  if (unresolved.length) {
    throw new Error(`No live or recently cached market data available for: ${unresolved.join(', ')}`);
  }
  return normalized.map(symbol => result.get(symbol)!);
}

export async function getMarketSnapshot(symbol: string): Promise<MarketSnapshot> {
  const rows = await getMarketSnapshots([symbol]);
  return rows[0]!;
}
