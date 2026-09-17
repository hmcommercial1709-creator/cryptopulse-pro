import { NextRequest } from 'next/server';
import { jsonError, requireTelegramUser } from '../../../lib/mini-auth';
import { supabaseInsert } from '../../../lib/supabase-admin';

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
    await supabaseInsert('cp_growth_events', { telegram_user_id: user.id, event, source, metadata: storedMetadata });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to record event.', 400);
  }
}
