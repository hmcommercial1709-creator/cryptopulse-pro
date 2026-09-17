type MarketItem = { symbol: string; price: number; change24h: number; volume24h: number };

export async function runMarketData(symbols: string[]): Promise<MarketItem[]> {
  const unique = [...new Set(symbols.map((value) => value.trim().toUpperCase()).filter(Boolean))].slice(0, 10);
  if (!unique.length) return [];
  const base = process.env.NEXT_PUBLIC_MARKET_API_URL ?? '/api/markets';
  const url = base.startsWith('http') ? base : `${base}?symbols=${encodeURIComponent(unique.join(','))}`;
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Market data failed: ${response.status}`);
  const payload = await response.json() as { markets?: Array<Record<string, unknown>> };
  return (payload.markets ?? []).flatMap((row) => {
    const symbol = typeof row.symbol === 'string' ? row.symbol.toUpperCase() : '';
    const price = Number(row.price);
    const change24h = Number(row.change24h);
    const volume24h = Number(row.volume24h);
    if (!symbol || !Number.isFinite(price) || !Number.isFinite(change24h) || !Number.isFinite(volume24h)) return [];
    return [{ symbol, price, change24h, volume24h }];
  });
}
