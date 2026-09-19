import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 5000;
const FRESH_TTL_MS = 30_000;
const STALE_TTL_MS = 15 * 60_000;

const ASSETS = [
  { symbol: 'BTC', gecko: 'bitcoin', coinCap: 'bitcoin', binance: 'BTCUSDT', coinbase: 'BTC-USD' },
  { symbol: 'ETH', gecko: 'ethereum', coinCap: 'ethereum', binance: 'ETHUSDT', coinbase: 'ETH-USD' },
  { symbol: 'SOL', gecko: 'solana', coinCap: 'solana', binance: 'SOLUSDT', coinbase: 'SOL-USD' },
] as const;

type Market = {
  symbol: string;
  price: number;
  change24h: number | null;
  volume24h: number | null;
};

type CacheEntry = { value: Market; freshUntil: number; staleUntil: number };

function cache(): Cache | null {
  return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default ?? null;
}

function key(symbol: string): Request {
  return new Request('https://cryptopulse-market-cache.invalid/v3/' + symbol);
}

function market(symbol: string, price: unknown, change: unknown, volume: unknown): Market | null {
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return null;
  const c = Number(change);
  const v = Number(volume);
  return {
    symbol,
    price: p,
    change24h: Number.isFinite(c) ? c : null,
    volume24h: Number.isFinite(v) ? v : null,
  };
}

async function json<T>(url: string, provider: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'CryptoPulse-Pro/1.0' },
    });
    if (!response.ok) throw new Error(provider + ' HTTP ' + response.status);
    const type = (response.headers.get('content-type') ?? '').toLowerCase();
    if (!type.includes('json')) throw new Error(provider + ' returned ' + type);
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

