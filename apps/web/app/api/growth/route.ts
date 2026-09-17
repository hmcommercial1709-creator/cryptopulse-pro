import { NextRequest } from 'next/server';
import { jsonError, requireTelegramUser } from '../../../lib/mini-auth';
import { supabaseInsert } from '../../../lib/supabase-admin';

const ALLOWED_EVENTS = new Set([
  'mini_open', 'market_view', 'watchlist_add', 'watchlist_remove', 'alert_create', 'alert_remove',
  'share_open', 'share_click', 'referral_open', 'activation', 'first_share', 'pro_view', 'agent_intent',
  'startapp_open',
]);

export async function POST(request: NextRequest) {
  try {
    const user = requireTelegramUser(request);
    const body = await request.json() as { event?: unknown; source?: unknown; metadata?: unknown };
    const event = typeof body.event === 'string' ? body.event : '';
    if (!ALLOWED_EVENTS.has(event)) throw new Error('Unsupported growth event.');
    const source = typeof body.source === 'string' ? body.source.slice(0, 80) : null;
    const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : {};
    await supabaseInsert('cp_growth_events', { telegram_user_id: user.id, event, source, metadata });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to record event.', 400);
  }
}
