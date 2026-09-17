import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const symbol = url.searchParams.get('symbol')?.trim().toUpperCase();
    if (!symbol || !/^[A-Z0-9]{2,12}$/.test(symbol)) {
      return NextResponse.json({ error: 'A valid symbol is required.' }, { status: 400 });
    }

    const supabaseUrl = env('SUPABASE_URL');
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
    const query = new URLSearchParams({
      symbol: `eq.${symbol}`,
      select: 'id,signal_id,symbol,decision,confidence,report,generated_at',
      order: 'generated_at.desc',
      limit: '1',
    });

    const response = await fetch(`${supabaseUrl}/rest/v1/cp_committee_reports?${query.toString()}`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Committee report lookup failed.' }, { status: 502 });
    }

    const rows = await response.json() as unknown[];
    return NextResponse.json({ report: rows[0] ?? null }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('committee-api-failed', error);
    return NextResponse.json({ error: 'Committee report unavailable.' }, { status: 500 });
  }
}
