import { NextRequest } from 'next/server';
import { jsonError, requireTelegramUser } from '../../../lib/mini-auth';
import { supabaseInsert, supabaseSelect } from '../../../lib/supabase-admin';

const ALLOWED_EVENTS = new Set([
  'mini_open', 'market_view', 'watchlist_add', 'watchlist_remove', 'alert_create', 'alert_remove',
  'share_open', 'share_click', 'referral_open', 'activation', 'first_share', 'pro_view', 'agent_intent',
  'startapp_open',
]);

function startAppSource(startParam: string): string {
  if (startParam.startsWith('momentum_')) return 'momentum';
  if (startParam.startsWith('share_')) return 'share';
  if (startParam.startsWith('ref_')) return 'referral';
  return 'startapp';
}

function referralTelegramId(startParam: string): number | null {
  const match = /^ref_([0-9]{1,20})$/.exec(startParam);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function recordReferral(startParam: string, referredTelegramId: number): Promise<boolean> {
  const referrerTelegramId = referralTelegramId(startParam);
  if (!referrerTelegramId || referrerTelegramId === referredTelegramId) return false;

  const [referrerRows, referredRows, existingRows] = await Promise.all([
    supabaseSelect('cp_users', `telegram_user_id=eq.${referrerTelegramId}&select=id&limit=1`),
    supabaseSelect('cp_users', `telegram_user_id=eq.${referredTelegramId}&select=id&limit=1`),
    supabaseSelect('cp_referrals', `referred_user_id=eq.${encodeURIComponent('')}&select=id&limit=0`).catch(() => []),
  ]);

  const referrerId = typeof referrerRows[0]?.id === 'string' ? referrerRows[0].id : null;
  const referredId = typeof referredRows[0]?.id === 'string' ? referredRows[0].id : null;
  if (!referrerId || !referredId || referrerId === referredId) return false;

  const alreadyReferred = await supabaseSelect('cp_referrals', `referred_user_id=eq.${referredId}&select=id&limit=1`);
  if (alreadyReferred.length) return false;

  await supabaseInsert('cp_referrals', {
    referrer_user_id: referrerId,
    referred_user_id: referredId,
    source: 'telegram_startapp',
  });
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const user = requireTelegramUser(request);
    const body = await request.json() as { event?: unknown; source?: unknown; metadata?: unknown };
    const event = typeof body.event === 'string' ? body.event : '';
    if (!ALLOWED_EVENTS.has(event)) throw new Error('Unsupported growth event.');
    const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata as Record<string, unknown> : {};
    const rawStartParam = typeof metadata.startParam === 'string' ? metadata.startParam.trim() : '';
    const startParam = rawStartParam.slice(0, 64);
    const source = event === 'startapp_open'
      ? (startParam ? startAppSource(startParam) : 'startapp')
      : (typeof body.source === 'string' ? body.source.slice(0, 80) : null);
    const storedMetadata = event === 'startapp_open'
      ? { ...metadata, startParam }
      : metadata;

    let referralRecorded = false;
    if (event === 'startapp_open' && startParam.startsWith('ref_')) {
      referralRecorded = await recordReferral(startParam, user.id);
    }

    await supabaseInsert('cp_growth_events', {
      telegram_user_id: user.id,
      event,
      source,
      metadata: referralRecorded ? { ...storedMetadata, referralRecorded: true } : storedMetadata,
    });
    return Response.json({ ok: true, referralRecorded });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to record event.', 400);
  }
}
