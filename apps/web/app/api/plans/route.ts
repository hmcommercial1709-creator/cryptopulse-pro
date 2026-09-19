import { NextRequest } from 'next/server';
import { requireTelegramUser } from '../../../lib/mini-auth';
import { supabaseSelect } from '../../../lib/supabase-admin';

const FALLBACK_PLANS = [
  { code: 'pro_monthly', name: 'CryptoPulse Pro', description: 'Personal AI assistant and automation.', price_stars: 299, billing_period: 'monthly', recurring: true, features: ['AI assistant', 'Voice commands', 'Smart alerts'] },
  { code: 'pro_annual', name: 'CryptoPulse Pro Annual', description: '12-month Pro pass with 50% annual discount.', price_stars: 1794, billing_period: 'annual', recurring: false, features: ['Everything in Pro', '12 months', '50% discount'] },
  { code: 'vip_monthly', name: 'CryptoPulse VIP', description: 'Personal Trading Agent and advanced automation.', price_stars: 999, billing_period: 'monthly', recurring: true, features: ['Everything in Pro', 'Personal Trading Agent', '24/7 monitoring'] },
  { code: 'vip_annual', name: 'CryptoPulse VIP Annual', description: '12-month VIP pass with 50% annual discount.', price_stars: 5994, billing_period: 'annual', recurring: false, features: ['Everything in VIP', '12 months', '50% discount'] },
];

export async function GET(_request: NextRequest) {
  try {
    const plans = await supabaseSelect(
      'cp_subscription_plans',
      'active=eq.true&select=code,name,description,price_stars,billing_period,recurring,features&order=price_stars.asc',
    );
    return Response.json({ plans, source: 'supabase' });
  } catch {
    return Response.json({ plans: FALLBACK_PLANS, source: 'fallback' });
  }
}


export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = requireTelegramUser(request);
    const body = await request.json() as { plan?: unknown };
    const code = typeof body.plan === 'string' ? body.plan.trim() : '';
    const plan = FALLBACK_PLANS.find(item => item.code === code);
    if (!plan) return Response.json({ ok: false, error: 'Plan unavailable.' }, { status: 404 });
    const token = String(process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
    if (!token) throw new Error('Telegram payment service is not configured.');
    const telegram = await fetch(`https://api.telegram.org/bot${token}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: plan.name,
        description: plan.description,
        payload: `plan:${plan.code}:user:${user.id}`,
        currency: 'XTR',
        prices: [{ label: plan.name, amount: plan.price_stars }],
        ...(plan.recurring ? { subscription_period: 2592000 } : {}),
      }),
      cache: 'no-store',
    });
    const result = await telegram.json() as { ok?: boolean; result?: string; description?: string };
    if (!telegram.ok || !result.ok || !result.result) throw new Error(result.description ?? 'Telegram could not create the invoice.');
    return Response.json({ ok: true, plan: plan.code, invoiceUrl: result.result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Unable to open Telegram checkout.' }, { status: 400 });
  }
}
