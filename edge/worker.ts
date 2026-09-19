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
  AI?: {
    run(model: string, input: unknown, options?: unknown): Promise<unknown>;
  };
}

type Locale = 'ar' | 'en';

const I18N: Record<Locale, {
  startTitle: string;
  startBody: string;
  markets: string;
  signals: string;
  referral: string;
  pro: string;
  miniApp: string;
  referralCenter: string;
  referralBody: string;
  referralOpen: string;
  proTitle: string;
  proBody: string;
  paymentSuccess: string;
  marketsBody: string;
  signalsBody: string;
}> = {
  en: {
    startTitle: '🚀 CryptoPulse Pro',
    startBody:
      'Automate your digital-market watch with smart market insights and trading signals in one place.\n\n' +
      '📈 Track market conditions and discover useful market intelligence.\n' +
      '⚡ Follow smart signals designed to help you monitor opportunities faster.\n' +
      '💰 Referral rewards: invite friends with your referral link and earn according to the active referral program.\n' +
      '⭐ Pro Membership: unlock premium features quickly through Telegram Stars.\n\n' +
      'Choose an option below to get started:',
    markets: '📈 Markets',
    signals: '⚡ Signals',
    referral: '💰 Referral',
    pro: '⭐ Pro Membership',
    miniApp: '📊 Open Mini App',
    referralCenter: '💰 Referral Center',
    referralBody:
      'Invite friends with your referral link and track your referral activity from CryptoPulse Pro. Rewards are subject to the current referral-program terms.',
    referralOpen: '📊 Open Referral Center',
    proTitle: '⭐ CryptoPulse Pro Membership',
    proBody:
      'Unlock premium CryptoPulse Pro features with Telegram Stars. The Mini App provides the fastest way to review available Pro options.',
    paymentSuccess: '⭐ Payment received successfully. Your Pro membership activation is being processed.',
    marketsBody:
      '📈 Markets\n\nMonitor digital-market conditions and access CryptoPulse Pro market intelligence.',
    signalsBody:
      '⚡ Signals\n\nReview CryptoPulse Pro smart-signal infrastructure and available trading signals.',
  },
  ar: {
    startTitle: '🚀 CryptoPulse Pro',
    startBody:
      'أتمتة متابعة الأسواق الرقمية والوصول إلى معلومات السوق والإشارات الذكية من مكان واحد.\n\n' +
      '📈 تابع ظروف السوق واكتشف معلومات مفيدة لاتخاذ قراراتك.\n' +
      '⚡ راقب الإشارات الذكية المصممة لمساعدتك على متابعة الفرص بسرعة.\n' +
      '💰 نظام الإحالة المربح: ادعُ أصدقاءك عبر رابط الإحالة واكسب وفق شروط برنامج الإحالة النشط.\n' +
      '⭐ عضوية Pro: فعّل الميزات المميزة بسرعة عبر Telegram Stars.\n\n' +
      'اختر الخدمة التي تريد البدء بها:',
    markets: '📈 الأسواق',
    signals: '⚡ الإشارات',
    referral: '💰 الإحالة المربحة',
    pro: '⭐ عضوية Pro',
    miniApp: '📊 فتح التطبيق',
    referralCenter: '💰 مركز الإحالة',
    referralBody:
      'ادعُ أصدقاءك عبر رابط الإحالة وتابع نشاط الإحالات من داخل CryptoPulse Pro. تخضع المكافآت لشروط برنامج الإحالة الحالي.',
    referralOpen: '📊 فتح مركز الإحالة',
    proTitle: '⭐ عضوية CryptoPulse Pro',
    proBody:
      'افتح ميزات CryptoPulse Pro المميزة باستخدام Telegram Stars. يوفّر الـMini App أسرع طريقة لاستعراض خيارات Pro المتاحة.',
    paymentSuccess: '⭐ تم استلام الدفع بنجاح. جارٍ معالجة تفعيل عضوية Pro.',
    marketsBody:
      '📈 الأسواق\n\nتابع ظروف الأسواق الرقمية واستفد من معلومات السوق داخل CryptoPulse Pro.',
    signalsBody:
      '⚡ الإشارات\n\nاطّلع على بنية الإشارات الذكية وإشارات التداول المتاحة في CryptoPulse Pro.',
  },
};

