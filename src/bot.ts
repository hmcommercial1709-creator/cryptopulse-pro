import { Bot, InlineKeyboard } from 'grammy';
import { config, requireBotToken } from './config.js';
import { getMarketSnapshot, getMarketSnapshots } from './market.js';
import { buildBeginnerTradePlan, type RiskLevel } from './domain.js';
import { getLocale, t } from './i18n.js';

const REQUEST_DEDUP_WINDOW_MS = 1_250;
const recentRequests = new Map<string, number>();
const inFlightRequests = new Map<string, Promise<void>>();

function requestFingerprint(ctx: any): string {
  const userId = String(ctx.from?.id ?? 'anonymous');
  const action = String(ctx.callbackQuery?.data ?? ctx.message?.text ?? 'update').trim().slice(0, 120);
  const timeBucket = Math.floor(Date.now() / REQUEST_DEDUP_WINDOW_MS);
  return userId + ':' + action + ':' + timeBucket;
}

function lockKey(ctx: any): string {
  const userId = String(ctx.from?.id ?? 'anonymous');
  const action = String(ctx.callbackQuery?.data ?? ctx.message?.text ?? 'update').trim().slice(0, 120);
  return userId + ':' + action;
}

function isDuplicateRapidRequest(ctx: any): boolean {
  const key = requestFingerprint(ctx);
  const now = Date.now();
  const previous = recentRequests.get(key);
  recentRequests.set(key, now);
  if (recentRequests.size > 2000) {
    for (const [entry, timestamp] of recentRequests) {
      if (now - timestamp > REQUEST_DEDUP_WINDOW_MS * 2) recentRequests.delete(entry);
    }
  }
  return previous !== undefined && now - previous < REQUEST_DEDUP_WINDOW_MS;
}

function supabaseAdminConfig(): { base: string; headers: Record<string, string> } | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return {
    base: url.replace(/\/$/, '') + '/rest/v1/',
    headers: { apikey: key, Authorization: 'Bearer ' + key },
  };
}

