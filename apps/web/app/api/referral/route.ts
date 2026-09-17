import { NextRequest } from 'next/server';
import { requireTelegramUser } from '../../../lib/mini-auth';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const user = requireTelegramUser(request);
    const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, '');
    if (!username) throw new Error('TELEGRAM_BOT_USERNAME is not configured.');

    const startParam = `ref_${user.id}`;
    const url = `https://t.me/${username}?startapp=${startParam}`;
    return Response.json({ ok: true, startParam, url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to create referral link.' }, { status: 400 });
  }
}