function getLocale(languageCode?: string): Locale {
  return languageCode?.trim().toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

function t(locale: Locale) {
  return I18N[locale];
}

const DEFAULT_MINI_APP_URL = 'https://cryptopulse-pro-mini-app.hmcommercial1709.workers.dev';
// Cache-bust Telegram Mini App links whenever the deployed frontend changes.
// Telegram can retain an older Web App document for an existing URL, so every
// production frontend release gets an explicit version query string.
const MINI_APP_RELEASE = '2026-09-19-03';

function getMiniAppBaseUrl(env: Env): string {
  const configured = String(env.MINI_APP_URL ?? '').trim().replace(/\/+$/, '');
  return configured || DEFAULT_MINI_APP_URL;
}

function getVersionedMiniAppUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  // The Telegram WebApp URL must be /mini?v=release, not ?v=release/mini.
  // Keep the application path before the query string so Telegram opens the
  // actual Next.js Mini App route instead of a malformed query URL.
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/mini') ? path : path + '/mini';
  url.searchParams.set('v', MINI_APP_RELEASE);
  return url.toString();
}

function getMiniAppSectionUrl(baseUrl: string, section: 'markets' | 'signals' | 'referral' | 'pro'): string {
  const url = new URL(getVersionedMiniAppUrl(baseUrl));
  url.hash = section;
  return url.toString();
}

type RecoveryAction = 'telegram_config' | 'mini_app_health' | 'none';

async function askRecoveryAgent(env: Env, failure: string, path: string): Promise<RecoveryAction> {
  if (!env.AI) return 'none';
  try {
    const result = await env.AI.run('@cf/moonshotai/kimi-k2.6', {
      messages: [{
        role: 'system',
        content: 'You are CryptoPulse Pro operations recovery agent. Return JSON only: {"action":"telegram_config"|"mini_app_health"|"none"}. Choose only the safest operational recovery action. Never suggest code changes, credential changes, payments changes, database destructive actions, or security bypasses.'
      }, {
        role: 'user',
        content: JSON.stringify({ path, failure: failure.slice(0, 1800) })
      }]
    }, { gateway: { id: 'default', collectLog: true, metadata: { service: 'cryptopulse-edge', task: 'self-heal' } } });
    const text = typeof result === 'string' ? result : JSON.stringify(result);
    const match = text.match(/"action"\s*:\s*"(telegram_config|mini_app_health|none)"/);
    return (match?.[1] as RecoveryAction | undefined) ?? 'none';
  } catch (error) {
    console.error('Recovery AI failed:', error);
    return 'none';
  }
}