async function ensureTelegramUser(ctx: any, referralPayload: string): Promise<void> {
  const telegramUser = ctx.from;
  if (!telegramUser?.id) return;
  const supabase = supabaseAdminConfig();
  if (!supabase) {
    console.warn('Referral attribution skipped: Supabase admin environment is not configured.');
    return;
  }

  const language = telegramUser.language_code === 'ar' ? 'ar' : 'en';
  const displayName = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ').slice(0, 120) || null;
  const username = telegramUser.username?.slice(0, 120) ?? null;

  try {
    const response = await fetch(supabase.base + 'cp_users?on_conflict=telegram_user_id', {
      method: 'POST',
      headers: { ...supabase.headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        telegram_user_id: telegramUser.id,
        username,
        display_name: displayName,
        language,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!response.ok) throw new Error(await response.text());

    const refMatch = /^ref_([A-Za-z0-9_-]{1,64})$/.exec(referralPayload.trim());
    if (!refMatch) return;

    const referralToken = refMatch[1];
    if (!referralToken) return;
    const referrerQuery = /^\d+$/.test(referralToken)
      ? 'telegram_user_id=eq.' + encodeURIComponent(referralToken)
      : 'referral_code=eq.' + encodeURIComponent(referralToken.toLowerCase());
    const referrerRows = await fetch(
      supabase.base + 'cp_users?' + referrerQuery + '&select=id,telegram_user_id&limit=1',
      { headers: supabase.headers },
    ).then(r => r.json()) as Array<{ id: string; telegram_user_id: number }>;
    const referrerId = referrerRows[0]?.id;
    const referrerTelegramId = Number(referrerRows[0]?.telegram_user_id ?? 0);
    if (!referrerId || !Number.isSafeInteger(referrerTelegramId) || referrerTelegramId <= 0 || referrerTelegramId === telegramUser.id) return;

    const referredResponse = await fetch(supabase.base + 'cp_users?telegram_user_id=eq.' + telegramUser.id + '&select=id&limit=1', { headers: supabase.headers });
    const referred = await referredResponse.json() as Array<{ id: string }>;
    const referredId = referred[0]?.id;
    if (!referrerId || !referredId || referrerId === referredId) return;

    await fetch(supabase.base + 'cp_referrals?on_conflict=referred_user_id', {
      method: 'POST',
      headers: { ...supabase.headers, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({
        referrer_user_id: referrerId,
        referred_user_id: referredId,
        source: 'telegram_start',
      }),
    });

    await fetch(supabase.base + 'cp_growth_events', {
      method: 'POST',
      headers: { ...supabase.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_user_id: telegramUser.id,
        event: 'start_referral',
        source: 'referral',
        metadata: { referrerTelegramId, source: 'telegram_start' },
      }),
    });
  } catch (error) {
    console.error('Telegram referral attribution failed:', error);
  }
}

function menu(locale: 'en' | 'ar'): InlineKeyboard {
  const x = t(locale);
  const referralLabel = locale === 'ar' ? '🚨 💰 مركز الإحالات والمكافآت' : '🚨 💰 Referral Center';
  return new InlineKeyboard()
    .text(x.markets, 'markets').text('⚡ Signals', 'signals').row()
    .text(x.trade, 'trade').text('🤖 Auto Trade', 'auto').row()
    .text(x.alerts, 'alerts').text('💼 Portfolio', 'portfolio').row()
    .text('🧮 Risk Tool', 'risk-tool').row()
    // Use a standard callback entry so every Telegram client renders the referral button.
    // The referral screen then exposes the authenticated Mini App WebApp button.
    .text(referralLabel, 'referral').row()
    .text(x.learn, 'learn').text(x.pro, 'pro').row()
    .text(x.help, 'help');
}

function riskMenu(locale: 'en' | 'ar'): InlineKeyboard {
  const x = t(locale);
  return new InlineKeyboard().text(x.low, 'risk:low').row().text(x.medium, 'risk:medium').row().text(x.high, 'risk:high');
}

function nav(locale: 'en' | 'ar'): InlineKeyboard {
  const x = t(locale);
  const keyboard = new InlineKeyboard().text(x.trade, 'trade').text(x.home, 'home');
  if (config.botUsername) {
    const shareText = encodeURIComponent(locale === 'ar' ? 'جرّب CryptoPulse لتحليل سوق العملات الرقمية مباشرة داخل Telegram.' : 'Try CryptoPulse for live crypto market intelligence inside Telegram.');
    const shareUrl = encodeURIComponent(`https://t.me/${config.botUsername}?start=market`);
    keyboard.row().url(locale === 'ar' ? '📤 مشاركة CryptoPulse' : '📤 Share CryptoPulse', `https://t.me/share/url?url=${shareUrl}&text=${shareText}`);
    keyboard.row().text(locale === 'ar' ? '🚨 💰 كنز الإحالات' : '🚨 💰 Referral Rewards', 'referral');
  }
  return keyboard;
}

function referralMenu(locale: 'en' | 'ar', userId: number): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (config.botUsername) {
    const referralUrl = `https://t.me/${config.botUsername}?start=ref_${userId}`;
    const text = locale === 'ar' ? '📣 شارك رابطك واكسب Stars المؤهلة' : '📣 Share your link & earn eligible Stars';
    const shareText = encodeURIComponent(locale === 'ar'
      ? '🚀 انضم إلى CryptoPulse وشارك الرابط مع أصدقائك ومجتمعات Telegram.'
      : '🚀 Join CryptoPulse and share the referral link with your Telegram communities.');
    keyboard.url(text, `https://t.me/share/url?url=${encodeURIComponent(referralUrl)}&text=${shareText}`);
  }
  return keyboard
    .row().webApp(locale === 'ar' ? '📊 فتح مركز الإحالات في Mini App' : '📊 Open Referral Center in Mini App', `${config.miniAppUrl}/mini/referral`)
    .row().text(locale === 'ar' ? '👑 لوحة المتصدرين العالمية' : '👑 Global Leaderboard', 'leaderboard')
    .row().text(locale === 'ar' ? '⬅️ الرئيسية' : '⬅️ Home', 'home');
}

function inlineResultId(symbol: string, kind: string): string {
  return `${kind}:${symbol.toUpperCase()}`;
}

function requireThreeSnapshots(snapshots: Awaited<ReturnType<typeof getMarketSnapshots>>): [typeof snapshots[number], typeof snapshots[number], typeof snapshots[number]] {
  if (snapshots.length < 3) throw new Error('Expected three market snapshots.');
  return [snapshots[0]!, snapshots[1]!, snapshots[2]!];
}

export function createBot(): Bot {
  const bot = new Bot(requireBotToken());

  // Omni-Core middleware: acknowledge callbacks immediately, deduplicate rapid taps,
  // and contain unexpected handler failures so one update can never crash the process.
  bot.use(async (ctx, next) => {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery().catch(() => {});
    }
    if (isDuplicateRapidRequest(ctx)) {
      return;
    }
    const key = lockKey(ctx);
    const active = inFlightRequests.get(key);
    if (active) {
      // A second identical action arriving while the first is still executing is
      // acknowledged above, then ignored instead of creating concurrent writes.
      return;
    }
    let release!: () => void;
    const lock = new Promise<void>((resolve) => { release = resolve; });
    inFlightRequests.set(key, lock);
    try {
      await next();
    } catch (error) {
      console.error('Omni-Core update recovery:', error);
      try {
        if (ctx.callbackQuery) {
          const locale = getLocale(ctx.from?.language_code);
          await safeEdit(ctx,
            locale === 'ar'
              ? '⚠️ حدث خطأ مؤقت. لم يتوقف CryptoPulse. أعد المحاولة الآن.'
              : '⚠️ A temporary error occurred. CryptoPulse is still running. Please try again.',
            menu(locale));
        } else if (ctx.chat?.id) {
          const locale = getLocale(ctx.from?.language_code);
          await ctx.reply(
            locale === 'ar'
              ? '⚠️ حدث خطأ مؤقت وتم احتواؤه تلقائيًا. يمكنك المتابعة دون إعادة تشغيل البوت.'
              : '⚠️ A temporary error was contained automatically. You can continue without restarting the bot.',
            { reply_markup: menu(locale) },
          );
        }
      } catch (recoveryError) {
        console.error('Omni-Core user recovery response failed:', recoveryError);
      }
    } finally {
      release();
      if (inFlightRequests.get(key) === lock) inFlightRequests.delete(key);
    }
  });

  bot.command('start', async (ctx) => {
    const locale = getLocale(ctx.from?.language_code);
    const payload = typeof ctx.match === 'string' ? ctx.match.trim().slice(0, 64).replace(/[^A-Za-z0-9_-]/g, '') : '';
    await ensureTelegramUser(ctx, payload);
    const source = payload || 'direct';
    const intro = locale === 'ar'
      ? `🚀 CryptoPulse Pro\n\nالسوق والتحليلات والتنبيهات وأدوات التداول مباشرة داخل Telegram.\n\n⭐ Pro: 299 Stars / 30 يومًا.\n🚨 برنامج الإحالات: ابنِ مجموعتك، والاحتساب يكون على المستخدمين المدفوعين المؤهلين فقط.\n🏆 مكافآت النمو تبدأ من 10 مستخدمين مدفوعين وتتصاعد عبر مستويات قابلة للتهيئة وفق قواعد البرنامج.\n\nمصدر الدخول: ${source}`
      : `🚀 CryptoPulse Pro\n\nLive markets, intelligence, alerts and trading tools directly inside Telegram.\n\n⭐ Pro: 299 Stars / 30 days.\n🚨 Referral growth: build your own group; only eligible paid users count.\n🏆 Growth Rewards start at 10 paid users and scale through configurable milestones under the program rules.\n\nEntry source: ${source}`;
    await ctx.reply(intro, { reply_markup: menu(locale) });
  });

  bot.command('markets', async (ctx) => sendMarkets(ctx, getLocale(ctx.from?.language_code)));
  bot.command('trade', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.reply(t(locale).tradeIntro, { reply_markup: riskMenu(locale) }); });
  bot.command('signals', async (ctx) => showSignals(ctx, getLocale(ctx.from?.language_code)));
  bot.command('auto', async (ctx) => showAuto(ctx, getLocale(ctx.from?.language_code)));
  bot.command('portfolio', async (ctx) => {
    const locale = getLocale(ctx.from?.language_code);
    await ctx.reply(locale === 'ar' ? '💼 افتح CryptoPulse Mini App لعرض محفظتك المرتبطة بحسابك الشخصي.' : '💼 Open the CryptoPulse Mini App to view your user-scoped connected portfolio.', { reply_markup: nav(locale) });
  });
  bot.command('referral', async (ctx) => showReferral(ctx, getLocale(ctx.from?.language_code)));
  bot.command('leaderboard', async (ctx) => showLeaderboard(ctx, getLocale(ctx.from?.language_code)));
  bot.command('pro', async (ctx) => showPro(ctx, getLocale(ctx.from?.language_code)));
  bot.on('message:successful_payment', async (ctx) => {
    try {
      const payment = ctx.message.successful_payment;
      const telegramUserId = ctx.from.id;
      const base = (process.env.SUPABASE_URL ?? '') + '/rest/v1/';
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
      const h = { apikey: key, Authorization: 'Bearer ' + key };
      const users = await fetch(base + 'cp_users?telegram_user_id=eq.' + telegramUserId + '&select=id&limit=1', { headers: h }).then(r => r.json()) as Array<{ id: string }>;
      const userId = users[0]?.id;
      if (!userId) throw new Error('Payment received for an unregistered CryptoPulse user.');
      const referrals = await fetch(base + 'cp_referrals?referred_user_id=eq.' + userId + '&select=referrer_user_id&limit=1', { headers: h }).then(r => r.json()) as Array<{ referrer_user_id: string }>;
      const referrerId = referrals[0]?.referrer_user_id ?? null;
      const paymentInsert = await fetch(base + 'cp_stars_payments', { method:'POST', headers:{...h,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=representation'}, body:JSON.stringify({
        user_id:userId, telegram_user_id:telegramUserId, plan:'pro', amount_stars:payment.total_amount, currency:payment.currency,
        invoice_payload:payment.invoice_payload, telegram_payment_charge_id:payment.telegram_payment_charge_id,
        provider_payment_charge_id:payment.provider_payment_charge_id ?? null,
        subscription_expiration_date:payment.subscription_expiration_date ? new Date(payment.subscription_expiration_date * 1000).toISOString() : null,
        is_recurring:Boolean(payment.is_recurring), is_first_recurring:Boolean(payment.is_first_recurring), direct_referrer_user_id:referrerId
      })});
      const paymentRows = await paymentInsert.json() as Array<{id:string}>;
      const paymentId = paymentRows[0]?.id;
      if (paymentId && referrerId && payment.currency === 'XTR') {
        const cfgRows = await fetch(base + 'cp_referral_program_config?id=eq.true&select=telegram_commission_permille&limit=1', { headers: h }).then(r => r.json()) as Array<{telegram_commission_permille:number}>;
        const commissionPermille = Math.max(0, Math.min(1000, Number(cfgRows[0]?.telegram_commission_permille ?? 150)));
        const commissionStars = Math.floor(Number(payment.total_amount) * commissionPermille / 1000);

        // Risk scoring uses only signals actually available to CryptoPulse:
        // duplicate-safe payment IDs, referral velocity, account age and unusually large Stars payments.
        const [velocityRows, referredRows] = await Promise.all([
          fetch(base + 'cp_referrals?referrer_user_id=eq.' + encodeURIComponent(referrerId) + '&created_at=gte.' + encodeURIComponent(new Date(Date.now()-24*60*60*1000).toISOString()) + '&select=id&limit=1000', {headers:h}).then(r=>r.json()) as Promise<Array<{id:string}>>,
          fetch(base + 'cp_users?id=eq.' + encodeURIComponent(userId) + '&select=created_at&limit=1', {headers:h}).then(r=>r.json()) as Promise<Array<{created_at:string}>>
        ]);
        let riskScore = 0;
        const riskReasons:string[] = [];
        if (Array.isArray(velocityRows) && velocityRows.length >= 50) { riskScore += 30; riskReasons.push('high_referral_velocity_24h'); }
        if (Array.isArray(velocityRows) && velocityRows.length >= 100) { riskScore += 20; riskReasons.push('very_high_referral_velocity_24h'); }
        const accountAgeMs = referredRows[0]?.created_at ? Date.now() - new Date(referredRows[0].created_at).getTime() : 0;
        if (accountAgeMs >= 0 && accountAgeMs < 10*60*1000) { riskScore += 15; riskReasons.push('payment_shortly_after_account_creation'); }
        if (Number(payment.total_amount) >= 10000) { riskScore += 25; riskReasons.push('unusually_large_payment'); }
        riskScore = Math.min(100, riskScore);
        const decision = riskScore >= 70 ? 'blocked' : riskScore >= 40 ? 'review' : 'clear';
        const eligibilityStatus = decision === 'clear' ? 'eligible' : decision;
        const holdUntil = decision === 'review' ? new Date(Date.now()+24*60*60*1000).toISOString() : null;

        await fetch(base + 'cp_referral_commissions?on_conflict=payment_id', {
          method:'POST',
          headers:{...h,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates'},
          body:JSON.stringify({
            referrer_user_id:referrerId,
            referred_user_id:userId,
            payment_id:paymentId,
            payment_stars:payment.total_amount,
            commission_permille:commissionPermille,
            commission_stars:commissionStars,
            status:'accrued',
            risk_score:riskScore,
            eligibility_status:eligibilityStatus,
            hold_until:holdUntil,
            risk_reasons:riskReasons
          })
        });
        await fetch(base + 'cp_referral_risk_events', {
          method:'POST',
          headers:{...h,'Content-Type':'application/json'},
          body:JSON.stringify({referrer_user_id:referrerId,referred_user_id:userId,payment_id:paymentId,risk_score:riskScore,decision,reasons:riskReasons})
        });
      }
      const startsAt=new Date().toISOString();
      const expiresAt=payment.subscription_expiration_date ? new Date(payment.subscription_expiration_date * 1000).toISOString() : new Date(Date.now()+30*24*60*60*1000).toISOString();
      await fetch(base+'cp_subscriptions?on_conflict=user_id,plan',{method:'POST',headers:{...h,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({
        user_id:userId,plan:'pro',status:'active',telegram_payment_charge_id:payment.telegram_payment_charge_id,starts_at:startsAt,expires_at:expiresAt,price_stars:payment.total_amount,currency:payment.currency,is_recurring:Boolean(payment.is_recurring),updated_at:startsAt
      })});
      if(payment.is_first_recurring){
        const networkRows=await fetch(base+'cp_paid_referral_network_stats?select=root_user_id,paid_network_users',{headers:h}).then(r=>r.json()) as Array<{root_user_id:string;paid_network_users:number}>;
        const levels=await fetch(base+'cp_referral_reward_levels?select=paid_users_threshold,reward_stars&order=paid_users_threshold.asc',{headers:h}).then(r=>r.json()) as Array<{paid_users_threshold:number;reward_stars:number}>;
        for(const root of networkRows){
          const qualified=Number(root.paid_network_users??0);
          for(const level of levels){
            if(qualified<Number(level.paid_users_threshold)) continue;
            await fetch(base+'cp_referral_reward_claims?on_conflict=user_id,paid_users_threshold',{method:'POST',headers:{...h,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates'},body:JSON.stringify({
              user_id:root.root_user_id,paid_users_threshold:level.paid_users_threshold,reward_stars:level.reward_stars,qualifying_paid_users:qualified,status:'accrued'
            })});
          }
        }
      }
      console.log('Telegram Stars Pro payment recorded',{telegramUserId,amount:payment.total_amount,referrerId,recurring:Boolean(payment.is_recurring)});
    } catch(error) { console.error('Failed to record Telegram Stars payment:',error); }
  });

  for (const locale of ['en', 'ar'] as const) {
    const x = t(locale);
    void bot.api.setMyCommands([
      { command: 'start', description: locale === 'ar' ? 'بدء CryptoPulse' : 'Start CryptoPulse' },
      { command: 'markets', description: locale === 'ar' ? 'أسعار السوق المباشرة' : 'Live crypto markets' },
      { command: 'signals', description: locale === 'ar' ? 'إشارات السوق' : 'Market signals' },
      { command: 'trade', description: locale === 'ar' ? 'خطة تداول' : 'Trading plan' },
      { command: 'auto', description: locale === 'ar' ? 'التداول الآلي' : 'Automated trading' },
      { command: 'portfolio', description: locale === 'ar' ? 'المحفظة' : 'Portfolio' },
      { command: 'referral', description: locale === 'ar' ? 'كنز الإحالات ومشاركة الرابط' : 'Referral rewards and sharing' },
      { command: 'leaderboard', description: locale === 'ar' ? 'لوحة المتصدرين العالمية' : 'Global referral leaderboard' },
      { command: 'pro', description: locale === 'ar' ? 'اشتراك Pro عبر Stars' : 'Subscribe to Pro with Stars' },
      { command: 'alerts', description: locale === 'ar' ? 'تنبيهات العملات' : 'Crypto alerts' },
      { command: 'learn', description: locale === 'ar' ? 'تعلم التداول' : 'Learn crypto trading' },
      { command: 'help', description: x.help.replace(/^[^ ]+ /, '') },
    ], { language_code: locale });
  }

  // Telegram-native discovery metadata. This configures the searchable bot profile;
  // it does not guarantee a ranking position in Telegram search.
  void bot.api.setMyShortDescription('CryptoPulse Pro — AI crypto analysis, signals, markets & Telegram Stars.')
    .catch((error) => console.warn('Telegram short description update failed:', error));
  void bot.api.setMyDescription('CryptoPulse Pro is a crypto market intelligence bot with live market data, trading education, AI-assisted analysis, alerts, referral rewards and Telegram Stars features. Crypto markets are volatile; no profit guarantee.')
    .catch((error) => console.warn('Telegram description update failed:', error));

  bot.on('inline_query', async (ctx) => {
    const query = ctx.inlineQuery.query.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const symbols = query ? [query] : ['BTC', 'ETH', 'SOL'];
    const locale = getLocale(ctx.from?.language_code);
    const results = [];

    try {
      const snapshots = await getMarketSnapshots(symbols.slice(0, 5));
      for (const snapshot of snapshots) {
        const direction = snapshot.change24h >= 0 ? '🟢' : '🔴';
        const title = `${direction} ${snapshot.symbol} · $${snapshot.price.toLocaleString()}`;
        const description = `${snapshot.change24h >= 0 ? '+' : ''}${snapshot.change24h.toFixed(2)}% · Vol ${snapshot.volume24h.toLocaleString()}`;
        const text = locale === 'ar'
          ? `⚡ CryptoPulse · ${snapshot.symbol}\nالسعر: $${snapshot.price.toLocaleString()}\n24h: ${snapshot.change24h >= 0 ? '+' : ''}${snapshot.change24h.toFixed(2)}%\nالحجم: ${snapshot.volume24h.toLocaleString()}\n\nبيانات سوق مباشرة.`
          : `⚡ CryptoPulse · ${snapshot.symbol}\nPrice: $${snapshot.price.toLocaleString()}\n24h: ${snapshot.change24h >= 0 ? '+' : ''}${snapshot.change24h.toFixed(2)}%\nVolume: ${snapshot.volume24h.toLocaleString()}\n\nLive market data.`;
        results.push({
          type: 'article' as const,
          id: inlineResultId(snapshot.symbol, 'market'),
          title,
          description,
          input_message_content: { message_text: text },
          reply_markup: { inline_keyboard: [[{ text: locale === 'ar' ? '📊 افتح CryptoPulse' : '📊 Open CryptoPulse', url: config.botUsername ? `https://t.me/${config.botUsername}?start=${snapshot.symbol.toLowerCase()}` : 'https://t.me/' }]] },
        });
      }
    } catch (error) {
      console.error('Inline market lookup failed:', error);
    }

    await ctx.answerInlineQuery(results, { cache_time: 5, is_personal: true });
  });

  // Always acknowledge Telegram callback queries and recover visibly if an API/data call fails.
  async function acknowledge(ctx: any): Promise<void> {
    try { await ctx.answerCallbackQuery(); } catch (error) { console.warn('Callback acknowledgement failed:', error); }
  }

  async function safeEdit(ctx: any, text: string, replyMarkup?: InlineKeyboard): Promise<void> {
    try {
      await ctx.editMessageText(text, replyMarkup ? { reply_markup: replyMarkup } : undefined);
    } catch (error) {
      console.error('Callback message edit failed:', error);
      try {
        await ctx.reply(text, replyMarkup ? { reply_markup: replyMarkup } : undefined);
      } catch (replyError) {
        console.error('Callback fallback reply failed:', replyError);
      }
    }
  }

  bot.callbackQuery('markets', async (ctx) => {
    const locale = getLocale(ctx.from?.language_code);
    await acknowledge(ctx);
    try { await editMarkets(ctx, locale); }
    catch (error) {
      console.error('Markets callback failed:', error);
      await safeEdit(ctx, locale === 'ar' ? '⚠️ تعذر جلب بيانات السوق الآن. حاول مرة أخرى بعد لحظات.' : '⚠️ Market data is temporarily unavailable. Please try again.', nav(locale));
    }
  });
  bot.callbackQuery('signals', async (ctx) => {
    const locale = getLocale(ctx.from?.language_code);
    await acknowledge(ctx);
    try { await showSignals(ctx, locale, true); }
    catch (error) {
      console.error('Signals callback failed:', error);
      await safeEdit(ctx, locale === 'ar' ? '⚠️ تعذر جلب الإشارات الآن. حاول مرة أخرى.' : '⚠️ Signals are temporarily unavailable. Please try again.', nav(locale));
    }
  });
  bot.callbackQuery('auto', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await acknowledge(ctx); await safeEdit(ctx, locale === 'ar' ? '🤖 التداول الآلي\\n\\nالتنفيذ الآلي يتم داخل Mini App بعد توثيق مستخدم Telegram وربط حسابه الخاص.' : '🤖 Auto Trading\\n\\nAutomated execution runs inside the Mini App after Telegram verification and user-specific exchange connection.', nav(locale)); });
  bot.callbackQuery('portfolio', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await acknowledge(ctx); await safeEdit(ctx, locale === 'ar' ? '💼 افتح CryptoPulse Mini App لعرض محفظتك المرتبطة بحسابك الشخصي.' : '💼 Open the CryptoPulse Mini App to view your user-scoped connected portfolio.', nav(locale)); });
  bot.callbackQuery('referral', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await acknowledge(ctx); try { await showReferral(ctx, locale, true); } catch (error) { console.error('Referral callback failed:', error); await safeEdit(ctx, locale === 'ar' ? '⚠️ تعذر تحميل مركز الإحالات.' : '⚠️ Referral Center is temporarily unavailable.', nav(locale)); } });
  bot.callbackQuery('leaderboard', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await acknowledge(ctx); try { await showLeaderboard(ctx, locale, true); } catch (error) { console.error('Leaderboard callback failed:', error); await safeEdit(ctx, locale === 'ar' ? '⚠️ تعذر تحميل لوحة المتصدرين.' : '⚠️ Leaderboard is temporarily unavailable.', nav(locale)); } });
  bot.callbackQuery('risk-tool', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await acknowledge(ctx); await safeEdit(ctx, locale === 'ar' ? '🧮 حاسبة الصفقة\\n\\nاختر مستوى المخاطرة لإنشاء خطة مبنية على سعر BTC المباشر.' : '🧮 Trade Calculator\\n\\nChoose a risk level to generate a plan using the live BTC price.', riskMenu(locale)); });
  bot.callbackQuery('trade', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await acknowledge(ctx); await safeEdit(ctx, t(locale).tradeIntro, riskMenu(locale)); });
  bot.callbackQuery('learn', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await acknowledge(ctx); await safeEdit(ctx, t(locale).learnText, nav(locale)); });
  bot.callbackQuery('alerts', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await acknowledge(ctx); await safeEdit(ctx, t(locale).alertsText, nav(locale)); });
  bot.callbackQuery('pro', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await acknowledge(ctx); try { await showPro(ctx, locale, true); } catch (error) { console.error('Pro callback failed:', error); await safeEdit(ctx, locale === 'ar' ? '⭐ تعذر فتح Pro الآن.' : '⭐ Pro is temporarily unavailable.', nav(locale)); } });
  bot.callbackQuery('help', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await acknowledge(ctx); await safeEdit(ctx, t(locale).helpText, nav(locale)); });
  bot.callbackQuery('home', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await acknowledge(ctx); await safeEdit(ctx, t(locale).start, menu(locale)); });
  // Telegram callbacks are acknowledged immediately. Each action is isolated so one
  // provider/database failure cannot break the rest of the menu.
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const locale = getLocale(ctx.from?.language_code);
    const x = t(locale);
    await acknowledge(ctx);

    try {
      if (data === 'markets') {
        await editMarkets(ctx, locale);
        return;
      }
      if (data === 'signals') {
        await showSignals(ctx, locale, true);
        return;
      }
      if (data === 'trade') {
        await safeEdit(ctx, x.tradeIntro, riskMenu(locale));
        return;
      }
      if (data === 'auto') {
        await showAuto(ctx, locale, true);
        return;
      }
      if (data === 'portfolio') {
        await safeEdit(ctx,
          locale === 'ar'
            ? '💼 المحفظة\n\nافتح Mini App لعرض محفظتك المرتبطة بحساب Telegram الخاص بك.\n\nيمكنك المتابعة من هناك دون تعطيل البوت.'
            : '💼 Portfolio\n\nOpen the Mini App to view your Telegram-scoped portfolio.\n\nYou can continue there without blocking the bot.',
          nav(locale));
        return;
      }
      if (data === 'alerts') {
        await safeEdit(ctx,
          locale === 'ar'
            ? '🔔 التنبيهات\n\nسيتم تشغيل التنبيهات من Mini App بعد اختيار العملات وشروط التنبيه الخاصة بك.'
            : '🔔 Alerts\n\nConfigure coin alerts and trigger conditions in the Mini App.',
          nav(locale));
        return;
      }
      if (data === 'risk-tool') {
        await safeEdit(ctx,
          locale === 'ar' ? '🧮 أداة إدارة المخاطر\n\nاختر مستوى المخاطرة لحساب خطة تعليمية مبنية على سعر BTC الحالي.' : '🧮 Risk Tool\n\nChoose a risk level for an educational plan based on the current BTC price.',
          riskMenu(locale));
        return;
      }
      if (data === 'referral') {
        await showReferral(ctx, locale, true);
        return;
      }
      if (data === 'leaderboard') {
        await showLeaderboard(ctx, locale, true);
        return;
      }
      if (data === 'pro') {
        await showPro(ctx, locale, true);
        return;
      }
      if (data === 'learn') {
        await safeEdit(ctx,
          locale === 'ar'
            ? '📚 التعلم\n\nابدأ بإدارة المخاطر، فهم الاتجاه، قراءة تغير 24 ساعة، ثم اختبر أي خطة قبل استخدامها بأموال حقيقية.\n\nالمحتوى تعليمي وليس ضمانًا للربح.'
            : '📚 Learn\n\nStart with risk management, trend context, 24h changes, and test plans before using real funds.\n\nEducational content only; no profit guarantee.',
          nav(locale));
        return;
      }
      if (data === 'help') {
        await safeEdit(ctx,
          locale === 'ar'
            ? '🆘 المساعدة\n\nاستخدم Markets للأسعار، Signals للإشارات، Trade للخطة التعليمية، Risk Tool للمخاطر، Pro للاشتراك، وReferral للمكافآت.\n\nإذا تعطل مصدر بيانات خارجي، يعيد CryptoPulse المحاولة ويستخدم آخر بيانات صالحة متاحة بدل إيقاف البوت.'
            : '🆘 Help\n\nUse Markets for prices, Signals for market signals, Trade for an educational plan, Risk Tool for risk settings, Pro for subscription, and Referral for rewards.\n\nIf an external provider fails, CryptoPulse retries and can use the latest valid cached data instead of stopping the bot.',
          nav(locale));
        return;
      }
      if (data === 'home') {
        const intro = locale === 'ar'
          ? '🚀 CryptoPulse Pro\n\nالسوق والتحليلات والتنبيهات وأدوات التداول مباشرة داخل Telegram.'
          : '🚀 CryptoPulse Pro\n\nLive markets, intelligence, alerts and trading tools directly inside Telegram.';
        await safeEdit(ctx, intro, menu(locale));
        return;
      }

      const riskMatch = /^risk:(low|medium|high)$/.exec(data);
      if (riskMatch) {
        try {
          const risk = riskMatch[1] as RiskLevel;
          const snapshot = await getMarketSnapshot('BTC');
          const plan = buildBeginnerTradePlan(snapshot, risk);
          const direction = locale === 'ar' ? (plan.side === 'buy' ? 'شراء' : 'بيع') : plan.side.toUpperCase();
          await safeEdit(ctx, `${x.plan}\n\n${x.direction}: ${direction}\n${x.reference}: ${plan.entry.toLocaleString()}\n${x.stop}: ${plan.stopLoss.toFixed(2)}\n${x.target}: ${plan.takeProfit.toFixed(2)}\n${x.risk}: ${plan.riskLevel}\n${x.rr}: ${plan.riskReward}:1`, new InlineKeyboard().text('🤖 Auto Trade', 'auto').text(x.retry, 'trade').row().text(x.home, 'home'));
        } catch (error) {
          console.error('Risk calculator callback failed:', error);
          await safeEdit(ctx,
            locale === 'ar'
              ? '⚠️ تعذر الوصول إلى سعر BTC المباشر. سيعيد CryptoPulse المحاولة تلقائيًا عند الطلب.'
              : '⚠️ Live BTC data is temporarily unavailable. CryptoPulse will retry automatically when requested.',
            riskMenu(locale));
        }
        return;
      }

      console.warn('Unknown CryptoPulse callback:', data);
    } catch (error) {
      console.error('CryptoPulse callback failed:', { data, error });
      try {
        await safeEdit(ctx,
          locale === 'ar'
            ? '⚠️ حدث خطأ مؤقت. لم يتوقف البوت. اختر الزر مرة أخرى وسيعيد CryptoPulse المحاولة تلقائيًا.'
            : '⚠️ A temporary error occurred. The bot is still running. Choose the button again and CryptoPulse will retry automatically.',
          menu(locale));
      } catch (fallbackError) {
        console.error('Callback recovery UI failed:', fallbackError);
      }
    }
  });

  bot.catch((error) => console.error('CryptoPulse bot error:', error.error));
  return bot;
}

