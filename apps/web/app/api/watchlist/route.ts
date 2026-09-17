import { NextRequest } from 'next/server';
import { jsonError, normalizeSymbol, requireTelegramUser } from '../../../lib/mini-auth';
import { supabaseDelete, supabaseSelect, supabaseUpsert } from '../../../lib/supabase-admin';

async function ensureUser(user: ReturnType<typeof requireTelegramUser>): Promise<string> {
  const rows = await supabaseUpsert('cp_users', {
    telegram_user_id: user.id,
    username: user.username ?? null,
    display_name: [user.first_name, user.last_name].filter(Boolean).join(' ') || null,
    language: user.language_code === 'ar' ? 'ar' : 'en',
  }, 'telegram_user_id');
  const id = rows[0]?.id;
  if (typeof id !== 'string') throw new Error('Unable to resolve CryptoPulse user.');
  return id;
}

export async function GET(request: NextRequest) {
  try {
    const user = requireTelegramUser(request);
    const userId = await ensureUser(user);
    const rows = await supabaseSelect('cp_watchlist_items', `user_id=eq.${encodeURIComponent(userId)}&select=id,symbol,created_at&order=created_at.desc&limit=50`);
    return Response.json({ items: rows });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to load watchlist.', 401);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = requireTelegramUser(request);
    const body = await request.json() as { symbol?: unknown };
    const symbol = normalizeSymbol(body.symbol);
    const userId = await ensureUser(user);
    const rows = await supabaseUpsert('cp_watchlist_items', { user_id: userId, symbol }, 'user_id,symbol');
    return Response.json({ item: rows[0] ?? null });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to update watchlist.', 400);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = requireTelegramUser(request);
    const symbol = normalizeSymbol(new URL(request.url).searchParams.get('symbol'));
    const userId = await ensureUser(user);
    await supabaseDelete('cp_watchlist_items', `user_id=eq.${encodeURIComponent(userId)}&symbol=eq.${encodeURIComponent(symbol)}`);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to remove watchlist item.', 400);
  }
}
