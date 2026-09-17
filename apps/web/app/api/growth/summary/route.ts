import { NextRequest } from 'next/server';
import { requireTelegramUser } from '../../../../lib/mini-auth';
import { supabaseSelect } from '../../../../lib/supabase-admin';

function dayKey(value: string): string { return new Date(value).toISOString().slice(0, 10); }

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const user = requireTelegramUser(request);
    const [userRows, eventRows] = await Promise.all([
      supabaseSelect('cp_users', `select=id&telegram_user_id=eq.${encodeURIComponent(String(user.id))}&limit=1`),
      supabaseSelect('cp_growth_events', `select=event,created_at,metadata&telegram_user_id=eq.${encodeURIComponent(String(user.id))}&order=created_at.asc&limit=5000`),
    ]);
    const userUuid = typeof userRows[0]?.id === 'string' ? userRows[0].id : null;
    const referralRows = userUuid
      ? await supabaseSelect('cp_referrals', `select=referred_user_id,created_at&referrer_user_id=eq.${encodeURIComponent(userUuid)}&order=created_at.asc`)
      : [];

    const firstEvent = eventRows.find((row) => typeof row.created_at === 'string');
    const firstAt = typeof firstEvent?.created_at === 'string' ? new Date(firstEvent.created_at) : null;
    const hasEventOnDay = (days: number): boolean => {
      if (!firstAt) return false;
      const target = new Date(firstAt.getTime() + days * 86_400_000);
      const key = dayKey(target.toISOString());
      return eventRows.some((row) => typeof row.created_at === 'string' && dayKey(row.created_at) === key);
    };

    const activated = eventRows.some((row) => row.event === 'activation');
    const firstShared = eventRows.some((row) => row.event === 'first_share');
    const now = Date.now();
    const d1Eligible = firstAt ? now >= firstAt.getTime() + 86_400_000 : false;
    const d7Eligible = firstAt ? now >= firstAt.getTime() + 7 * 86_400_000 : false;

    return Response.json({
      ok: true,
      referrals: referralRows.length,
      activated,
      firstShared,
      retention: { d1: d1Eligible ? hasEventOnDay(1) : null, d7: d7Eligible ? hasEventOnDay(7) : null },
      firstActivityAt: firstAt?.toISOString() ?? null,
      asOf: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to load growth summary.' }, { status: 400 });
  }
}