async function showPro(ctx: any, locale: 'en' | 'ar', edit = false): Promise<void> {
  try {
    const base = (process.env.SUPABASE_URL ?? '') + '/rest/v1/';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    const headers = { apikey: key, Authorization: 'Bearer ' + key };
    const rows = await fetch(base + 'cp_referral_program_config?id=eq.true&select=pro_price_stars,subscription_period_seconds,telegram_commission_permille&limit=1', { headers }).then(r => r.json()) as Array<{pro_price_stars:number;subscription_period_seconds:number;telegram_commission_permille:number}>;
    const cfg = rows[0] ?? {pro_price_stars:299,subscription_period_seconds:2592000,telegram_commission_permille:150};
    const payload = 'cryptopulse_pro:' + ctx.from.id + ':' + crypto.randomUUID();
    const response = await fetch('https://api.telegram.org/bot' + (process.env.TELEGRAM_BOT_TOKEN ?? '') + '/createInvoiceLink', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({title:'CryptoPulse Pro',description:'30-day CryptoPulse Pro access',payload,currency:'XTR',prices:[{label:'CryptoPulse Pro — 30 days',amount:Number(cfg.pro_price_stars)}],subscription_period:Number(cfg.subscription_period_seconds)})
    });
    const body=await response.json() as {ok?:boolean;result?:string;description?:string};
    if(!response.ok||!body.ok||!body.result) throw new Error(body.description??'Invoice unavailable.');
    const text = locale==='ar'
      ? '⭐ CryptoPulse Pro\n\n299 Stars / 30 يومًا.\n\n🔥 معدل CryptoPulse الداخلي الحالي: 15% من معاملات Stars المؤهلة والمسجلة في سجل البرنامج. برنامج Telegram Affiliate الأصلي منفصل.\n🏆 مكافآت النمو: 1,000 مدفوع = 500 Stars، 10,000 = 10,000، 100,000 = 100,000، 1,000,000 = 1,000,000، 10,000,000 = 10,000,000، 100,000,000 = 100,000,000 Stars.\n\nاضغط الزر للدفع عبر Telegram Stars.'
      : '⭐ CryptoPulse Pro\n\n299 Stars / 30 days.\n\n🔥 Target direct affiliate: 15% under Telegram\'s official program and rules.\n🏆 Growth Rewards: 1,000 paid = 500 Stars, 10,000 = 10,000, 100,000 = 100,000, 1,000,000 = 1,000,000, 10,000,000 = 10,000,000, 100,000,000 = 100,000,000 Stars.\n\nTap the button to pay with Telegram Stars.';
    const keyboard = new InlineKeyboard().url(locale==='ar'?'⭐ ادفع 299 Stars':'⭐ Pay 299 Stars', body.result).row().text(locale==='ar'?'🚨 💰 كنز الإحالات':'🚨 💰 Referral Rewards','referral').row().text(locale==='ar'?'⬅️ الرئيسية':'⬅️ Home','home');
    if(edit) await ctx.editMessageText(text,{reply_markup:keyboard}); else await ctx.reply(text,{reply_markup:keyboard});
  } catch(error) {
    const text=locale==='ar'?'⭐ Pro غير متاح للدفع حاليًا. افتح Mini App وحاول مرة أخرى.':'⭐ Pro checkout is temporarily unavailable. Open the Mini App and try again.';
    if(edit) await ctx.editMessageText(text,{reply_markup:nav(locale)}); else await ctx.reply(text,{reply_markup:nav(locale)});
  }
}

