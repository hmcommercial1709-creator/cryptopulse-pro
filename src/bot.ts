import { Bot, InlineKeyboard } from 'grammy';
import { config, requireBotToken } from './config.js';
import { getMarketSnapshot, getMarketSnapshots } from './market.js';
import { buildBeginnerTradePlan, type RiskLevel } from './domain.js';
import { getLocale, t } from './i18n.js';

function menu(locale: 'en' | 'ar'): InlineKeyboard {
  const x = t(locale);
  return new InlineKeyboard()
    .text(x.markets, 'markets').text('⚡ Signals', 'signals').row()
    .text(x.trade, 'trade').text('🤖 Auto Trade', 'auto').row()
    .text(x.alerts, 'alerts').text('💼 Portfolio', 'portfolio').row()
    .text('🧮 Risk Tool', 'risk-tool').text(locale === 'ar' ? '🚨 💰 كنز الإحالات' : '🚨 💰 Referral Rewards', 'referral').row()
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
    const referralUrl = `https://t.me/${config.botUsername}?startapp=ref_${userId}`;
    const text = locale === 'ar' ? '🔥 شارك رابطك الآن' : '🔥 Share your referral link';
    const shareText = encodeURIComponent(locale === 'ar'
      ? '🚀 انضم إلى CryptoPulse وشارك الرابط مع أصدقائك ومجتمعات Telegram.'
      : '🚀 Join CryptoPulse and share the referral link with your Telegram communities.');
    keyboard.url(text, `https://t.me/share/url?url=${encodeURIComponent(referralUrl)}&text=${shareText}`);
  }
  return keyboard
    .row().text(locale === 'ar' ? '📊 مركز الإحالات في Mini App' : '📊 Open Mini App Referral Center', 'referral')
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

  bot.command('start', async (ctx) => {
    const locale = getLocale(ctx.from?.language_code);
    const payload = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    const source = payload || 'direct';
    const intro = locale === 'ar'
      ? `🚀 CryptoPulse Pro\n\nالسوق والتحليلات والتنبيهات وأدوات التداول مباشرة داخل Telegram.\n\n⭐ Pro: 299 Stars / 30 يومًا.\n🚨 برنامج الإحالات: ابنِ مجموعتك، والاحتساب يكون على المستخدمين المدفوعين المؤهلين فقط.\n🏆 مكافآت النمو تبدأ من 1,000 مدفوع وتصل إلى مستويات أعلى وفق قواعد البرنامج.\n\nمصدر الدخول: ${source}`
      : `🚀 CryptoPulse Pro\n\nLive markets, intelligence, alerts and trading tools directly inside Telegram.\n\n⭐ Pro: 299 Stars / 30 days.\n🚨 Referral growth: build your own group; only eligible paid users count.\n🏆 Growth Rewards start at 1,000 paid users and scale to higher milestones under the program rules.\n\nEntry source: ${source}`;
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
      await fetch(base + 'cp_stars_payments', { method:'POST', headers:{...h,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates'}, body:JSON.stringify({
        user_id:userId, telegram_user_id:telegramUserId, plan:'pro', amount_stars:payment.total_amount, currency:payment.currency,
        invoice_payload:payment.invoice_payload, telegram_payment_charge_id:payment.telegram_payment_charge_id,
        provider_payment_charge_id:payment.provider_payment_charge_id ?? null,
        subscription_expiration_date:payment.subscription_expiration_date ? new Date(payment.subscription_expiration_date * 1000).toISOString() : null,
        is_recurring:Boolean(payment.is_recurring), is_first_recurring:Boolean(payment.is_first_recurring), direct_referrer_user_id:referrerId
      })});
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
      { command: 'pro', description: locale === 'ar' ? 'اشتراك Pro عبر Stars' : 'Subscribe to Pro with Stars' },
      { command: 'alerts', description: locale === 'ar' ? 'تنبيهات العملات' : 'Crypto alerts' },
      { command: 'learn', description: locale === 'ar' ? 'تعلم التداول' : 'Learn crypto trading' },
      { command: 'help', description: x.help.replace(/^[^ ]+ /, '') },
    ], { language_code: locale });
  }

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

  bot.callbackQuery('markets', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await editMarkets(ctx, locale); });
  bot.callbackQuery('signals', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await showSignals(ctx, locale, true); });
  bot.callbackQuery('auto', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await showAuto(ctx, locale, true); });
  bot.callbackQuery('portfolio', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(locale === 'ar' ? '💼 افتح CryptoPulse Mini App لعرض محفظتك المرتبطة بحسابك الشخصي.' : '💼 Open the CryptoPulse Mini App to view your user-scoped connected portfolio.', { reply_markup: nav(locale) }); });
  bot.callbackQuery('referral', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await showReferral(ctx, locale, true); });
  bot.callbackQuery('risk-tool', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(locale === 'ar' ? '🧮 حاسبة الصفقة\n\nاختر مستوى المخاطرة لإنشاء خطة مبنية على سعر BTC المباشر.' : '🧮 Trade Calculator\n\nChoose a risk level to generate a plan using the live BTC price.', { reply_markup: riskMenu(locale) }); });
  bot.callbackQuery('trade', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).tradeIntro, { reply_markup: riskMenu(locale) }); });

  bot.callbackQuery('learn', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).learnText, { reply_markup: nav(locale) }); });
  bot.callbackQuery('alerts', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).alertsText, { reply_markup: nav(locale) }); });
  bot.callbackQuery('pro', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await showPro(ctx, locale, true); });
  bot.callbackQuery('help', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).helpText, { reply_markup: nav(locale) }); });
  bot.callbackQuery('home', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).start, { reply_markup: menu(locale) }); });
  bot.on('callback_query:data', async (ctx) => {
    const match = /^risk:(low|medium|high)$/.exec(ctx.callbackQuery.data);
    if (!match) return;
    const locale = getLocale(ctx.from?.language_code);
    const x = t(locale);
    await ctx.answerCallbackQuery();
    const risk = match[1] as RiskLevel;
    const snapshot = await getMarketSnapshot('BTC');
    const plan = buildBeginnerTradePlan(snapshot, risk);
    const direction = locale === 'ar' ? (plan.side === 'buy' ? 'شراء' : 'بيع') : plan.side.toUpperCase();
    await ctx.editMessageText(`${x.plan}\n\n${x.direction}: ${direction}\n${x.reference}: $${plan.entry.toLocaleString()}\n${x.stop}: $${plan.stopLoss.toFixed(2)}\n${x.target}: $${plan.takeProfit.toFixed(2)}\n${x.risk}: ${plan.riskLevel}\n${x.rr}: ${plan.riskReward}:1`, { reply_markup: new InlineKeyboard().text('🤖 Auto Trade', 'auto').text(x.retry, 'trade').row().text(x.home, 'home') });
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
      ? '⭐ CryptoPulse Pro\n\n299 Stars / 30 يومًا.\n\n🔥 الإحالة المستهدفة: 15% عمولة مباشرة وفق برنامج Telegram الرسمي وشروطه.\n🏆 مكافآت النمو: 1,000 مدفوع = 500 Stars، 10,000 = 10,000، 100,000 = 100,000، 1,000,000 = 1,000,000، 10,000,000 = 10,000,000، 100,000,000 = 100,000,000 Stars.\n\nاضغط الزر للدفع عبر Telegram Stars.'
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

  const referralUrl = `https://t.me/${config.botUsername}?startapp=ref_${userId}`;
  const text = locale === 'ar'
    ? `🚨 💰 كنز الإحالات - CryptoPulse Pro\n\n⭐ Pro = 299 Telegram Stars / 30 يومًا.\n\n🚀 ابنِ مجموعتك: كل مستخدم مدفوع مؤهل في شبكة الإحالة يمكن أن يساهم في تقدمك نحو مكافآت النمو.\n\n🔥 لماذا تشارك الآن؟\n• ⚡ ابنِ شبكتك الخاصة من مستخدمي CryptoPulse.\n• 📈 تابع نمو إحالاتك ونشاطها من مركز الإحالات.\n• 🚀 مشاركة واحدة قد تفتح لك سلسلة إحالات جديدة.\n\n🔗 رابط دعوتك الشخصي:\n${referralUrl}\n\n💸 برنامج Telegram Affiliate المستهدف: 15% عمولة مباشرة على المعاملات المؤهلة وفق شروط Telegram.\n\n🏆 مكافآت CryptoPulse: 1,000 مدفوع = 500 Stars، 10,000 = 10,000 Stars، 100,000 = 100,000 Stars، 1,000,000 = 1,000,000 Stars، 10,000,000 = 10,000,000 Stars، 100,000,000 = 100,000,000 Stars.\n\n⚡ لا يُحتسب أي شخص غير مدفوع، والمكافآت تخضع للتحقق ومكافحة الاحتيال وقواعد البرنامج.\n\n📊 افتح مركز الإحالات في Mini App لمتابعة الإحالات المسجلة والنشاط.`
    : `🚨 💰 Referral Rewards - CryptoPulse Pro\n\n🚀 Do not miss the growth opportunity. Share your personal link with friends and Telegram communities; every new user entering through your link is recorded as your referral.\n\n🔥 Why share now?\n• ⚡ Build your own CryptoPulse referral network.\n• 📈 Track referral growth and activity from the Referral Center.\n• 🚀 One share can open the door to more referrals.\n\n🔗 Your personal referral link:\n${referralUrl}\n\n💸 Target Telegram Affiliate rate: 15% direct commission on eligible transactions under Telegram rules.\n\n🏆 CryptoPulse Growth Rewards: 1,000 paid users = 500 Stars, 10,000 = 10,000 Stars, 100,000 = 100,000 Stars, 1,000,000 = 1,000,000 Stars, 10,000,000 = 10,000,000 Stars, 100,000,000 = 100,000,000 Stars.\n\n⚡ Unpaid users never count. Rewards require verification and anti-fraud checks.\n\n📊 Open the Mini App Referral Center to track recorded referrals and activity.`;

  const keyboard = referralMenu(locale, userId);
  if (edit) await ctx.editMessageText(text, { reply_markup: keyboard }); else await ctx.reply(text, { reply_markup: keyboard });
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
