import { Bot, InlineKeyboard } from 'grammy';

interface ExecutionContextLike { waitUntil(promise: Promise<unknown>): void; }
interface ScheduledControllerLike { cron: string; scheduledTime: number; }

export interface Env {
  BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  MINI_APP_URL?: string;
  MARKET_DATA_API_KEY?: string;
}

type SupabaseRow = Record<string, unknown>;

function supabase(env: Env) {
  const base = env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/';
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  };
  return { base, headers };
}

async function rpc(env: Env, fn: string, args: Record<string, unknown>): Promise<SupabaseRow[]> {
  const { base, headers } = supabase(env);
  const response = await fetch(base.replace('/rest/v1/', '/rest/v1/rpc/') + fn, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error(`Supabase RPC ${fn} failed: ${response.status} ${await response.text()}`);
  const body = await response.json();
  return Array.isArray(body) ? body as SupabaseRow[] : [];
}

function updateKey(update: any): string {
  if (Number.isInteger(update?.update_id)) return 'telegram:update:' + update.update_id;
  const callbackId = update?.callback_query?.id;
  if (callbackId) return 'telegram:callback:' + callbackId;
  const chatId = update?.message?.chat?.id ?? update?.inline_query?.from?.id ?? 'unknown';
  return 'telegram:fallback:' + String(chatId) + ':' + crypto.randomUUID();
}

async function acceptUpdate(env: Env, update: any): Promise<boolean> {
  const key = updateKey(update);
  const rows = await rpc(env, 'cp_edge_accept', {
    p_idempotency_key: key,
    p_operation: 'telegram_update',
    p_actor_key: String(update?.message?.from?.id ?? update?.callback_query?.from?.id ?? ''),
    p_job_type: 'telegram_update',
    p_payload: update,
    p_max_attempts: 8,
  });
  return rows[0]?.accepted === true;
}


async function acceptDurableJob(env: Env, key: string, operation: string, actorKey: string, jobType: string, payload: unknown): Promise<boolean> {
  const rows = await rpc(env, 'cp_edge_accept', {
    p_idempotency_key: key,
    p_operation: operation,
    p_actor_key: actorKey,
    p_job_type: jobType,
    p_payload: payload,
    p_max_attempts: 8,
  });
  return rows[0]?.accepted === true;
}

async function processReferralAttribution(env: Env, payload: any): Promise<void> {
  const { base, headers } = supabase(env);
  const userId = Number(payload.userId);
  const referralPayload = String(payload.referralPayload ?? '');
  if (!Number.isSafeInteger(userId) || userId <= 0 || !/^ref_[A-Za-z0-9_-]{1,64}$/.test(referralPayload)) return;

  const token = referralPayload.slice(4);
  const referrerQuery = /^\d+$/.test(token)
    ? 'telegram_user_id=eq.' + encodeURIComponent(token)
    : 'referral_code=eq.' + encodeURIComponent(token.toLowerCase());

  const [referrerRows, referredRows] = await Promise.all([
    fetch(base + 'cp_users?' + referrerQuery + '&select=id,telegram_user_id&limit=1', { headers }).then(r => r.json()) as Promise<Array<{id:string;telegram_user_id:number}>>,
    fetch(base + 'cp_users?telegram_user_id=eq.' + userId + '&select=id&limit=1', { headers }).then(r => r.json()) as Promise<Array<{id:string}>>
  ]);
  const referrer = referrerRows[0];
  const referred = referredRows[0];
  if (!referrer?.id || !referred?.id || referrer.id === referred.id || Number(referrer.telegram_user_id) === userId) return;

  await fetch(base + 'cp_referrals?on_conflict=referred_user_id', {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({
      referrer_user_id: referrer.id,
      referred_user_id: referred.id,
      source: 'telegram_start_edge',
    }),
  });
}

async function processStarsPayment(env: Env, payload: any): Promise<void> {
  const { base, headers } = supabase(env);
  const payment = payload.payment;
  const telegramUserId = Number(payload.telegramUserId);
  if (!payment || !Number.isSafeInteger(telegramUserId) || telegramUserId <= 0) return;

  const users = await fetch(base + 'cp_users?telegram_user_id=eq.' + telegramUserId + '&select=id&limit=1', { headers }).then(r => r.json()) as Array<{id:string}>;
  const userId = users[0]?.id;
  if (!userId) throw new Error('Stars payment received before user registration.');

  await fetch(base + 'cp_stars_payments?on_conflict=telegram_payment_charge_id', {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({
      user_id: userId,
      telegram_user_id: telegramUserId,
      plan: 'pro',
      amount_stars: Number(payment.total_amount ?? 0),
      currency: payment.currency ?? 'XTR',
      invoice_payload: payment.invoice_payload ?? null,
      telegram_payment_charge_id: payment.telegram_payment_charge_id,
      provider_payment_charge_id: payment.provider_payment_charge_id ?? null,
      is_recurring: Boolean(payment.is_recurring),
      is_first_recurring: Boolean(payment.is_first_recurring),
    }),
  });
}

async function telegram(env: Env, method: string, body: Record<string, unknown>): Promise<any> {
  const response = await fetch('https://api.telegram.org/bot' + env.BOT_TOKEN + '/' + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || data?.ok === false) throw new Error(`Telegram ${method} failed: ${JSON.stringify(data).slice(0, 1000)}`);
  return data;
}

function createBot(env: Env): Bot {
  const bot = new Bot(env.BOT_TOKEN);

  bot.use(async (ctx, next) => {
    try {
      if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => {});
      await next();
    } catch (error) {
      console.error('Edge boundary recovered update failure:', error);
      try {
        if (ctx.chat?.id) {
          await ctx.reply('⚠️ CryptoPulse recovered a temporary error. Please retry the action.');
        }
      } catch (fallbackError) {
        console.error('Edge fallback response failed:', fallbackError);
      }
    }
  });

  bot.command('start', async (ctx) => {
    const locale = ctx.from?.language_code === 'ar' ? 'ar' : 'en';
    const payload = typeof ctx.match === 'string' ? ctx.match.trim().slice(0, 64).replace(/[^A-Za-z0-9_-]/g, '') : '';
    const userId = ctx.from?.id;
    const { base, headers } = supabase(env);

    if (userId) {
      await fetch(base + 'cp_users?on_conflict=telegram_user_id', {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          telegram_user_id: userId,
          username: ctx.from?.username ?? null,
          display_name: [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || null,
          language: locale,
          updated_at: new Date().toISOString(),
        }),
      });
    }

    await ctx.reply(
      locale === 'ar'
        ? '🚀 CryptoPulse Pro\n\nEdge-native market intelligence داخل Telegram.\n\nطلبك يدخل مسارًا موزعًا مقاومًا للتكرار.'
        : '🚀 CryptoPulse Pro\n\nEdge-native market intelligence inside Telegram.\n\nYour action enters a distributed idempotent execution path.',
      {
        reply_markup: new InlineKeyboard()
          .text('📈 Markets', 'markets')
          .text('⚡ Signals', 'signals')
          .row()
          .text('💰 Referral', 'referral')
          .text('⭐ Pro', 'pro')
          .row()
          .webApp('📊 Open Mini App', (env.MINI_APP_URL ?? '').replace(/\/$/, '') + '/mini'),
      },
    );

    if (payload && userId) {
      const accepted = await acceptDurableJob(
        env,
        'referral:start:' + userId + ':' + payload,
        'referral_attribution',
        String(userId),
        'referral_attribution',
        { userId, referralPayload: payload },
      );
      if (accepted) {
        ctx.api.sendMessage(userId, locale === 'ar' ? '🔗 تم تسجيل الإحالة وإدخالها في طابور المعالجة الموزع.' : '🔗 Referral recorded and placed into the distributed execution queue.').catch(() => {});
      }
    }
  });

  bot.callbackQuery('markets', async (ctx) => {
    await ctx.editMessageText('📈 Markets\n\nLive provider aggregation is running at the Edge. Use the Mini App for the full market panel.');
  });

  bot.callbackQuery('signals', async (ctx) => {
    await ctx.editMessageText('⚡ Signals\n\nCoinMarketCap + CoinGecko are queried in parallel with stale-cache fallback.');
  });

  bot.callbackQuery('referral', async (ctx) => {
    const userId = ctx.from.id;
    const link = env.MINI_APP_URL
      ? env.MINI_APP_URL.replace(/\/$/, '') + '/mini/referral'
      : 'https://t.me/';
    await ctx.editMessageText('💰 Referral Center\n\nYour Telegram update is protected by distributed idempotency and durable execution.', {
      reply_markup: new InlineKeyboard().url('📊 Open Referral Center', link),
    });
  });

  bot.callbackQuery('pro', async (ctx) => {
    await ctx.editMessageText('⭐ Pro checkout is processed through the durable Stars/payment event path.');
  });

  bot.on('message:successful_payment', async (ctx) => {
    const payment = ctx.message.successful_payment;
    const accepted = await acceptDurableJob(
      env,
      'stars:' + payment.telegram_payment_charge_id,
      'stars_payment',
      String(ctx.from.id),
      'stars_payment',
      { telegramUserId: ctx.from.id, payment },
    );
    if (accepted) await ctx.reply('⭐ Payment received and queued for durable processing.');
    else await ctx.reply('⭐ Payment already accepted and is being processed safely.');
  });

  return bot;
}