async function showReferral(ctx: any, locale: 'en' | 'ar', edit = false): Promise<void> {
  const userId = Number(ctx.from?.id);
  if (!Number.isSafeInteger(userId) || userId <= 0 || !config.botUsername) {
    const text = locale === 'ar' ? '👥 رابط الدعوة غير متاح حالياً.' : '👥 Referral link is not available right now.';
    if (edit) await ctx.editMessageText(text, { reply_markup: nav(locale) }); else await ctx.reply(text, { reply_markup: nav(locale) });
    return;
  }

  const referralUrl = `https://t.me/${config.botUsername}?start=ref_${userId}`;
  const supabase = supabaseAdminConfig();
  let directReferrals = 0;
  let accruedStars = 0;
  let ratePercent = 15;
  let levels: Array<{threshold:number; reward:number}> = [];
  if (supabase) {
    try {
      const users = await fetch(supabase.base + 'cp_users?telegram_user_id=eq.' + userId + '&select=id&limit=1', {headers:supabase.headers}).then(r=>r.json()) as Array<{id:string}>;
      const dbId = users[0]?.id;
      if (dbId) {
        const [refs, commissions, cfg, rewardLevels] = await Promise.all([
          fetch(supabase.base + 'cp_referrals?referrer_user_id=eq.' + encodeURIComponent(dbId) + '&select=id&limit=1000', {headers:supabase.headers}).then(r=>r.json()),
          fetch(supabase.base + 'cp_referral_commissions?referrer_user_id=eq.' + encodeURIComponent(dbId) + '&status=neq.reversed&select=commission_stars&limit=10000', {headers:supabase.headers}).then(r=>r.json()),
          fetch(supabase.base + 'cp_referral_program_config?id=eq.true&select=telegram_commission_permille&limit=1', {headers:supabase.headers}).then(r=>r.json()),
          fetch(supabase.base + 'cp_referral_reward_levels?select=paid_users_threshold,reward_stars&order=paid_users_threshold.asc&limit=100', {headers:supabase.headers}).then(r=>r.json())
        ]);
        directReferrals = Array.isArray(refs) ? refs.length : 0;
        accruedStars = Array.isArray(commissions) ? commissions.reduce((sum,row) => sum + Number(row.commission_stars ?? 0), 0) : 0;
        ratePercent = Number(cfg?.[0]?.telegram_commission_permille ?? 150) / 10;
        levels = Array.isArray(rewardLevels) ? rewardLevels.map(row => ({threshold:Number(row.paid_users_threshold), reward:Number(row.reward_stars)})) : [];
      }
    } catch (error) {
      console.warn('Referral summary unavailable:', error);
    }
  }
  const levelTextAr = levels.length ? levels.map(l => `• ${l.threshold.toLocaleString()} مدفوع = ${l.reward.toLocaleString()} ⭐`).join('\n') : '• مستويات المكافآت قابلة للتهيئة';
  const levelTextEn = levels.length ? levels.map(l => `• ${l.threshold.toLocaleString()} paid = ${l.reward.toLocaleString()} ⭐`).join('\n') : '• Reward milestones are configurable';
  const text = locale === 'ar'
    ? `🚨 💰 مركز الإحالات والمكافآت — CryptoPulse Pro\n\n⭐ Pro = 299 Telegram Stars / 30 يومًا.\n\n🔗 رابط دعوتك الشخصي:\n${referralUrl}\n\n📊 إحالاتك المباشرة: ${directReferrals.toLocaleString()}\n💰 العمولة المتراكمة: ${accruedStars.toLocaleString()} ⭐\n🔥 معدل البرنامج الحالي: ${ratePercent}% من معاملات Stars المؤهلة والمسجلة في CryptoPulse.\n\n🏆 مستويات النمو:\n${levelTextAr}\n\n⚡ كيف تعمل؟ شارك الرابط، يدخل المستخدم عبره، ثم تُسجّل عمليات Pro المؤهلة في Stars. الإحالات غير المدفوعة لا تولّد عمولة.\n\n🛡️ مكافحة الاحتيال: الحسابات الوهمية، التلاعب، الاستردادات والنشاط المخالف قد يُستبعد.\n\n📌 هذا سجل مكافآت CryptoPulse الداخلي. برنامج Telegram Affiliate الأصلي للـMini App نظام منفصل تديره Telegram وفق إعداداته وشروطه.\n\n📊 افتح مركز الإحالات في Mini App لمتابعة الإحصاءات والحالة.`
    : `🚨 💰 Referral & Rewards Center — CryptoPulse Pro\n\n⭐ Pro = 299 Telegram Stars / 30 days.\n\n🔗 Your personal referral link:\n${referralUrl}\n\n📊 Direct referrals: ${directReferrals.toLocaleString()}\n💰 Accrued commission: ${accruedStars.toLocaleString()} ⭐\n🔥 Current program rate: ${ratePercent}% of eligible Stars transactions recorded by CryptoPulse.\n\n🏆 Growth milestones:\n${levelTextEn}\n\n⚡ How it works: share your link, the user enters through it, and eligible Pro Stars payments are recorded. Unpaid referrals do not generate commission.\n\n🛡️ Anti-fraud: fake accounts, manipulation, refunds and prohibited activity may be excluded.\n\n📌 This is CryptoPulse's internal rewards ledger. Telegram's native Mini App Affiliate Program is separate and governed by Telegram's own configuration and terms.\n\n📊 Open the Mini App Referral Center for live stats and reward status.`;

  const keyboard = referralMenu(locale, userId);
  if (edit) await ctx.editMessageText(text, { reply_markup: keyboard }); else await ctx.reply(text, { reply_markup: keyboard });
}

