import { NextRequest } from 'next/server';
import { jsonError, requireTelegramUser } from '../../../lib/mini-auth';
import { supabaseSelect, supabaseUpsert } from '../../../lib/supabase-admin';

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

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const user = requireTelegramUser(request);
    const userId = await ensureUser(user);
    const [cfgRows, subRows] = await Promise.all([
      supabaseSelect('cp_referral_program_config', 'id=eq.true&select=pro_price_stars,subscription_period_seconds,telegram_commission_permille,affiliate_duration_months&limit=1'),
      supabaseSelect('cp_subscriptions', 'user_id=eq.' + encodeURIComponent(userId) + '&plan=eq.pro&select=status,starts_at,expires_at,price_stars,currency,is_recurring&limit=1'),
    ]);
    return Response.json({
      ok: true,
      config: cfgRows[0] ?? { pro_price_stars: 299, subscription_period_seconds: 2592000, telegram_commission_permille: 150, affiliate_duration_months: null },
      subscription: subRows[0] ?? null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to load Pro details.', 400);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = requireTelegramUser(request);
    await ensureUser(user);
    const cfgRows = await supabaseSelect('cp_referral_program_config', 'id=eq.true&select=pro_price_stars,subscription_period_seconds&limit=1');
    const cfg = cfgRows[0] ?? { pro_price_stars: 299, subscription_period_seconds: 2592000 };
    const payload = 'cryptopulse_pro:' + user.id + ':' + crypto.randomUUID();
    const response = await fetch(
      'https://api.telegram.org/bot' + (process.env.TELEGRAM_BOT_TOKEN ?? '') + '/createInvoiceLink',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'CryptoPulse Pro',
          description: '30-day CryptoPulse Pro access',
          payload,
          currency: 'XTR',
          prices: [{ label: 'CryptoPulse Pro — 30 days', amount: Number(cfg.pro_price_stars) }],
          subscription_period: Number(cfg.subscription_period_seconds),
        }),
      },
    );
    const body = await response.json() as { ok?: boolean; result?: string; description?: string };
    if (!response.ok || !body.ok || !body.result) throw new Error(body.description ?? 'Telegram Stars invoice creation failed.');
    return Response.json({ ok: true, invoiceUrl: body.result, priceStars: Number(cfg.pro_price_stars), periodSeconds: Number(cfg.subscription_period_seconds) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to create Pro invoice.', 400);
  }
}