async function providerCoinMarketCap(apiKey: string): Promise<Market[]> {
  if (!apiKey.trim()) return [];
  const body = await json<{
    data?: Record<string, {
      quote?: { USD?: { price?: number; percent_change_24h?: number; volume_24h?: number }
    }>
  }>(
    'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=BTC,ETH,SOL&convert=USD',
    'coinmarketcap',
  );
  return ASSETS.map(a => {
    const quote = body.data?.[a.symbol]?.quote?.USD;
    return market(a.symbol, quote?.price, quote?.percent_change_24h, quote?.volume_24h);
  }).filter(Boolean) as Market[];
}

async function providerCoinGecko(): Promise<Market[]> {
  const ids = ASSETS.map(a => a.gecko).join(',');
  const body = await json<Record<string, { usd?: number; usd_24h_change?: number; usd_24h_vol?: number }>>(
    'https://api.coingecko.com/api/v3/simple/price?ids=' + encodeURIComponent(ids) + '&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true',
    'coingecko',
  );
  return ASSETS.map(a => market(a.symbol, body[a.gecko]?.usd, body[a.gecko]?.usd_24h_change, body[a.gecko]?.usd_24h_vol)).filter(Boolean) as Market[];
}

async function providerCoinCap(): Promise<Market[]> {
  const ids = ASSETS.map(a => a.coinCap).join(',');
  const body = await json<{ data?: Array<{ id?: string; priceUsd?: string; changePercent24Hr?: string; volumeUsd24Hr?: string }> }>(
    'https://api.coincap.io/v2/assets?ids=' + encodeURIComponent(ids),
    'coincap',
  );
  return ASSETS.map(a => {
    const row = (body.data ?? []).find(x => x.id === a.coinCap);
    return market(a.symbol, row?.priceUsd, row?.changePercent24Hr, row?.volumeUsd24Hr);
  }).filter(Boolean) as Market[];
}

async function providerBinance(): Promise<Market[]> {
  const symbols = encodeURIComponent(JSON.stringify(ASSETS.map(a => a.binance)));
  const body = await json<Array<{ symbol?: string; lastPrice?: string; priceChangePercent?: string; quoteVolume?: string }>>(
    'https://api.binance.com/api/v3/ticker/24hr?symbols=' + symbols,
    'binance',
  );
  return ASSETS.map(a => {
    const row = body.find(x => x.symbol === a.binance);
    return market(a.symbol, row?.lastPrice, row?.priceChangePercent, row?.quoteVolume);
  }).filter(Boolean) as Market[];
}

async function providerCoinbase(): Promise<Market[]> {
  const rows = await Promise.all(ASSETS.map(async a => {
    const body = await json<{ data?: { amount?: string } }>(
      'https://api.coinbase.com/v2/prices/' + a.coinbase + '/spot',
      'coinbase',
    );
    return market(a.symbol, body.data?.amount, null, null);
  }));
  return rows.filter(Boolean) as Market[];
}

async function readCached(now: number): Promise<{ markets: Market[]; stale: boolean }> {
  const c = cache();
  if (!c) return { markets: [], stale: false };
  const markets: Market[] = [];
  let stale = false;
  for (const a of ASSETS) {
    const response = await c.match(key(a.symbol));
    if (!response) continue;
    try {
      const entry = await response.json() as CacheEntry;
      if (!entry?.value || entry.staleUntil <= now) continue;
      markets.push(entry.value);
      if (entry.freshUntil <= now) stale = true;
    } catch { /* ignore bad cache entries */ }
  }
  return { markets, stale };
}

async function writeCache(markets: Market[], now: number): Promise<void> {
  const c = cache();
  if (!c) return;
  await Promise.all(markets.map(m => c.put(key(m.symbol), new Response(JSON.stringify({
    value: m, freshUntil: now + FRESH_TTL_MS, staleUntil: now + STALE_TTL_MS,
  }), { headers: { 'content-type': 'application/json' } }))));
}

async function loadMarkets(apiKey: string): Promise<{ markets: Market[]; source: string; stale: boolean }> {
  const now = Date.now();
  const cached = await readCached(now);
  if (cached.markets.length === ASSETS.length && !cached.stale) {
    return { markets: cached.markets, source: 'cache', stale: false };
  }

  const providers: Array<[string, () => Promise<Market[]>]> = [
    ...(apiKey.trim() ? [['coinmarketcap', () => providerCoinMarketCap(apiKey)] as [string, () => Promise<Market[]>]] : []),
    ['coingecko', providerCoinGecko],
    ['coincap', providerCoinCap],
    ['binance', providerBinance],
    ['coinbase', providerCoinbase],
  ];

  const merged = new Map<string, Market>(cached.markets.map(m => [m.symbol, m]));
  const sources: string[] = [];
  for (const [name, fn] of providers) {
    try {
      const rows = await fn();
      for (const row of rows) if (!merged.has(row.symbol) || merged.get(row.symbol)?.change24h == null) merged.set(row.symbol, row);
      if (rows.length) sources.push(name);
      if (merged.size === ASSETS.length) break;
    } catch (error) {
      console.warn('Market provider failed:', name, error instanceof Error ? error.message : String(error));
    }
  }

  const markets = ASSETS.map(a => merged.get(a.symbol)).filter(Boolean) as Market[];
  if (markets.length) {
    await writeCache(markets, now);
    return { markets, source: sources.join('+') || 'stale-cache', stale: cached.stale };
  }
  return { markets: [], source: 'unavailable', stale: false };
}

export async function GET() {
  const apiKey = String(process.env.MARKET_DATA_API_KEY ?? '').trim();
  const result = await loadMarkets(apiKey);
  return NextResponse.json({
    source: result.source,
    mode: result.markets.length ? (result.stale ? 'stale-cache' : 'live') : 'fallback',
    updatedAt: new Date().toISOString(),
    markets: result.markets,
    error: result.markets.length ? undefined : 'Live market providers are temporarily unavailable.',
  }, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'X-Market-Source': result.source,
      'X-Market-Count': String(result.markets.length),
    },
  });
}
