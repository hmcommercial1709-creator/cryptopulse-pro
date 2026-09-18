import { Bot, InlineKeyboard } from 'grammy';

interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

interface ScheduledControllerLike {
  cron: string;
  scheduledTime: number;
}

export interface Env {
  BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  MINI_APP_URL?: string;
  MARKET_DATA_API_KEY?: string;
}

let cachedBotToken = '';
let cachedBot: Bot | undefined;
let cachedBotInitPromise: Promise<Bot> | undefined;

function getSupabase(env: Env) {
  const url = String(env.SUPABASE_URL ?? '').trim();
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

  if (!url) throw new Error('Missing SUPABASE_URL Cloudflare Worker secret.');
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY Cloudflare Worker secret.');

  return {
    base: url.replace(/\/+$/, '') + '/rest/v1/',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };
}

async function supabaseRpc(
  env: Env,
  functionName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { base, headers } = getSupabase(env);
  const response = await fetch(`${base}rpc/${functionName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Supabase RPC ${functionName} failed (${response.status}): ${text.slice(0, 1500)}`,
    );
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function claimTelegramUpdate(env: Env, updateId: number): Promise<boolean> {
  const result = await supabaseRpc(env, 'cp_claim_telegram_update', {
    p_update_id: updateId,
    p_lease_seconds: 60,
  });
  return result === true;
}

async function completeTelegramUpdate(
  env: Env,
  updateId: number,
  success: boolean,
  error?: unknown,
): Promise<void> {
  await supabaseRpc(env, 'cp_complete_telegram_update', {
    p_update_id: updateId,
    p_success: success,
    p_error: error instanceof Error ? error.message : error ? String(error) : null,
  });
}

type TelegramUpdate = {
  update_id: number;
  message?: {
    chat?: { id?: number; type?: string };
    from?: {
      id?: number;
      username?: string;
      first_name?: string;
      last_name?: string;
      language_code?: string;
    };
    successful_payment?: Record<string, unknown>;
  };
  callback_query?: {
    from?: {
      id?: number;
      username?: string;
      first_name?: string;
      last_name?: string;
      language_code?: string;
    };
    message?: { chat?: { id?: number } };
    data?: string;
  };
};

function getLocale(languageCode?: string): 'ar' | 'en' {
  return languageCode?.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

function getActorId(update: TelegramUpdate): number | null {
  const id = update.message?.from?.id ?? update.callback_query?.from?.id ?? null;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function upsertTelegramUser(env: Env, update: TelegramUpdate): Promise<string | null> {
  const from = update.message?.from ?? update.callback_query?.from;
  const telegramUserId = from?.id;
  if (!Number.isSafeInteger(telegramUserId) || telegramUserId <= 0) return null;

  const { base, headers } = getSupabase(env);
  const response = await fetch(`${base}cp_users?on_conflict=telegram_user_id`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      telegram_user_id: telegramUserId,
      username: from?.username ?? null,
      display_name: [from?.first_name, from?.last_name].filter(Boolean).join(' ') || null,
      language: getLocale(from?.language_code),
      updated_at: new Date().toISOString(),
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`cp_users upsert failed (${response.status}): ${body.slice(0, 1500)}`);
  }

  try {
    const rows = JSON.parse(body) as Array<{ id?: string }>;
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function processReferral(
  env: Env,
  userId: number,
  referralPayload: string,
): Promise<void> {
  if (
    !Number.isSafeInteger(userId) ||
    userId <= 0 ||
    !/^ref_[A-Za-z0-9_-]{1,64}$/.test(referralPayload)
  ) {
    return;
  }

  const token = referralPayload.slice(4);
  const { base, headers } = getSupabase(env);
  const referrerQuery = /^\d+$/.test(token)
    ? `telegram_user_id=eq.${encodeURIComponent(token)}`
    : `referral_code=eq.${encodeURIComponent(token.toLowerCase())}`;

  const [referrerResponse, referredResponse] = await Promise.all([
    fetch(`${base}cp_users?${referrerQuery}&select=id,telegram_user_id&limit=1`, { headers }),
    fetch(`${base}cp_users?telegram_user_id=eq.${userId}&select=id&limit=1`, { headers }),
  ]);

  if (!referrerResponse.ok || !referredResponse.ok) {
    throw new Error('Referral lookup failed.');
  }

  const referrers = (await referrerResponse.json()) as Array<{
    id: string;
    telegram_user_id: number;
  }>;
  const referred = (await referredResponse.json()) as Array<{ id: string }>;

  const referrer = referrers[0];
  const referredUser = referred[0];

  if (
    !referrer?.id ||
    !referredUser?.id ||
    referrer.id === referredUser.id ||
    Number(referrer.telegram_user_id) === userId
  ) {
    return;
  }

  const response = await fetch(`${base}cp_referrals?on_conflict=referred_user_id`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify({
      referrer_user_id: referrer.id,
      referred_user_id: referredUser.id,
      source: 'telegram_start_direct',
    }),
  });

  if (!response.ok) {
    throw new Error(`Referral insert failed (${response.status}): ${(await response.text()).slice(0, 1000)}`);
  }
}

async function processSuccessfulPayment(env: Env, update: TelegramUpdate): Promise<void> {
  const payment = update.message?.successful_payment;
  const telegramUserId = update.message?.from?.id;

  if (!payment || !Number.isSafeInteger(telegramUserId) || telegramUserId <= 0) return;

  const chargeId = String(payment.telegram_payment_charge_id ?? '');
  const invoicePayload = String(payment.invoice_payload ?? '');
  if (!chargeId || !invoicePayload) throw new Error('Invalid Telegram Stars payment payload.');

  const { base, headers } = getSupabase(env);
  const usersResponse = await fetch(
    `${base}cp_users?telegram_user_id=eq.${telegramUserId}&select=id&limit=1`,
    { headers },
  );

  if (!usersResponse.ok) {
    throw new Error('Could not find Telegram user for Stars payment.');
  }

  const users = (await usersResponse.json()) as Array<{ id: string }>;
  const userId = users[0]?.id;
  if (!userId) throw new Error('Stars payment received before user registration.');

  const response = await fetch(`${base}cp_stars_payments?on_conflict=telegram_payment_charge_id`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify({
      user_id: userId,
      telegram_user_id: telegramUserId,
      plan: 'pro',
      amount_stars: Number(payment.total_amount ?? 0),
      currency: String(payment.currency ?? 'XTR'),
      invoice_payload: invoicePayload,
      telegram_payment_charge_id: chargeId,
      provider_payment_charge_id: payment.provider_payment_charge_id ?? null,
      is_recurring: Boolean(payment.is_recurring),
      is_first_recurring: Boolean(payment.is_first_recurring),
    }),
  });

  if (!response.ok) {
    throw new Error(`Stars payment insert failed (${response.status}): ${(await response.text()).slice(0, 1200)}`);
  }
}

async function getBot(env: Env): Promise<Bot> {
  if (cachedBot && cachedBotToken === env.BOT_TOKEN) return cachedBot;
  if (cachedBotInitPromise && cachedBotToken === env.BOT_TOKEN) return cachedBotInitPromise;

  cachedBotToken = env.BOT_TOKEN;

  cachedBotInitPromise = (async () => {
    const bot = new Bot(env.BOT_TOKEN);
    await bot.init();

    bot.use(async (ctx, next) => {
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery().catch(() => undefined);
      }
      await next();
    });

    bot.command('start', async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) throw new Error('Telegram /start update has no user id.');

      const payload =
        typeof ctx.match === 'string'
          ? ctx.match.trim().slice(0, 64).replace(/[^A-Za-z0-9_-]/g, '')
          : '';

      await upsertTelegramUser(env, ctx.update as TelegramUpdate);

      if (payload) {
        await processReferral(env, userId, payload);
      }

      const keyboard = new InlineKeyboard()
        .text('📈 Markets', 'markets')
        .text('⚡ Signals', 'signals')
        .row()
        .text('💰 Referral', 'referral')
        .text('⭐ Pro', 'pro');

      if (env.MINI_APP_URL) {
        keyboard.row().webApp(
          '📊 Open Mini App',
          `${env.MINI_APP_URL.replace(/\/$/, '')}/mini`,
        );
      }

      const locale = getLocale(ctx.from?.language_code);
      await ctx.reply(
        locale === 'ar'
          ? '🚀 CryptoPulse Pro\n\nمرحباً بك في CryptoPulse Pro.\n\nاختر الخدمة التي تريد استخدامها:'
          : '🚀 CryptoPulse Pro\n\nWelcome to CryptoPulse Pro.\n\nChoose a service:',
        { reply_markup: keyboard },
      );
    });

    bot.callbackQuery('markets', async (ctx) => {
      await ctx.editMessageText(
        '📈 Markets\n\nMarket intelligence is available inside CryptoPulse Pro.',
      );
    });

    bot.callbackQuery('signals', async (ctx) => {
      await ctx.editMessageText(
        '⚡ Signals\n\nCryptoPulse signal infrastructure is online.',
      );
    });

    bot.callbackQuery('referral', async (ctx) => {
      const url = env.MINI_APP_URL
        ? `${env.MINI_APP_URL.replace(/\/$/, '')}/mini/referral`
        : null;

      await ctx.editMessageText(
        '💰 Referral Center\n\nYour referral activity is protected against duplicate Telegram updates.',
        url
          ? { reply_markup: new InlineKeyboard().url('📊 Open Referral Center', url) }
          : undefined,
      );
    });

    bot.callbackQuery('pro', async (ctx) => {
      await ctx.editMessageText(
        '⭐ CryptoPulse Pro\n\nPro features are available through Telegram Stars.',
      );
    });

    bot.on('message:successful_payment', async (ctx) => {
      await processSuccessfulPayment(env, ctx.update as TelegramUpdate);
      await ctx.reply('⭐ Payment received successfully.');
    });

    bot.catch((error) => {
      throw error.error;
    });

    cachedBot = bot;
    return bot;
  })();

  try {
    return await cachedBotInitPromise;
  } finally {
    cachedBotInitPromise = undefined;
  }
}

