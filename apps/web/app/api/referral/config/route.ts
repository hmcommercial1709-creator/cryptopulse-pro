import { NextRequest } from 'next/server';
import { requireTelegramUser } from '../../../../lib/mini-auth';
import { supabaseSelect } from '../../../../lib/supabase-admin';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    requireTelegramUser(request);
    const rows = await supabaseSelect(
      'cp_referral_program_config',
      'id=eq.true&select=telegram_commission_permille,affiliate_duration_months,reward_payout_mode&limit=1'
    );
    const permille = Math.max(0, Math.min(1000, Number(rows[0]?.telegram_commission_permille ?? 150)));
    return Response.json({
      ok: true,
      rate: permille / 10,
      commissionPermille: permille,
      durationMonths: rows[0]?.affiliate_duration_months ?? null,
      payoutMode: rows[0]?.reward_payout_mode ?? 'manual'
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to load referral configuration.' }, { status: 400 });
  }
}
