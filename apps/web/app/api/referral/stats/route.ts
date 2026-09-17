import { NextRequest } from 'next/server';
import { requireTelegramUser } from '../../../../lib/mini-auth';
import { supabaseSelect } from '../../../../lib/supabase-admin';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const user = requireTelegramUser(request);
    const users = await supabaseSelect('cp_users', `telegram_user_id=eq.${user.id}&select=id&limit=1`);
    const userId = typeof users[0]?.id === 'string' ? users[0].id : '';
    if (!userId) throw new Error('Telegram user is not registered yet.');

    const rows = await supabaseSelect('cp_referral_stats', `referrer_user_id=eq.${encodeURIComponent(userId)}&select=referrals,activated_referrals,shared_referrals,first_referral_at&limit=1`);
    const stats = rows[0] ?? {};
    return Response.json({
      ok: true,
      referrals: Number(stats.referrals ?? 0),
      activatedReferrals: Number(stats.activated_referrals ?? 0),
      sharedReferrals: Number(stats.shared_referrals ?? 0),
      firstReferralAt: typeof stats.first_referral_at === 'string' ? stats.first_referral_at : null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to load referral stats.' }, { status: 400 });
  }
}
