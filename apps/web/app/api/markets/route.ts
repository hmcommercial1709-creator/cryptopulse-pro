import { NextResponse } from 'next/server';

const CMC_URL = 'https://pro-api.coinmarketcap.com/v3/cryptocurrency/quotes/latest';
const ASSETS = [
  { id: 1, symbol: 'BTC' },
  { id: 1027, symbol: 'ETH' },
  { id: 5426, symbol: 'SOL' },
] as const;

type CmcUsdQuote = { symbol?: string; price?: number; percent_change_24h?: number; volume_24h?: number };
type CmcAsset = { id?: number; symbol?: string; quote?: CmcUsdQuote[] | { USD?: CmcUsdQuote } };
type CmcStatus = { error_code?: number | string; error_message?: string };
type CmcBody = { data?: Record<string, CmcAsset> | CmcAsset[]; status?: CmcStatus };

function normalizeErrorCode(status?: CmcStatus): number {
  const raw = status?.error_code;
  const code = Number(raw ?? 0);
  return Number.isFinite(code) ? code : -1;
}

function findAsset(data: Record<string, CmcAsset> | CmcAsset[], id: number, symbol: string): CmcAsset | undefined {
  return Array.isArray(data)
    ? data.find((entry) => Number(entry.id) === id || entry.symbol === symbol)
    : data[String(id)];
}

function findUsdQuote(asset?: CmcAsset): CmcUsdQuote | undefined {
  if (Array.isArray(asset?.quote)) {
    return asset.quote.find((entry) => entry.symbol === 'USD');
  }
  return asset?.quote?.USD;
}

export async function GET() {
  const apiKey = process.env.MARKET_DATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Market data is not configured.' }, { status: 503 });
  }

  const url = `${CMC_URL}?id=${ASSETS.map((asset) => asset.id).join(',')}&convert=USD`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      headers: { 'X-CMC_PRO_API_KEY': apiKey, Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    const body = (await response.json()) as CmcBody;
    const errorCode = normalizeErrorCode(body.status);

    if (errorCode !== 0) {
      console.error('CoinMarketCap API error:', {
        httpStatus: response.status,
        errorCode,
        errorMessage: body.status?.error_message ?? 'Unknown provider error',
      });
      return NextResponse.json(
        { error: body.status?.error_message ?? `Market provider returned error code ${errorCode}.` },
        { status: response.status === 429 ? 429 : 502 },
      );
    }

    if (!response.ok || !body.data) {
      return NextResponse.json(
        { error: body.status?.error_message ?? `Market provider returned ${response.status}.` },
        { status: 502 },
      );
    }

    const markets = ASSETS.map(({ id, symbol }) => {
      const item = findAsset(body.data!, id, symbol);
      const quote = findUsdQuote(item);

      if (!quote || typeof quote.price !== 'number') {
        throw new Error(`Missing price data for ${symbol}.`);
      }

      return {
        symbol,
        price: quote.price,
        change24h: typeof quote.percent_change_24h === 'number' ? quote.percent_change_24h : null,
        volume24h: typeof quote.volume_24h === 'number' ? quote.volume_24h : null,
      };
    });

    return NextResponse.json(
      { source: 'coinmarketcap', updatedAt: new Date().toISOString(), markets },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load market data.';
    console.error('Market API failed:', message);
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