async function showLeaderboard(ctx: any, locale: 'en' | 'ar', edit = false): Promise<void> {
  const supabase = supabaseAdminConfig();
  let lines:string[]=[];
  if(supabase){
    try{
      const rows=await fetch(supabase.base+'cp_referral_leaderboard?select=rank,telegram_user_id,username,display_name,qualifying_paid_users,accrued_stars&order=rank.asc&limit=10',{headers:supabase.headers}).then(r=>r.json()) as Array<{rank:number;telegram_user_id:number;username:string|null;display_name:string|null;qualifying_paid_users:number;accrued_stars:number}>;
      lines=Array.isArray(rows)?rows.map((r)=>`#${Number(r.rank)} · ${r.username?'@'+r.username:(r.display_name??'CryptoPulse user')} · ${Number(r.qualifying_paid_users).toLocaleString()} paid · ${Number(r.accrued_stars).toLocaleString()} ⭐`):[];
    }catch(error){ console.warn('Referral leaderboard unavailable:',error); }
  }
  const text=locale==='ar'
    ? `👑 لوحة المتصدرين العالمية\n\n${lines.length?lines.join('\\n'):'لا توجد نشاطات مدفوعة مؤهلة بعد.'}\n\nيتم احتساب المستخدمين المدفوعين المؤهلين فقط؛ الحالات قيد المراجعة أو المحظورة لا تدخل الترتيب.`
    : `👑 Global Referral Leaderboard\n\n${lines.length?lines.join('\\n'):'No qualifying paid activity yet.'}\n\nOnly qualifying paid users are ranked; held or blocked activity is excluded.`;
  if(edit) await ctx.editMessageText(text,{reply_markup:referralMenu(locale,Number(ctx.from?.id))}); else await ctx.reply(text,{reply_markup:referralMenu(locale,Number(ctx.from?.id))});
}

