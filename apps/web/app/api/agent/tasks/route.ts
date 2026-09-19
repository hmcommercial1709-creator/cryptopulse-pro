import { NextRequest } from 'next/server';
import { jsonError, requireTelegramUser } from '../../../lib/mini-auth';
import { supabaseInsert, supabaseUpsert } from '../../../lib/supabase-admin';

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

export async function POST(request: NextRequest) {
  try {
    const user = requireTelegramUser(request);
    const body = await request.json() as { instruction?: unknown; requiresConfirmation?: unknown };
    const instruction = typeof body.instruction === 'string' ? body.instruction.trim().slice(0, 4000) : '';
    if (!instruction) throw new Error('Task instruction is required.');
    const userId = await ensureUser(user);
    const rows = await supabaseInsert('cp_agent_tasks', {
      user_id: userId,
      plan_code: 'free',
      title: instruction.slice(0, 120),
      instruction,
      task_type: 'monitor',
      status: 'active',
      requires_confirmation: body.requiresConfirmation !== false,
      execution_policy: { source: 'mini_app', financial_execution: 'approval_required' },
    });
    return Response.json({ ok: true, task: rows[0] ?? null });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to create task.', 400);
  }
}