async function autonomousRecovery(env: Env, origin: string, failure: string, path: string): Promise<void> {
  const action = await askRecoveryAgent(env, failure, path);
  if (action === 'telegram_config') {
    await selfHealTelegramConfiguration(env, origin);
    return;
  }
  if (action === 'mini_app_health') {
    const healthUrl = getVersionedMiniAppUrl(getMiniAppBaseUrl(env)).replace(/\/mini\?[^#]+$/, '/api/health');
    const response = await fetch(healthUrl, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Mini App health recovery check returned HTTP ' + response.status);
  }
}

async function selfHealTelegramConfiguration(env: Env, origin: string): Promise<void> {
  const bot = new Bot(env.BOT_TOKEN);
  const miniAppUrl = getVersionedMiniAppUrl(getMiniAppBaseUrl(env));
  const webhookUrl = `${origin.replace(/\/$/, '')}/`;
  await bot.api.setWebhook(webhookUrl, {
    secret_token: String(env.TELEGRAM_WEBHOOK_SECRET ?? '').trim() || undefined,
    allowed_updates: ['message', 'callback_query', 'pre_checkout_query'],
    drop_pending_updates: false,
  });
  await bot.api.setChatMenuButton({
    menu_button: {
      type: 'web_app',
      text: 'Open CryptoPulse',
      web_app: { url: miniAppUrl },
    },
  });
}

let cachedBotToken = '';
let cachedBot: Bot | undefined;
let cachedBotInitPromise: Promise<Bot> | undefined;

function getSupabase(env: Env) {
  const url = String(env.SUPABASE_URL ?? '').trim();
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

  if (!url) throw new Error('Missing SUPABASE_URL Cloudflare Worker variable.');
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

type TelegramUser = {
  id?: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: {
    chat?: { id?: number; type?: string };
    from?: TelegramUser;
    successful_payment?: Record<string, unknown>;
  };
  web_app_data?: { data?: string };
  pre_checkout_query?: { id?: string; from?: TelegramUser; currency?: string; total_amount?: number; invoice_payload?: string };
  callback_query?: {
    from?: TelegramUser;
    message?: { chat?: { id?: number } };
    data?: string;
  };
};

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
      username: from.username ?? null,
      display_name: [from.first_name, from.last_name].filter(Boolean).join(' ') || null,
      language: getLocale(from.language_code),
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
    throw new Error(
      `Referral insert failed (${response.status}): ${(await response.text()).slice(0, 1000)}`,
    );
  }
}

type SubscriptionPlan = {
  code: string;
  name: string;
  description: string;
  price_stars: number;
  billing_period: 'monthly' | 'annual';
  recurring: boolean;
  features: string[];
};

async function getSubscriptionPlans(env: Env): Promise<SubscriptionPlan[]> {
  const { base, headers } = getSupabase(env);
  const response = await fetch(
    `${base}cp_subscription_plans?active=eq.true&select=code,name,description,price_stars,billing_period,recurring,features&order=price_stars.asc`,
    { headers },
  );
  if (!response.ok) throw new Error(`Subscription plans lookup failed (${response.status}).`);
  return await response.json() as SubscriptionPlan[];
}

function starsPlanKeyboard(plans: SubscriptionPlan[], miniAppBaseUrl: string): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const plan of plans) {
    keyboard.text(`${plan.name} · ⭐${plan.price_stars}`, `buy_plan:${plan.code}`).row();
  }
  keyboard.webApp('📊 Open CryptoPulse', getVersionedMiniAppUrl(miniAppBaseUrl));
  return keyboard;
}

async function sendStarsInvoice(env: Env, ctx: any, plan: SubscriptionPlan): Promise<void> {
  await ctx.replyWithInvoice(
    plan.name,
    plan.description,
    `plan:${plan.code}`,
    'XTR',
    [{ label: plan.name, amount: plan.price_stars }],
    { provider_token: '' },
  );
}

async function processPreCheckout(env: Env, update: TelegramUpdate): Promise<void> {
  const query = update.pre_checkout_query;
  if (!query?.id) return;
  const payload = String(query.invoice_payload ?? '');
  const match = /^plan:(.+)$/.exec(payload);
  if (!match || query.currency !== 'XTR') throw new Error('Invalid CryptoPulse Stars checkout.');
  const plans = await getSubscriptionPlans(env);
  const plan = plans.find((item) => item.code === match[1]);
  if (!plan || Number(query.total_amount) !== plan.price_stars) throw new Error('Plan price mismatch.');
  const bot = await getBot(env);
  await bot.api.answerPreCheckoutQuery(query.id, true);
}

