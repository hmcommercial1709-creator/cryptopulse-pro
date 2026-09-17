import { NextRequest } from 'next/server';
import { jsonError, normalizeSymbol, requireTelegramUser } from '../../../lib/mini-auth';
import { enforceRateLimit, requestFingerprint } from '../../../lib/security';
import { supabaseInsert, supabaseUpsert } from '../../../lib/supabase-admin';

function finitePositive(value: unknown, name: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 1e15) throw new Error(`Invalid ${name}.`);
  return number;
}

export async function POST(request: NextRequest) {
  try {
    const user = requireTelegramUser(request);
    enforceRateLimit(`pnl:${requestFingerprint(request, user.id)}`, 30, 60_000);
    const body = await request.json() as { symbol?: unknown; entryPrice?: unknown; currentPrice?: unknown; quantity?: unknown; target?: unknown };
    const symbol = normalizeSymbol(body.symbol);
    const entryPrice = finitePositive(body.entryPrice, 'entryPrice');
    const currentPrice = finitePositive(body.currentPrice, 'currentPrice');
    const quantity = finitePositive(body.quantity, 'quantity');
    const invested = entryPrice * quantity;
    const currentValue = currentPrice * quantity;
    const pnl = currentValue - invested;
    const pnlPct = pnl / invested * 100;
    const users = await supabaseUpsert('cp_users', { telegram_user_id: user.id, username: user.username ?? null, display_name: [user.first_name, user.last_name].filter(Boolean).join(' ') || null, language: user.language_code === 'ar' ? 'ar' : 'en' }, 'telegram_user_id');
    const userId = users[0]?.id;
    if (typeof userId !== 'string') throw new Error('Unable to resolve CryptoPulse user.');
    const card = await supabaseInsert('cp_share_cards', {
      user_id: userId,
      symbol,
      card_type: 'pnl',
      payload: { entryPrice, currentPrice, quantity, invested, currentValue, pnl, pnlPct, target: typeof body.target === 'string' ? body.target.slice(0, 40) : null },
    });
    const id = card[0]?.id;
    const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? '';
    if (typeof id !== 'string' || !botUsername) throw new Error('Telegram share configuration is incomplete.');
    const startUrl = `https://t.me/${botUsername}?startapp=${encodeURIComponent(`share_${id}_pnl_${symbol.toLowerCase()}`)}`;
    const shareText = `CryptoPulse ${symbol} PnL: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(startUrl)}&text=${encodeURIComponent(shareText)}`;
    await supabaseInsert('cp_growth_events', { telegram_user_id: user.id, event: 'pnl_share_created', source: 'mini_pnl', metadata: { symbol, cardId: id, pnlPct } });
    return Response.json({ ok: true, card: { id, symbol, entryPrice, currentPrice, quantity, invested, currentValue, pnl, pnlPct }, startUrl, shareUrl });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to create PnL card.', 400);
  }
}
