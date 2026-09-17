import { NextRequest, NextResponse } from 'next/server';
import { parseWithOptionalLLM } from '../../../lib/agent-core';
import { requireTelegramUser } from '../../../lib/mini-auth';
import { supabaseInsert } from '../../../lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const user = requireTelegramUser(request);
    const body = await request.json() as { text?: unknown };
    if (typeof body.text !== 'string' || body.text.trim().length < 2 || body.text.length > 2000) {
      return NextResponse.json({ error: 'Enter a request between 2 and 2000 characters.' }, { status: 400 });
    }
    const intent = await parseWithOptionalLLM(body.text);
    await supabaseInsert('cp_growth_events', {
      telegram_user_id: user.id,
      event: 'agent_intent',
      source: 'mini_agent',
      metadata: { action: intent.action, symbols: intent.symbols, chains: intent.chains, amountUsd: intent.amountUsd ?? null },
    });
    return NextResponse.json({ ok: true, intent });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Agent request failed.' }, { status: 400 });
  }
}
