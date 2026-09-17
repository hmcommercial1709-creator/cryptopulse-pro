import { Bot, InlineKeyboard } from 'grammy';
import { config, requireBotToken } from './config.js';
import { getMarketSnapshot } from './market.js';
import { buildBeginnerTradePlan, type RiskLevel } from './domain.js';
import { getLocale, t } from './i18n.js';

function menu(locale: 'en' | 'ar'): InlineKeyboard {
  const x = t(locale);
  return new InlineKeyboard()
    .text(x.markets, 'markets').text('⚡ Signals', 'signals').row()
    .text(x.trade, 'trade').text('🤖 Auto Trade', 'auto').row()
    .text(x.alerts, 'alerts').text('💼 Portfolio', 'portfolio').row()
    .text('🧮 Risk Tool', 'risk-tool').text(x.learn, 'learn').row()
    .text(x.pro, 'pro').text(x.help, 'help');
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
  }
  return keyboard;
}

function inlineResultId(symbol: string, kind: string): string {
  return `${kind}:${symbol.toUpperCase()}`;
}

export function createBot(): Bot {
  const bot = new Bot(requireBotToken());

  bot.command('start', async (ctx) => {
    const locale = getLocale(ctx.from?.language_code);
    const payload = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    const source = payload || 'direct';
    const intro = locale === 'ar'
      ? `🚀 CryptoPulse Pro\n\nالسوق والتحليلات والتنبيهات وأدوات التداول مباشرة داخل Telegram.\n\nمصدر الدخول: ${source}`
      : `🚀 CryptoPulse Pro\n\nLive markets, intelligence, alerts and trading tools directly inside Telegram.\n\nEntry source: ${source}`;
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

  for (const locale of ['en', 'ar'] as const) {
    const x = t(locale);
    void bot.api.setMyCommands([
      { command: 'start', description: locale === 'ar' ? 'بدء CryptoPulse' : 'Start CryptoPulse' },
      { command: 'markets', description: locale === 'ar' ? 'أسعار السوق المباشرة' : 'Live crypto markets' },
      { command: 'signals', description: locale === 'ar' ? 'إشارات السوق' : 'Market signals' },
      { command: 'trade', description: locale === 'ar' ? 'خطة تداول' : 'Trading plan' },
      { command: 'auto', description: locale === 'ar' ? 'التداول الآلي' : 'Automated trading' },
      { command: 'portfolio', description: locale === 'ar' ? 'المحفظة' : 'Portfolio' },
      { command: 'alerts', description: locale === 'ar' ? 'تنبيهات العملات' : 'Crypto alerts' },
      { command: 'learn', description: locale === 'ar' ? 'تعلم التداول' : 'Learn crypto trading' },
      { command: 'help', description: x.help.replace(/^[^ ]+ /, '') },
    ], { language_code: locale });
  }

  // Telegram-native Inline Mode: users can request live market cards from any chat/group.
  bot.inlineQuery(async (ctx) => {
    const query = ctx.inlineQuery.query.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const symbols = query ? [query] : ['BTC', 'ETH', 'SOL'];
    const locale = getLocale(ctx.from?.language_code);
    const results = [];

    for (const symbol of symbols.slice(0, 5)) {
      try {
        const snapshot = await getMarketSnapshot(symbol);
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
          reply_markup: { inline_keyboard: [[{ text: locale === 'ar' ? '📊 افتح CryptoPulse' : '📊 Open CryptoPulse', url: config.botUsername ? `https://t.me/${config.botUsername}?start=${snapshot.symbol.toLowerCase()}` : 'https://t.me/']]] },
        });
      } catch (error) {
        console.error(`Inline market lookup failed for ${symbol}:`, error);
      }
    }

    await ctx.answerInlineQuery(results, { cache_time: 5, is_personal: true });
  });

  bot.callbackQuery('markets', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await editMarkets(ctx, locale); });
  bot.callbackQuery('signals', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await showSignals(ctx, locale, true); });
  bot.callbackQuery('auto', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await showAuto(ctx, locale, true); });
  bot.callbackQuery('portfolio', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(locale === 'ar' ? '💼 افتح CryptoPulse Mini App لعرض محفظتك المرتبطة بحسابك الشخصي.' : '💼 Open the CryptoPulse Mini App to view your user-scoped connected portfolio.', { reply_markup: nav(locale) }); });
  bot.callbackQuery('risk-tool', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(locale === 'ar' ? '🧮 حاسبة الصفقة\n\nاختر مستوى المخاطرة لإنشاء خطة مبنية على سعر BTC المباشر.' : '🧮 Trade Calculator\n\nChoose a risk level to generate a plan using the live BTC price.', { reply_markup: riskMenu(locale) }); });
  bot.callbackQuery('trade', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).tradeIntro, { reply_markup: riskMenu(locale) }); });
  bot.callbackQuery(/^risk:(low|medium|high)$/, async (ctx) => {
    const locale = getLocale(ctx.from?.language_code);
    const x = t(locale);
    await ctx.answerCallbackQuery();
    const risk = ctx.match[1] as RiskLevel;
    const snapshot = await getMarketSnapshot('BTC');
    const plan = buildBeginnerTradePlan(snapshot, risk);
    const direction = locale === 'ar' ? (plan.side === 'buy' ? 'شراء' : 'بيع') : plan.side.toUpperCase();
    await ctx.editMessageText(`${x.plan}\n\n${x.direction}: ${direction}\n${x.reference}: $${plan.entry.toLocaleString()}\n${x.stop}: $${plan.stopLoss.toFixed(2)}\n${x.target}: $${plan.takeProfit.toFixed(2)}\n${x.risk}: ${plan.riskLevel}\n${x.rr}: ${plan.riskReward}:1`, { reply_markup: new InlineKeyboard().text('🤖 Auto Trade', 'auto').text(x.retry, 'trade').row().text(x.home, 'home') });
  });
  bot.callbackQuery('learn', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).learnText, { reply_markup: nav(locale) }); });
  bot.callbackQuery('alerts', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).alertsText, { reply_markup: nav(locale) }); });
  bot.callbackQuery('pro', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).proText, { reply_markup: nav(locale) }); });
  bot.callbackQuery('help', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).helpText, { reply_markup: nav(locale) }); });
  bot.callbackQuery('home', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).start, { reply_markup: menu(locale) }); });
  bot.catch((error) => console.error('CryptoPulse bot error:', error.error));
  return bot;
}

