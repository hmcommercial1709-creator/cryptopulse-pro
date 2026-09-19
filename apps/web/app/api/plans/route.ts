import { NextRequest } from 'next/server';
import { supabaseSelect } from '../../../lib/supabase-admin';

export async function GET(_request: NextRequest) {
  const plans = await supabaseSelect(
    'cp_subscription_plans',
    'active=eq.true&select=code,name,description,price_stars,billing_period,recurring,features&order=price_stars.asc',
  );
  return Response.json({ plans });
}