async function processJobs(env: Env, limit = 20): Promise<void> {
  const jobs = await rpc(env, 'cp_claim_durable_jobs', { p_limit: limit, p_lease_seconds: 45 });

  for (const job of jobs) {
    const id = String(job.id);
    try {
      if (job.job_type === 'telegram_update') {
        const bot = createBot(env);
        await bot.handleUpdate(job.payload);
      } else if (job.job_type === 'referral_attribution') {
        await processReferralAttribution(env, job.payload);
      } else if (job.job_type === 'stars_payment') {
        await processStarsPayment(env, job.payload);
      } else {
        throw new Error('Unknown durable job type: ' + String(job.job_type));
      }
      await rpc(env, 'cp_complete_durable_job', {
        p_job_id: id,
        p_success: true,
        p_result: { processedAt: new Date().toISOString() },
      });
    } catch (error) {
      const attempts = Number(job.attempts ?? 1);
      const backoff = Math.min(3600, Math.max(2, 2 ** Math.min(attempts, 10)));
      await rpc(env, 'cp_complete_durable_job', {
        p_job_id: id,
        p_success: false,
        p_error: error instanceof Error ? error.message : String(error),
        p_backoff_seconds: backoff,
      }).catch((completionError) => console.error('Durable job completion failed:', completionError));
    }
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (url.pathname === '/health' || url.pathname === '/healthz') {
        return Response.json({ ok: true, service: 'cryptopulse-edge', architecture: 'cloudflare-edge+supabase-durable' });
      }

      if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
      if (env.TELEGRAM_WEBHOOK_SECRET && request.headers.get('x-telegram-bot-api-secret-token') !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response('Unauthorized', { status: 401 });
      }

      const update = await request.json();
      const accepted = await acceptUpdate(env, update);

      if (accepted) {
        ctx.waitUntil(processJobs(env, 20).catch(error => console.error('Edge durable processing failed:', error)));
      }

      return Response.json({ ok: true, accepted });
    } catch (error) {
      console.error('Zero-Crash Edge Boundary:', error);
      return Response.json({ ok: true, accepted: false, recovered: true });
    }
  },

  async scheduled(_controller: ScheduledControllerLike, env: Env, ctx: ExecutionContextLike): Promise<void> {
    ctx.waitUntil(processJobs(env, 50).catch(error => console.error('Scheduled durable worker failed:', error)));
  },
};