async function activateSubscriptionFromPayment(env: Env, payment: Record<string, unknown>, telegramUserId: number, userId: string): Promise<void> {
  const payload = String(payment.invoice_payload ?? '');
  const match = /^plan:(.+)$/.exec(payload);
  if (!match) return;
  const plans = await getSubscriptionPlans(env);
  const plan = plans.find((item) => item.code === match[1]);
  if (!plan) throw new Error('Paid plan no longer exists.');
  const chargeId = String(payment.telegram_payment_charge_id ?? '');
  const expires = new Date(Date.now() + (plan.billing_period === 'annual' ? 365 : 30) * 86400000).toISOString();
  const { base, headers } = getSupabase(env);
  const response = await fetch(`${base}cp_subscriptions?on_conflict=user_id`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      user_id: userId,
      plan: plan.code.startsWith('vip') ? 'vip' : 'pro',
      plan_code: plan.code,
      status: 'active',
      telegram_payment_charge_id: chargeId || null,
      starts_at: new Date().toISOString(),
      expires_at: expires,
      price_stars: plan.price_stars,
      currency: 'XTR',
      is_recurring: plan.recurring,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error(`Subscription activation failed (${response.status}).`);
}

async function processWebAppData(env: Env, update: TelegramUpdate): Promise<void> {
  const raw = String(update.web_app_data?.data ?? '');
  if (!raw) return;
  let data: { type?: string; plan?: string };
  try { data = JSON.parse(raw); } catch { return; }
  if (data.type !== 'buy_plan' || typeof data.plan !== 'string') return;
  const telegramUserId = update.message?.from?.id;
  const chatId = update.message?.chat?.id;
  if (!telegramUserId || !chatId) return;
  const plans = await getSubscriptionPlans(env);
  const plan = plans.find((item) => item.code === data.plan);
  if (!plan) throw new Error('Requested plan is unavailable.');
  const bot = await getBot(env);
  const options: Record<string, unknown> = { provider_token: '', start_parameter: `plan_${plan.code}` };
  if (plan.recurring) options.subscription_period = 2592000;
  await bot.api.sendInvoice(chatId, plan.name, plan.description, `plan:${plan.code}`, 'XTR', [{ label: plan.name, amount: plan.price_stars }], options as any);
}

async function processSuccessfulPayment(env: Env, update: TelegramUpdate): Promise<void> {
  const payment = update.message?.successful_payment;
  const telegramUserId = update.message?.from?.id;

  if (!payment || !Number.isSafeInteger(telegramUserId) || telegramUserId <= 0) return;

  const chargeId = String(payment.telegram_payment_charge_id ?? '');
  const invoicePayload = String(payment.invoice_payload ?? '');
  const planMatch = /^plan:(.+)$/.exec(invoicePayload);
  if (!chargeId || !invoicePayload || !planMatch) throw new Error('Invalid Telegram Stars payment payload.');
  const paidPlans = await getSubscriptionPlans(env);
  const paidPlan = paidPlans.find((item) => item.code === planMatch[1]);
  if (!paidPlan) throw new Error('Paid plan is unavailable.');

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
      plan: paidPlan.code.startsWith('vip') ? 'vip' : 'pro',
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
    throw new Error(
      `Stars payment insert failed (${response.status}): ${(await response.text()).slice(0, 1200)}`,
    );
  }

  await activateSubscriptionFromPayment(env, payment, telegramUserId, userId);
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

      const locale = getLocale(ctx.from?.language_code);
      const copy = t(locale);
      const keyboard = new InlineKeyboard();
      const miniAppBaseUrl = getMiniAppBaseUrl(env);
      const miniAppUrl = getVersionedMiniAppUrl(miniAppBaseUrl);

      if (miniAppUrl) {
        keyboard
          .webApp(copy.markets, getMiniAppSectionUrl(miniAppBaseUrl, 'markets'))
          .webApp(copy.signals, getMiniAppSectionUrl(miniAppBaseUrl, 'signals'))
          .row()
          .webApp(copy.referral, getMiniAppSectionUrl(miniAppUrl, 'referral'))
          .webApp(copy.pro, getMiniAppSectionUrl(miniAppUrl, 'pro'))
          .row()
          .webApp(copy.miniApp, miniAppUrl);
      }

      await ctx.reply(
        `${copy.startTitle}\n\n${copy.startBody}`,
        { reply_markup: keyboard },
      );
    });

    bot.callbackQuery('markets', async (ctx) => {
      const locale = getLocale(ctx.from?.language_code);
      await ctx.editMessageText(t(locale).marketsBody);
    });

    bot.callbackQuery('signals', async (ctx) => {
      const locale = getLocale(ctx.from?.language_code);
      await ctx.editMessageText(t(locale).signalsBody);
    });

    bot.callbackQuery('referral', async (ctx) => {
      const locale = getLocale(ctx.from?.language_code);
      const copy = t(locale);
      const miniAppUrl = getVersionedMiniAppUrl(getMiniAppBaseUrl(env));
      const url = miniAppUrl ? `${miniAppUrl}#referral` : null;

      await ctx.editMessageText(
        `${copy.referralCenter}\n\n${copy.referralBody}`,
        url
          ? { reply_markup: new InlineKeyboard().url(copy.referralOpen, url) }
          : undefined,
      );
    });

    bot.callbackQuery('pro', async (ctx) => {
      const locale = getLocale(ctx.from?.language_code);
      const copy = t(locale);
      const miniAppUrl = getVersionedMiniAppUrl(getMiniAppBaseUrl(env));
      const url = miniAppUrl ? `${miniAppUrl}#pro` : null;

      await ctx.editMessageText(
        `${copy.proTitle}\n\n${copy.proBody}`,
        url
          ? { reply_markup: new InlineKeyboard().url(copy.miniApp, url) }
          : undefined,
      );
    });

    bot.on('pre_checkout_query', async (ctx) => {
      try {
        await processPreCheckout(env, ctx.update as TelegramUpdate);
      } catch (error) {
        await ctx.api.answerPreCheckoutQuery(ctx.preCheckoutQuery.id, false, error instanceof Error ? error.message : 'Checkout validation failed.').catch(() => undefined);
      }
    });

    bot.on('message:web_app_data', async (ctx) => {
      await processWebAppData(env, ctx.update as TelegramUpdate);
    });

    bot.on('message:successful_payment', async (ctx) => {
      await processSuccessfulPayment(env, ctx.update as TelegramUpdate);
      const locale = getLocale(ctx.from?.language_code);
      await ctx.reply(t(locale).paymentSuccess);
    });

    bot.command('plans', async (ctx) => {
      const plans = await getSubscriptionPlans(env);
      const locale = getLocale(ctx.from?.language_code);
      const intro = locale === 'ar'
        ? '⭐ اختر الخطة المناسبة لك. Pro يبدأ من 299 ⭐، وVIP هو المستوى الأعلى.'
        : '⭐ Choose your plan. Pro starts at 299 ⭐, while VIP is the highest tier.';
      await ctx.reply(intro, {
        reply_markup: starsPlanKeyboard(plans, getMiniAppBaseUrl(env)),
      });
    });

    bot.callbackQuery(/^buy_plan:(.+)$/, async (ctx) => {
      const code = String(ctx.match?.[1] ?? '').trim();
      const plans = await getSubscriptionPlans(env);
      const plan = plans.find((item) => item.code === code);
      if (!plan) {
        await ctx.answerCallbackQuery({ text: 'Plan unavailable.', show_alert: true }).catch(() => undefined);
        return;
      }
      await ctx.answerCallbackQuery().catch(() => undefined);
      await sendStarsInvoice(env, ctx, plan);
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
  return (request.headers.get('x-telegram-bot-api-secret-token') ?? '') === configured;
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
        try {
          await selfHealTelegramConfiguration(env, url.origin);
        } catch (error) {
          console.error('Telegram self-heal failed:', error);
        }
        return Response.json({
          ok: true,
          service: 'cryptopulse-edge',
          mode: 'direct-telegram-execution',
          durableJobs: false,
          timestamp: new Date().toISOString(),
        });
      }

      // Public browser entrypoint: send Mini App traffic to the real Next.js/OpenNext frontend.
      // POST remains reserved for the Telegram webhook.
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/mini')) {
        return Response.redirect(getVersionedMiniAppUrl(getMiniAppBaseUrl(env)), 302);
      }

      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { Allow: 'GET, POST' },
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
        try { await autonomousRecovery(env, url.origin, error instanceof Error ? error.message : String(error), url.pathname); } catch (recoveryError) { console.error('Autonomous Telegram recovery failed:', recoveryError); }
        return new Response('Internal Server Error', { status: 500 });
      }
    } catch (error) {
      console.error('CryptoPulse Edge boundary failure:', error);
      try { const failedUrl = new URL(request.url); await autonomousRecovery(env, failedUrl.origin, error instanceof Error ? error.message : String(error), failedUrl.pathname); } catch (recoveryError) { console.error('Autonomous recovery failed:', recoveryError); }
      return new Response('Internal Server Error', { status: 500 });
    }
  },

  async scheduled(
    _controller: ScheduledControllerLike,
    env: Env,
    _ctx: ExecutionContextLike,
  ): Promise<void> {
    const origin = 'https://cryptopulse-pro-edge.hmcommercial1709.workers.dev';
    try {
      await selfHealTelegramConfiguration(env, origin);
      const healthUrl = getVersionedMiniAppUrl(getMiniAppBaseUrl(env)).replace(/\/mini\?[^#]+$/, '/api/health');
      const response = await fetch(healthUrl, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Mini App health HTTP ' + response.status);
    } catch (error) {
      try {
        await autonomousRecovery(env, origin, error instanceof Error ? error.message : String(error), 'scheduled-health');
      } catch (recoveryError) {
        console.error('Scheduled autonomous recovery failed:', recoveryError);
      }
    }
  },
};