async function handleTelegramUpdate(env: Env, update: TelegramUpdate): Promise<void> {
  const bot = await getBot(env);
  await bot.handleUpdate(update);
}

function validateTelegramUpdate(value: unknown): value is TelegramUpdate {
  if (!value || typeof value !== 'object') return false;
  const update = value as Partial<TelegramUpdate>;
  return Number.isSafeInteger(update.update_id) && Number(update.update_id) >= 0;
}

function webhookSecretMatches(request: Request, env: Env): boolean {
  const configured = String(env.TELEGRAM_WEBHOOK_SECRET ?? '').trim();
  if (!configured) return true;
  return (
    request.headers.get('x-telegram-bot-api-secret-token') ?? ''
  ) === configured;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContextLike,
  ): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (url.pathname === '/health' || url.pathname === '/healthz') {
        return Response.json({
          ok: true,
          service: 'cryptopulse-edge',
          mode: 'direct-telegram-execution',
          durableJobs: false,
          timestamp: new Date().toISOString(),
        });
      }

      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { Allow: 'POST' },
        });
      }

      if (!webhookSecretMatches(request, env)) {
        return new Response('Unauthorized', { status: 401 });
      }

      let rawUpdate: unknown;
      try {
        rawUpdate = await request.json();
      } catch {
        return new Response('Bad Request', { status: 400 });
      }

      if (!validateTelegramUpdate(rawUpdate)) {
        return Response.json({ ok: true, accepted: false });
      }

      const update = rawUpdate as TelegramUpdate;
      const claimed = await claimTelegramUpdate(env, update.update_id);

      if (!claimed) {
        return Response.json({ ok: true, duplicate: true });
      }

      try {
        await handleTelegramUpdate(env, update);
        await completeTelegramUpdate(env, update.update_id, true);
        return Response.json({ ok: true, processed: true });
      } catch (error) {
        try {
          await completeTelegramUpdate(env, update.update_id, false, error);
        } catch (completionError) {
          console.error('Failed to record Telegram update failure:', completionError);
        }
        console.error('Telegram update failed:', {
          updateId: update.update_id,
          actorId: getActorId(update),
          error,
        });
        return new Response('Internal Server Error', { status: 500 });
      }
    } catch (error) {
      console.error('CryptoPulse Edge boundary failure:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },

  async scheduled(
    _controller: ScheduledControllerLike,
    _env: Env,
    _ctx: ExecutionContextLike,
  ): Promise<void> {
    // No queue polling. Telegram webhook processing is direct and synchronous.
  },
};
