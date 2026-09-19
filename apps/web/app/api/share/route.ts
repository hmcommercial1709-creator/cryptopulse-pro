import { NextRequest } from 'next/server';
import { jsonError, normalizeSymbol, requireTelegramUser } from '../../../lib/mini-auth';
import { supabaseInsert, supabaseUpsert } from '../../../lib/supabase-admin';

type SharePayload = Record<string, unknown>;

export async function POST(request: NextRequest) {
  try {
    const user = requireTelegramUser(request);
    const body = await request.json() as { symbol?: unknown; cardType?: unknown; payload?: unknown; target?: unknown };
    const symbol = normalizeSymbol(body.symbol);
    const cardType = typeof body.cardType === 'string' && /^[a-z0-9_-]{2,40}$/i.test(body.cardType) ? body.cardType : 'market';
    const payload: SharePayload = body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload as SharePayload : {};
    const users = await supabaseUpsert('cp_users', { telegram_user_id: user.id, username: user.username ?? null, display_name: [user.first_name, user.last_name].filter(Boolean).join(' ') || null, language: user.language_code === 'ar' ? 'ar' : 'en' }, 'telegram_user_id');
    const userId = users[0]?.id;
    if (typeof userId !== 'string') throw new Error('Unable to resolve CryptoPulse user.');
    const rows = await supabaseInsert('cp_share_cards', { user_id: userId, symbol, card_type: cardType, payload });
    const id = rows[0]?.id;
    if (typeof id !== 'string') throw new Error('Unable to create share card.');
    const target = typeof body.target === 'string' && /^[a-z0-9_-]{1,40}$/i.test(body.target) ? body.target : `asset_${symbol.toLowerCase()}`;
    const startUrl = `https://cryptopulse-pro-mini-app.hmcommercial1709.workers.dev/mini?v=2026-09-19-05#${encodeURIComponent(target)}`;
    const rawText = payload.text;
    const text = typeof rawText === 'string' ? rawText.slice(0, 700) : `CryptoPulse ${symbol} market snapshot`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(startUrl)}&text=${encodeURIComponent(text)}`;
    return Response.json({ id, startUrl, shareUrl, target });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to create share card.', 400);
  }
}
