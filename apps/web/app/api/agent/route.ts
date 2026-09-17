import { NextRequest, NextResponse } from 'next/server';
import { parseWithOptionalLLM } from '../../../lib/agent-core';
import { requireTelegramUser } from '../../../lib/mini-auth';
import { runInstitutionalSwarm } from '../../../lib/swarm/orchestrator';
import { enforceRateLimit, idempotencyFingerprint, requestFingerprint, requireIdempotencyHeader } from '../../../lib/security';
import { supabaseInsert, supabaseSelect, supabaseUpsert } from '../../../lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const user = requireTelegramUser(request);
    const body = await request.json() as { text?: unknown };
    if (typeof body.text !== 'string' || body.text.trim().length < 2 || body.text.length > 2000) {
      return NextResponse.json({ error: 'Enter a request between 2 and 2000 characters.' }, { status: 400 });
    }
    const key = requireIdempotencyHeader(request);
    enforceRateLimit(`agent:${requestFingerprint(request, user.id)}`, 20, 60_000);
    const existing = await supabaseSelect('cp_request_idempotency', `telegram_user_id=eq.${encodeURIComponent(String(user.id))}&idempotency_key=eq.${encodeURIComponent(key)}&select=response_json`);
    if (existing[0]?.response_json) return NextResponse.json(existing[0].response_json);

    const intent = await parseWithOptionalLLM(body.text);
    const fingerprint = idempotencyFingerprint(user.id, key, intent);
    const context = {
      action: intent.action === 'execute' ? 'prepare' as const : intent.action,
      symbols: intent.symbols,
      chains: intent.chains,
      amountUsd: intent.amountUsd,
    };
    const report = await runInstitutionalSwarm(context);
    const responsePayload = { ok: true, intent, report, execution: { requiresUserConfirmation: true, signing: 'wallet_only', broadcast: false } };
    await supabaseUpsert('cp_request_idempotency', {
      telegram_user_id: user.id,
      idempotency_key: key,
      fingerprint,
      response_json: responsePayload,
    }, 'telegram_user_id,idempotency_key');
    await supabaseInsert('cp_growth_events', {
      telegram_user_id: user.id,
      event: 'agent_intent',
      source: 'mini_agent',
      metadata: { fingerprint, action: intent.action, symbols: intent.symbols, chains: intent.chains, amountUsd: intent.amountUsd ?? null, committee: report.committee },
    });
    return NextResponse.json(responsePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent request failed.';
    const status = message === 'Rate limit exceeded.' ? 429 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