async function sendMarkets(ctx: any, locale: 'en' | 'ar'): Promise<void> {
  const x = t(locale);
  const [btc, eth, sol] = requireThreeSnapshots(await getMarketSnapshots(['BTC', 'ETH', 'SOL']));
  await ctx.reply(`${x.snapshot}\n\nBTC: $${btc.price.toLocaleString()} (${btc.change24h.toFixed(2)}%)\nETH: $${eth.price.toLocaleString()} (${eth.change24h.toFixed(2)}%)\nSOL: $${sol.price.toLocaleString()} (${sol.change24h.toFixed(2)}%)\n\n${x.liveReady}`, { reply_markup: nav(locale) });
}

async function editMarkets(ctx: any, locale: 'en' | 'ar'): Promise<void> {
  const x = t(locale);
  const [btc, eth, sol] = requireThreeSnapshots(await getMarketSnapshots(['BTC', 'ETH', 'SOL']));
  await ctx.editMessageText(`${x.snapshot}\n\nBTC: $${btc.price.toLocaleString()} (${btc.change24h.toFixed(2)}%)\nETH: $${eth.price.toLocaleString()} (${eth.change24h.toFixed(2)}%)\nSOL: $${sol.price.toLocaleString()} (${sol.change24h.toFixed(2)}%)\n\n${x.liveReady}`, { reply_markup: nav(locale) });
}

