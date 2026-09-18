import { NextResponse } from 'next/server';

const CMC_URL = 'https://pro-api.coinmarketcap.com/v3/cryptocurrency/quotes/latest';
const CG_URL = 'https://api.coingecko.com/api/v3/simple/price';
const REQUEST_TIMEOUT_MS = 4_000;
const FRESH_TTL_MS = 45_000;
const STALE_TTL_MS = 10 * 60_000;

const ASSETS = [
  { id: 1, symbol: 'BTC', geckoId: 'bitcoin' },
  { id: 1027, symbol: 'ETH', geckoId: 'ethereum' },
  { id: 5426, symbol: 'SOL', geckoId: 'solana' },
] as const;

type Market = {
  symbol: string;
  price: number;
  change24h: number | null;
  volume24h: number | null;
};

type CacheEntry = {
  value: Market;
  freshUntil: number;
  staleUntil: number;
};

type CmcAsset = {
  id?: number;
  symbol?: string;
  quote?: { USD?: { price?: number; percent_change_24h?: number; volume_24h?: number } };
};

type CmcBody = {
  data?: Record<string, CmcAsset>;
  status?: { error_code?: number | string; error_message?: string };
};

type GeckoBody = Record<string, { usd?: number; usd_24h_change?: number; usd_24h_vol?: number }>;

const cache = new Map<string, CacheEntry>();

function validMarket(symbol: string, price: unknown, change24h: unknown, volume24h: unknown): Market | null {
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) return null;
  const numericChange = Number(change24h);
  const numericVolume = Number(volume24h);
  return {
    symbol,
    price: numericPrice,
    change24h: Number.isFinite(numericChange) ? numericChange : null,
    volume24h: Number.isFinite(numericVolume) ? numericVolume : null,
  };
}

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCoinMarketCap(): Promise<Map<string, Market>> {
  const apiKey = process.env.MARKET_DATA_API_KEY?.trim();
  if (!apiKey) throw new Error('CoinMarketCap API key is not configured');
  const url = `${CMC_URL}?id=${ASSETS.map(asset => asset.id).join(',')}&convert=USD`;
  const body = await fetchJson<CmcBody>(url, {
    headers: { 'X-CMC_PRO_API_KEY': apiKey, Accept: 'application/json' },
  });
  const errorCode = Number(body.status?.error_code ?? 0);
  if (errorCode !== 0) throw new Error(`CoinMarketCap ${errorCode}: ${body.status?.error_message ?? 'API error'}`);

  const result = new Map<string, Market>();
  for (const asset of ASSETS) {
    const row = body.data?.[String(asset.id)];
    const market = validMarket(asset.symbol, row?.quote?.USD?.price, row?.quote?.USD?.percent_change_24h, row?.quote?.USD?.volume_24h);
    if (market) result.set(asset.symbol, market);
  }
  if (!result.size) throw new Error('CoinMarketCap returned no usable market data');
  return result;
}

async function fetchCoinGecko(): Promise<Map<string, Market>> {
  const ids = ASSETS.map(asset => asset.geckoId).join(',');
  const body = await fetchJson<GeckoBody>(
    `${CG_URL}?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`,
    { headers: { Accept: 'application/json' } },
  );

  const result = new Map<string, Market>();
  for (const asset of ASSETS) {
    const row = body[asset.geckoId];
    const market = validMarket(asset.symbol, row?.usd, row?.usd_24h_change, row?.usd_24h_vol);
    if (market) result.set(asset.symbol, market);
  }
  if (!result.size) throw new Error('CoinGecko returned no usable market data');
  return result;
}

async function fetchProviders(): Promise<Map<string, Market>> {
  const result = new Map<string, Market>();
  const settled = await Promise.allSettled([fetchCoinMarketCap(), fetchCoinGecko()]);

  for (const provider of settled) {
    if (provider.status !== 'fulfilled') continue;
    for (const [symbol, market] of provider.value) {
      // Prefer CMC when both providers return the same asset because it supplies
      // richer quote metadata, while CoinGecko remains an immediate fallback.
      if (!result.has(symbol)) result.set(symbol, market);
    }
  }

  if (result.size === 0) {
    const errors = settled
      .filter((item): item is PromiseRejectedResult => item.status === 'rejected')
      .map(item => item.reason instanceof Error ? item.reason.message : String(item.reason));
    throw new Error(`All market providers failed: ${errors.join(' | ')}`);
  }
  return result;
}

function cacheMarkets(markets: Map<string, Market>, now: number): void {
  for (const [symbol, value] of markets) {
    cache.set(symbol, {
      value,
      freshUntil: now + FRESH_TTL_MS,
      staleUntil: now + STALE_TTL_MS,
    });
  }
}

function readCache(symbol: string, now: number): { value: Market; stale: boolean } | null {
  const entry = cache.get(symbol);
  if (!entry || entry.staleUntil <= now) return null;
  return { value: entry.value, stale: entry.freshUntil <= now };
}

async function getResilientMarkets(): Promise<{ markets: Market[]; stale: boolean }> {
  const now = Date.now();
  const result = new Map<string, Market>();
  let hasStale = false;
  const missing: typeof ASSETS[number]['symbol'][] = [];

  for (const asset of ASSETS) {
    const cached = readCache(asset.symbol, now);
    if (cached && !cached.stale) result.set(asset.symbol, cached.value);
    else if (cached) {
      result.set(asset.symbol, cached.value);
      hasStale = true;
    } else {
      missing.push(asset.symbol);
    }
  }

  // Serve stale data immediately and refresh it asynchronously. Cold-start requests
  // wait only for the parallel providers, never for one provider behind another.
  if (missing.length === 0 && hasStale) {
    void fetchProviders().then(values => cacheMarkets(values, Date.now())).catch(error => {
      console.warn('Background market refresh failed; stale cache retained:', error);
    });
    return { markets: ASSETS.map(asset => result.get(asset.symbol)!).filter(Boolean), stale: true };
  }

  if (missing.length === 0) {
    return { markets: ASSETS.map(asset => result.get(asset.symbol)!), stale: false };
  }

  try {
    const fresh = await fetchProviders();
    cacheMarkets(fresh, Date.now());
    for (const asset of ASSETS) {
      const value = fresh.get(asset.symbol);
      if (value) result.set(asset.symbol, value);
    }
  } catch (error) {
    console.warn('Cold market providers failed:', error);
  }

  const unresolved = ASSETS.filter(asset => !result.has(asset.symbol)).map(asset => asset.symbol);
  if (unresolved.length) {
    throw new Error(`No live or recently cached market data available for: ${unresolved.join(', ')}`);
  }
  return { markets: ASSETS.map(asset => result.get(asset.symbol)!), stale: hasStale };
}

export async function GET() {
  try {
    const { markets, stale } = await getResilientMarkets();
    return NextResponse.json(
      {
        source: 'coinmarketcap+coingecko',
        mode: stale ? 'stale-while-revalidate' : 'live',
        updatedAt: new Date().toISOString(),
        markets,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          'X-Market-Resilience': stale ? 'stale-cache' : 'parallel-providers',
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load market data.';
    console.error('Resilient market API failed:', message);
    return NextResponse.json(
      { error: 'Market data is temporarily unavailable. Please retry shortly.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
