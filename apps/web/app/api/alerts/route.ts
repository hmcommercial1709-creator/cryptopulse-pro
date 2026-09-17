import { NextRequest } from 'next/server';
import { jsonError, normalizeSymbol, requireTelegramUser } from '../../../lib/mini-auth';
import { supabaseDelete, supabaseSelect, supabaseInsert, supabaseUpsert } from '../../../lib/supabase-admin';

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
    const userId = await ensureUser(requireTelegramUser(request));
    const rows = await supabaseSelect('cp_alerts', `user_id=eq.${encodeURIComponent(userId)}&select=id,symbol,condition,threshold,active,created_at&order=created_at.desc&limit=50`);
    return Response.json({ alerts: rows });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to load alerts.', 401);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await ensureUser(requireTelegramUser(request));
    const body = await request.json() as { symbol?: unknown; condition?: unknown; threshold?: unknown };
    const symbol = normalizeSymbol(body.symbol);
    const condition = body.condition;
    if (condition !== 'above' && condition !== 'below' && condition !== 'change24h') throw new Error('Invalid alert condition.');
    const threshold = Number(body.threshold);
    if (!Number.isFinite(threshold)) throw new Error('Invalid alert threshold.');
    if (condition === 'above' || condition === 'below') {
      if (threshold <= 0) throw new Error('Price threshold must be greater than zero.');
    } else if (threshold < -100 || threshold > 100) {
      throw new Error('24h change threshold must be between -100 and 100.');
    }
    const rows = await supabaseInsert('cp_alerts', { user_id: userId, symbol, condition, threshold, active: true });
    return Response.json({ alert: rows[0] ?? null }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to create alert.', 400);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await ensureUser(requireTelegramUser(request));
    const id = new URL(request.url).searchParams.get('id');
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid alert id.');
    await supabaseDelete('cp_alerts', `id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to remove alert.', 400);
  }
}