async function showSignals(ctx: any, locale: 'en' | 'ar', edit = false): Promise<void> {
  const [btc, eth, sol] = requireThreeSnapshots(await getMarketSnapshots(['BTC', 'ETH', 'SOL']));
  const text = locale === 'ar'
    ? `⚡ إشارات السوق المباشرة\n\nBTC ${btc.change24h >= 0 ? '🟢 اتجاه صاعد' : '🔴 اتجاه هابط'} — ${btc.change24h.toFixed(2)}%\nETH ${eth.change24h >= 0 ? '🟢 اتجاه صاعد' : '🔴 اتجاه هابط'} — ${eth.change24h.toFixed(2)}%\nSOL ${sol.change24h >= 0 ? '🟢 اتجاه صاعد' : '🔴 اتجاه هابط'} — ${sol.change24h.toFixed(2)}%`
    : `⚡ Live Market Signals\n\nBTC ${btc.change24h >= 0 ? '🟢 Bullish' : '🔴 Bearish'} — ${btc.change24h.toFixed(2)}%\nETH ${eth.change24h >= 0 ? '🟢 Bullish' : '🔴 Bearish'} — ${eth.change24h.toFixed(2)}%\nSOL ${sol.change24h >= 0 ? '🟢 Bullish' : '🔴 Bearish'} — ${sol.change24h.toFixed(2)}%`;
  if (edit) await ctx.editMessageText(text, { reply_markup: nav(locale) }); else await ctx.reply(text, { reply_markup: nav(locale) });
}

async function showAuto(ctx: any, locale: 'en' | 'ar', edit = false): Promise<void> {
  const text = locale === 'ar' ? '🤖 التداول الآلي\n\nالتنفيذ الآلي يتم داخل Mini App بعد توثيق مستخدم Telegram وربط حسابه الخاص.' : '🤖 Auto Trading\n\nAutomated execution runs inside the Mini App after Telegram verification and user-specific exchange connection.';
  if (edit) await ctx.editMessageText(text, { reply_markup: nav(locale) }); else await ctx.reply(text, { reply_markup: nav(locale) });
}

export async function startBot(): Promise<void> {
  if (!config.botToken) throw new Error('TELEGRAM_BOT_TOKEN is required to start the bot.');
  const bot = createBot();
  await bot.start({ onStart: (info) => console.log(`CryptoPulse Pro started as @${info.username}`) });
}
