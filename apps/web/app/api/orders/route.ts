import { NextResponse } from 'next/server';
import { executeUserOrder } from '../../../lib/execution';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { initData?: string; exchange?: string; symbol?: string; side?: 'BUY' | 'SELL'; quantity?: string; mode?: 'paper' | 'testnet' | 'live'; idempotencyKey?: string };
    if (!body.initData) return NextResponse.json({ error: 'Telegram authentication required.' }, { status: 401 });
    const result = await executeUserOrder(body.initData, body);
    return NextResponse.json(result, { status: result.reused ? 200 : 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Order execution failed.';
    const status = /authentication|telegram/i.test(message) ? 401 : /not configured|disabled|invalid/i.test(message) ? 400 : 409;
    return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
