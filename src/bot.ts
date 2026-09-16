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
  return new InlineKeyboard()
    .text(x.low, 'risk:low').row()
    .text(x.medium, 'risk:medium').row()
    .text(x.high, 'risk:high');
}

function nav(locale: 'en' | 'ar'): InlineKeyboard {
  const x = t(locale);
  return new InlineKeyboard().text(x.trade, 'trade').text(x.home, 'home');
}

export function createBot(): Bot {
  const bot = new Bot(requireBotToken());

  bot.command('start', async (ctx) => {
    const locale = getLocale(ctx.from?.language_code);
    await ctx.reply(t(locale).start, { reply_markup: menu(locale) });
  });

  bot.command('markets', async (ctx) => {
    const locale = getLocale(ctx.from?.language_code);
    await sendMarkets(ctx, locale);
  });

  bot.command('trade', async (ctx) => {
    const locale = getLocale(ctx.from?.language_code);
    await ctx.reply(t(locale).tradeIntro, { reply_markup: riskMenu(locale) });
  });

  bot.command('signals', async (ctx) => {
    const locale = getLocale(ctx.from?.language_code);
    await ctx.reply('⚡ ' + (locale === 'ar' ? 'إشارات السوق الذكية\n\nتحليل الاتجاه والزخم والتذبذب والحجم وإظهار فرص قابلة للفهم.' : 'AI Market Signals\n\nAnalyze trend, momentum, volatility and volume for explainable market setups.'), { reply_markup: nav(locale) });
  });

  bot.command('auto', async (ctx) => {
    const locale = getLocale(ctx.from?.language_code);
    await ctx.reply('🤖 ' + (locale === 'ar' ? 'التداول الآلي\n\nهنا ستكون الاستراتيجيات الآلية، ربط منصات التداول، قواعد الدخول والخروج، إدارة حجم الصفقة، والإيقاف الطارئ.\n\nمحرك التنفيذ الحقيقي وموصلات المنصات قيد البناء حاليًا.' : 'Auto Trading\n\nThis is the command center for strategies, exchange connections, entry/exit rules, position sizing and emergency stop.\n\nThe live execution engine and exchange connectors are currently being built.'), { reply_markup: nav(locale) });
  });

  for (const locale of ['en', 'ar'] as const) {
    const x = t(locale);
    void bot.api.setMyCommands([
      { command: 'start', description: locale === 'ar' ? 'بدء CryptoPulse' : 'Start CryptoPulse' },
      { command: 'markets', description: locale === 'ar' ? 'أسعار وتحليل السوق' : 'Crypto markets and prices' },
      { command: 'signals', description: locale === 'ar' ? 'إشارات التداول الذكية' : 'AI crypto trading signals' },
      { command: 'trade', description: locale === 'ar' ? 'أدوات التداول' : 'Trading tools' },
      { command: 'auto', description: locale === 'ar' ? 'التداول الآلي' : 'Automated crypto trading' },
      { command: 'alerts', description: locale === 'ar' ? 'تنبيهات العملات' : 'Crypto price alerts' },
      { command: 'learn', description: locale === 'ar' ? 'تعلم التداول' : 'Learn crypto trading' },
      { command: 'help', description: x.help.replace(/^[^ ]+ /, '') },
    ], { language_code: locale });
  }

  bot.callbackQuery('markets', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await editMarkets(ctx, locale); });
  bot.callbackQuery('signals', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(locale === 'ar' ? '⚡ إشارات السوق الذكية\n\nالاتجاه • الزخم • التذبذب • الحجم • حالة السوق\n\nسيتم ربط هذا القسم بمحرك الإشارات الحقيقي والبيانات المباشرة.' : '⚡ AI Market Signals\n\nTrend • momentum • volatility • volume • market regime\n\nThis section will connect to the live signal engine and market data.', { reply_markup: nav(locale) }); });
  bot.callbackQuery('auto', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(locale === 'ar' ? '🤖 التداول الآلي\n\nاستراتيجيات آلية + ربط منصات التداول + قواعد دخول وخروج + إدارة حجم الصفقة + إيقاف طارئ.\n\nلن يتم إرسال أمر حقيقي من هذه الشاشة قبل اكتمال موصل المنصة والتحقق من إعدادات المستخدم.' : '🤖 Auto Trading\n\nAutomated strategies + exchange connections + entry/exit rules + position sizing + emergency stop.\n\nNo real order is sent from this screen until the exchange connector and user settings are fully configured.', { reply_markup: nav(locale) }); });
  bot.callbackQuery('portfolio', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(locale === 'ar' ? '💼 المحفظة\n\nالمراكز • الأوامر • P&L • أداء الاستراتيجية\n\nسيتم ربطها بقاعدة بيانات المستخدم ومحرك التنفيذ.' : '💼 Portfolio\n\nPositions • orders • P&L • strategy performance\n\nThis will connect to the user database and execution engine.', { reply_markup: nav(locale) }); });
  bot.callbackQuery('risk-tool', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(locale === 'ar' ? '🧮 حاسبة الصفقة\n\nاحسب حجم الصفقة من الرصيد وسعر الدخول ووقف الخسارة ونسبة المخاطرة.' : '🧮 Risk Tool\n\nCalculate position size from balance, entry, stop-loss distance and risk percentage.', { reply_markup: nav(locale) }); });
  bot.callbackQuery('trade', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).tradeIntro, { reply_markup: riskMenu(locale) }); });
  bot.callbackQuery(/^risk:(low|medium|high)$/, async (ctx) => {
    const locale = getLocale(ctx.from?.language_code); const x = t(locale); await ctx.answerCallbackQuery();
    const risk = ctx.match[1] as RiskLevel; const snapshot = await getMarketSnapshot('BTC'); const plan = buildBeginnerTradePlan(snapshot, risk);
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

async function sendMarkets(ctx: any, locale: 'en' | 'ar'): Promise<void> { const x = t(locale); const [btc, eth, sol] = await Promise.all([getMarketSnapshot('BTC'), getMarketSnapshot('ETH'), getMarketSnapshot('SOL')]); await ctx.reply(`${x.snapshot}\n\nBTC: $${btc.price.toLocaleString()}\nETH: $${eth.price.toLocaleString()}\nSOL: $${sol.price.toLocaleString()}\n\n${x.liveReady}`, { reply_markup: nav(locale) }); }
async function editMarkets(ctx: any, locale: 'en' | 'ar'): Promise<void> { const x = t(locale); const [btc, eth, sol] = await Promise.all([getMarketSnapshot('BTC'), getMarketSnapshot('ETH'), getMarketSnapshot('SOL')]); await ctx.editMessageText(`${x.snapshot}\n\nBTC: $${btc.price.toLocaleString()}\nETH: $${eth.price.toLocaleString()}\nSOL: $${sol.price.toLocaleString()}\n\n${x.liveReady}`, { reply_markup: nav(locale) }); }

export async function startBot(): Promise<void> {
  if (!config.botToken) throw new Error('TELEGRAM_BOT_TOKEN is required to start the bot.');
  const bot = createBot();
  await bot.start({ onStart: (info) => console.log(`CryptoPulse Pro started as @${info.username}`) });
}
