import { NextRequest } from 'next/server';
import { jsonError, normalizeSymbol, requireTelegramUser } from '../../../lib/mini-auth';
import { supabaseInsert, supabaseUpsert } from '../../../lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const user = requireTelegramUser(request);
    const body = await request.json() as { symbol?: unknown; cardType?: unknown; payload?: unknown };
    const symbol = normalizeSymbol(body.symbol);
    const cardType = typeof body.cardType === 'string' && /^[a-z0-9_-]{2,40}$/i.test(body.cardType) ? body.cardType : 'market';
    const payload = body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload : {};
    const users = await supabaseUpsert('cp_users', {
      telegram_user_id: user.id,
      username: user.username ?? null,
      display_name: [user.first_name, user.last_name].filter(Boolean).join(' ') || null,
      language: user.language_code === 'ar' ? 'ar' : 'en',
    }, 'telegram_user_id');
    const userId = users[0]?.id;
    if (typeof userId !== 'string') throw new Error('Unable to resolve CryptoPulse user.');
    const rows = await supabaseInsert('cp_share_cards', { user_id: userId, symbol, card_type: cardType, payload });
    const id = rows[0]?.id;
    const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? '';
    if (typeof id !== 'string' || !botUsername) throw new Error('Telegram share configuration is incomplete.');
    const startUrl = `https://t.me/${botUsername}?start=share_${id}`;
    const text = typeof payload.text === 'string' ? payload.text.slice(0, 700) : `CryptoPulse ${symbol} market snapshot`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(startUrl)}&text=${encodeURIComponent(text)}`;
    return Response.json({ id, startUrl, shareUrl });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to create share card.', 400);
  }
}
