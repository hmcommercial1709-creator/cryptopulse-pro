import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();
  const checks: Record<string, string> = {};
  let ok = true;

  try {
    const response = await fetch('https://api.binance.com/api/v3/ping', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3000),
    });
    checks.binance = response.ok ? 'ok' : 'degraded';
  } catch {
    checks.binance = 'unavailable';
  }

  try {
    const response = await fetch('https://api.coinbase.com/v2/time', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3000),
    });
    checks.coinbase = response.ok ? 'ok' : 'degraded';
  } catch {
    checks.coinbase = 'unavailable';
  }

  if (checks.binance === 'unavailable' && checks.coinbase === 'unavailable') ok = false;

  return NextResponse.json({
    ok,
    service: 'cryptopulse-mini-app',
    checks,
    latencyMs: Date.now() - started,
    timestamp: new Date().toISOString(),
  }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
