import { NextRequest } from 'next/server';
import { requireTelegramUser } from '../../../lib/mini-auth';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const user = requireTelegramUser(request);
    let username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, '').trim();
    if (!username) {
      const botToken = String(process.env.TELEGRAM_BOT_TOKEN ?? process.env.BOT_TOKEN ?? '').trim();
      if (!botToken) throw new Error('Telegram bot token is not configured.');
      const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, { cache: 'no-store' });
      const body = await response.json() as { ok?: boolean; result?: { username?: string } };
      username = body.ok ? body.result?.username?.trim() : undefined;
    }
    if (!username) throw new Error('Telegram bot username is not configured.');

    const startParam = `ref_${user.id}`;
    const url = `https://t.me/${username}?start=${startParam}`;
    return Response.json({ ok: true, startParam, url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to create referral link.' }, { status: 400 });
  }
}
