import { NextRequest } from 'next/server';
import { jsonError, requireTelegramUser } from '../../../lib/mini-auth';
import { supabaseInsert, supabaseSelect, supabaseUpsert } from '../../../lib/supabase-admin';

type Subscription = { plan?: string; plan_code?: string; status?: string; expires_at?: string };

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

function accessFor(subscription: Subscription | undefined) {
  const active = subscription?.status === 'active' && (!subscription.expires_at || new Date(subscription.expires_at).getTime() > Date.now());
  if (!active) return { plan: 'free', maxActiveTasks: 1, trialHours: 24 };
  if (subscription?.plan === 'vip' || subscription?.plan_code?.startsWith('vip')) return { plan: 'vip', maxActiveTasks: 100, trialHours: 0 };
  return { plan: 'pro', maxActiveTasks: 10, trialHours: 0 };
}

export async function POST(request: NextRequest) {
  try {
    const user = requireTelegramUser(request);
    const body = await request.json() as { instruction?: unknown; requiresConfirmation?: unknown };
    const instruction = typeof body.instruction === 'string' ? body.instruction.trim().slice(0, 4000) : '';
    if (!instruction) throw new Error('Task instruction is required.');

    const userId = await ensureUser(user);
    const subscriptions = await supabaseSelect(
      'cp_subscriptions',
      `user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=plan,plan_code,status,expires_at&order=expires_at.desc&limit=1`,
    );
    const access = accessFor(subscriptions[0] as Subscription | undefined);

    const activeTasks = await supabaseSelect(
      'cp_agent_tasks',
      `user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=id&limit=101`,
    );
    if (activeTasks.length >= access.maxActiveTasks) {
      throw new Error(
        access.plan === 'free'
          ? 'Your free trial allows 1 active AI task for up to 24 hours. Upgrade to Pro or VIP to keep more tasks running.'
          : 'You have reached the active AI task limit for your plan.',
      );
    }

    const now = Date.now();
    const expiresAt = access.plan === 'free' ? new Date(now + 24 * 60 * 60 * 1000).toISOString() : null;
    const rows = await supabaseInsert('cp_agent_tasks', {
      user_id: userId,
      plan_code: access.plan,
      title: instruction.slice(0, 120),
      instruction,
      task_type: 'monitor',
      status: 'active',
      requires_confirmation: body.requiresConfirmation !== false,
      execution_policy: {
        source: 'mini_app',
        financial_execution: 'approval_required',
        trial: access.plan === 'free',
        expires_at: expiresAt,
        created_from: 'personal_ai_agent',
      },
      next_run_at: new Date(now + 5 * 60 * 1000).toISOString(),
    });

    return Response.json({
      ok: true,
      plan: access.plan,
      trial: access.plan === 'free',
      expiresAt,
      task: rows[0] ?? null,
      message: access.plan === 'free'
        ? 'Your 24-hour AI trial task is active. Upgrade to Pro or VIP when you want longer-running automation and more tasks.'
        : 'Your AI task is active.',
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to create task.', 400);
  }
}
