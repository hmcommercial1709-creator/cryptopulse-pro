import { after, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CG_URL = 'https://api.coingecko.com/api/v3/simple/price';
const COINCAP_URL = 'https://api.coincap.io/v2/assets';
const BINANCE_URL = 'https://api.binance.com/api/v3/ticker/24hr';
const REQUEST_TIMEOUT_MS = 4_000;
const FRESH_TTL_MS = 45_000;
const STALE_TTL_MS = 10 * 60_000;

const ASSETS = [
  { symbol: 'BTC', geckoId: 'bitcoin', coinCapId: 'bitcoin', binanceSymbol: 'BTCUSDT' },
  { symbol: 'ETH', geckoId: 'ethereum', coinCapId: 'ethereum', binanceSymbol: 'ETHUSDT' },
  { symbol: 'SOL', geckoId: 'solana', coinCapId: 'solana', binanceSymbol: 'SOLUSDT' },
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

type GeckoBody = Record<string, { usd?: number; usd_24h_change?: number; usd_24h_vol?: number }>;
type CoinCapAsset = {
  id?: string;
  symbol?: string;
  priceUsd?: string;
  changePercent24Hr?: string;
  volumeUsd24Hr?: string;
};
type CoinCapBody = { data?: CoinCapAsset[] };
type BinanceTicker = {
  symbol?: string;
  lastPrice?: string;
  priceChangePercent?: string;
  quoteVolume?: string;
};
type BinanceBody = BinanceTicker | BinanceTicker[];

function edgeCache(): Cache | null {
  return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default ?? null;
}

function cacheKey(symbol: string): Request {
  return new Request('https://cryptopulse-edge-cache.invalid/markets/' + encodeURIComponent(symbol));
}

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

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCoinGecko(): Promise<Map<string, Market>> {
  const ids = ASSETS.map(asset => asset.geckoId).join(',');
  const body = await fetchJson<GeckoBody>(
    `${CG_URL}?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`,
  );

  const result = new Map<string, Market>();
  for (const asset of ASSETS) {
    const row = body[asset.geckoId];
    const market = validMarket(asset.symbol, row?.usd, row?.usd_24h_change, row?.usd_24h_vol);
    if (market) result.set(asset.symbol, market);
  }
  if (result.size !== ASSETS.length) throw new Error('CoinGecko returned incomplete market data');
  return result;
}

async function fetchCoinCap(): Promise<Map<string, Market>> {
  const ids = ASSETS.map(asset => asset.coinCapId).join(',');
  const body = await fetchJson<CoinCapBody>(
    `${COINCAP_URL}?ids=${encodeURIComponent(ids)}`,
  );

  const rows = body.data ?? [];
  const result = new Map<string, Market>();
  for (const asset of ASSETS) {
    const row = rows.find(item => item.id === asset.coinCapId);
    const market = validMarket(
      asset.symbol,
      row?.priceUsd,
      row?.changePercent24Hr,
      row?.volumeUsd24Hr,
    );
    if (market) result.set(asset.symbol, market);
  }
  if (result.size !== ASSETS.length) throw new Error('CoinCap returned incomplete market data');
  return result;
}

async function fetchBinance(): Promise<Map<string, Market>> {
  const symbols = encodeURIComponent(JSON.stringify(ASSETS.map(asset => asset.binanceSymbol)));
  const body = await fetchJson<BinanceBody>(`${BINANCE_URL}?symbols=${symbols}`);
  const rows = Array.isArray(body) ? body : [body];

  const result = new Map<string, Market>();
  for (const asset of ASSETS) {
    const row = rows.find(item => item.symbol === asset.binanceSymbol);
    const market = validMarket(
      asset.symbol,
      row?.lastPrice,
      row?.priceChangePercent,
      row?.quoteVolume,
    );
    if (market) result.set(asset.symbol, market);
  }
  if (result.size !== ASSETS.length) throw new Error('Binance returned incomplete market data');
  return result;
}

async function fetchProviders(): Promise<{ markets: Map<string, Market>; source: string }> {
  // Strict sequential fallback: CoinGecko -> CoinCap -> Binance.
  // Each provider must return the complete BTC/ETH/SOL set before it is accepted.
  const providers: Array<[string, () => Promise<Map<string, Market>>]> = [
    ['coingecko', fetchCoinGecko],
    ['coincap', fetchCoinCap],
    ['binance', fetchBinance],
  ];

  const errors: string[] = [];
  for (const [name, fetcher] of providers) {
    try {
      return { markets: await fetcher(), source: name };
    } catch (error) {
      errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`All public market providers failed: ${errors.join(' | ')}`);
}

async function cacheMarkets(markets: Map<string, Market>, now: number): Promise<void> {
  const cache = edgeCache();
  if (!cache) return;
  for (const [symbol, value] of markets) {
    const entry: CacheEntry = {
      value,
      freshUntil: now + FRESH_TTL_MS,
      staleUntil: now + STALE_TTL_MS,
    };
    await cache.put(cacheKey(symbol), new Response(JSON.stringify(entry), {
      headers: { 'Content-Type': 'application/json' },
    }));
  }
}

async function readCache(symbol: string, now: number): Promise<{ value: Market; stale: boolean } | null> {
  const cache = edgeCache();
  if (!cache) return null;
  const response = await cache.match(cacheKey(symbol));
  if (!response) return null;
  try {
    const entry = await response.json() as CacheEntry;
    if (!entry?.staleUntil || entry.staleUntil <= now || !entry.value) return null;
    return { value: entry.value, stale: entry.freshUntil <= now };
  } catch {
    return null;
  }
}

async function getResilientMarkets(): Promise<{ markets: Market[]; stale: boolean; source: string }> {
  const now = Date.now();
  const result = new Map<string, Market>();
  let hasStale = false;
  const missing: typeof ASSETS[number]['symbol'][] = [];

  for (const asset of ASSETS) {
    const cached = await readCache(asset.symbol, now);
    if (cached && !cached.stale) result.set(asset.symbol, cached.value);
    else if (cached) {
      result.set(asset.symbol, cached.value);
      hasStale = true;
    } else {
      missing.push(asset.symbol);
    }
  }

  if (missing.length === 0 && hasStale) {
    after(async () => {
      await fetchProviders()
        .then(({ markets }) => cacheMarkets(markets, Date.now()))
        .catch(error => console.warn('Background market refresh failed; stale cache retained:', error));
    });
    return {
      markets: ASSETS.map(asset => result.get(asset.symbol)!).filter(Boolean),
      stale: true,
      source: 'stale-cache',
    };
  }

  if (missing.length === 0) {
    return {
      markets: ASSETS.map(asset => result.get(asset.symbol)!),
      stale: false,
      source: 'cache',
    };
  }

  const fresh = await fetchProviders();
  await cacheMarkets(fresh.markets, Date.now());
  for (const asset of ASSETS) {
    const value = fresh.markets.get(asset.symbol);
    if (value) result.set(asset.symbol, value);
  }

  return {
    markets: ASSETS.map(asset => result.get(asset.symbol)!),
    stale: hasStale,
    source: fresh.source,
  };
}

export async function GET() {
  try {
    const { markets, stale, source } = await getResilientMarkets();
    return NextResponse.json(
      {
        source,
        mode: stale ? 'stale-while-revalidate' : 'live',
        updatedAt: new Date().toISOString(),
        markets,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          'X-Market-Resilience': stale ? 'stale-cache' : 'sequential-public-providers',
          'X-Market-Source': source,
        },
      },
    );
  } catch (error) {
    console.error(
      'Resilient market API failed:',
      error instanceof Error ? error.message : String(error),
    );

    // Never expose a provider error or API-key requirement to the Mini App.
    return NextResponse.json(
      { error: 'Public market providers are temporarily unavailable. Please retry shortly.' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'X-Market-Resilience': 'all-public-providers-failed',
        },
      },
    );
  }
}
