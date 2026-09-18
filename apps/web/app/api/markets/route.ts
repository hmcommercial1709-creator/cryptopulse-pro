import { NextResponse } from 'next/server';

const CMC_URL = 'https://pro-api.coinmarketcap.com/v3/cryptocurrency/quotes/latest';
const ASSETS = [
  { id: 1, symbol: 'BTC' },
  { id: 1027, symbol: 'ETH' },
  { id: 5426, symbol: 'SOL' },
] as const;

type CmcQuote = {
  id?: number;
  symbol?: string;
  quote?: { USD?: { price?: number; percent_change_24h?: number; volume_24h?: number } };
};

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
    const body = (await response.json()) as { data?: Record<string, CmcQuote>; status?: { error_message?: string } };

    if (!response.ok || !body.data) {
      return NextResponse.json({ error: body.status?.error_message ?? `Market provider returned ${response.status}.` }, { status: 502 });
    }

    const markets = ASSETS.map(({ id, symbol }) => {
      const item = body.data?.[String(id)];
      const quote = Array.isArray(item?.quote)
        ? item.quote.find((entry: { symbol?: string }) => entry.symbol === 'USD')
        : (item?.quote as unknown as { price?: number; percent_change_24h?: number; volume_24h?: number } | undefined);
      if (!quote || typeof quote.price !== 'number' || typeof quote.percent_change_24h !== 'number') {
        throw new Error(`Incomplete market data for ${symbol}.`);
      }
      return {
        symbol,
        price: quote.price,
        change24h: quote.percent_change_24h,
        volume24h: typeof quote.volume_24h === 'number' ? quote.volume_24h : null,
      };
    });

    return NextResponse.json({ source: 'coinmarketcap', updatedAt: new Date().toISOString(), markets }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load market data.';
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
