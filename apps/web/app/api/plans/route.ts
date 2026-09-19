import { NextRequest } from 'next/server';
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