async function sendMarkets(ctx: any, locale: 'en' | 'ar'): Promise<void> {
  const x = t(locale);
  const [btc, eth, sol] = await Promise.all([getMarketSnapshot('BTC'), getMarketSnapshot('ETH'), getMarketSnapshot('SOL')]);
  await ctx.reply(`${x.snapshot}\n\nBTC: $${btc.price.toLocaleString()} (${btc.change24h.toFixed(2)}%)\nETH: $${eth.price.toLocaleString()} (${eth.change24h.toFixed(2)}%)\nSOL: $${sol.price.toLocaleString()} (${sol.change24h.toFixed(2)}%)\n\n${x.liveReady}`, { reply_markup: nav(locale) });
}

async function editMarkets(ctx: any, locale: 'en' | 'ar'): Promise<void> {
  const x = t(locale);
  const [btc, eth, sol] = await Promise.all([getMarketSnapshot('BTC'), getMarketSnapshot('ETH'), getMarketSnapshot('SOL')]);
  await ctx.editMessageText(`${x.snapshot}\n\nBTC: $${btc.price.toLocaleString()} (${btc.change24h.toFixed(2)}%)\nETH: $${eth.price.toLocaleString()} (${eth.change24h.toFixed(2)}%)\nSOL: $${sol.price.toLocaleString()} (${sol.change24h.toFixed(2)}%)\n\n${x.liveReady}`, { reply_markup: nav(locale) });
}

async function showSignals(ctx: any, locale: 'en' | 'ar', edit = false): Promise<void> {
  const [btc, eth, sol] = await Promise.all([getMarketSnapshot('BTC'), getMarketSnapshot('ETH'), getMarketSnapshot('SOL')]);
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
