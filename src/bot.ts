import { Bot, InlineKeyboard } from 'grammy';
import { config, requireBotToken } from './config.js';
import { getMarketSnapshot } from './market.js';
import { getAccount, placeMarketOrder, tradingMode } from './binance.js';
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
  return new InlineKeyboard().text(x.trade, 'trade').text(x.home, 'home');
}

export function createBot(): Bot {
  const bot = new Bot(requireBotToken());

  bot.command('start', async (ctx) => {
    const locale = getLocale(ctx.from?.language_code);
    await ctx.reply(t(locale).start, { reply_markup: menu(locale) });
  });

  bot.command('markets', async (ctx) => sendMarkets(ctx, getLocale(ctx.from?.language_code)));
  bot.command('trade', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.reply(t(locale).tradeIntro, { reply_markup: riskMenu(locale) }); });
  bot.command('signals', async (ctx) => showSignals(ctx, getLocale(ctx.from?.language_code)));
  bot.command('auto', async (ctx) => showAuto(ctx, getLocale(ctx.from?.language_code)));
  bot.command('portfolio', async (ctx) => showPortfolio(ctx, getLocale(ctx.from?.language_code)));

  for (const locale of ['en', 'ar'] as const) {
    const x = t(locale);
    void bot.api.setMyCommands([
      { command: 'start', description: locale === 'ar' ? 'بدء CryptoPulse' : 'Start CryptoPulse' },
      { command: 'markets', description: locale === 'ar' ? 'أسعار وتحليل السوق المباشر' : 'Live crypto markets' },
      { command: 'signals', description: locale === 'ar' ? 'إشارات السوق' : 'Market signals' },
      { command: 'trade', description: locale === 'ar' ? 'خطة تداول تعليمية' : 'Trading plan' },
      { command: 'auto', description: locale === 'ar' ? 'التداول الآلي' : 'Automated trading' },
      { command: 'portfolio', description: locale === 'ar' ? 'حساب التداول' : 'Trading account' },
      { command: 'alerts', description: locale === 'ar' ? 'تنبيهات العملات' : 'Crypto alerts' },
      { command: 'learn', description: locale === 'ar' ? 'تعلم التداول' : 'Learn crypto trading' },
      { command: 'help', description: x.help.replace(/^[^ ]+ /, '') },
    ], { language_code: locale });
  }

  bot.callbackQuery('markets', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await editMarkets(ctx, locale); });
  bot.callbackQuery('signals', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await showSignals(ctx, locale, true); });
  bot.callbackQuery('auto', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await showAuto(ctx, locale, true); });
  bot.callbackQuery('portfolio', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await showPortfolio(ctx, locale, true); });
  bot.callbackQuery('risk-tool', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(locale === 'ar' ? '🧮 حاسبة الصفقة\n\nاختر مستوى المخاطرة لإنشاء خطة تعليمية مبنية على سعر BTC المباشر.' : '🧮 Risk Tool\n\nChoose a risk level to generate an educational plan using the live BTC price.', { reply_markup: riskMenu(locale) }); });
  bot.callbackQuery('trade', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).tradeIntro, { reply_markup: riskMenu(locale) }); });
  bot.callbackQuery(/^risk:(low|medium|high)$/, async (ctx) => {
    const locale = getLocale(ctx.from?.language_code); const x = t(locale); await ctx.answerCallbackQuery();
    const risk = ctx.match[1] as RiskLevel; const snapshot = await getMarketSnapshot('BTC'); const plan = buildBeginnerTradePlan(snapshot, risk);
    const direction = locale === 'ar' ? (plan.side === 'buy' ? 'شراء' : 'بيع') : plan.side.toUpperCase();
    await ctx.editMessageText(`${x.plan}\n\n${x.direction}: ${direction}\n${x.reference}: $${plan.entry.toLocaleString()}\n${x.stop}: $${plan.stopLoss.toFixed(2)}\n${x.target}: $${plan.takeProfit.toFixed(2)}\n${x.risk}: ${plan.riskLevel}\n${x.rr}: ${plan.riskReward}:1\n\n${locale === 'ar' ? 'تنبيه: هذه أداة تعليمية وليست ضمانًا للربح.' : 'Note: educational tool only; it is not a profit guarantee.'}`, { reply_markup: new InlineKeyboard().text('🤖 Auto Trade', 'auto').text(x.retry, 'trade').row().text(x.home, 'home') });
  });
  bot.callbackQuery('learn', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).learnText, { reply_markup: nav(locale) }); });
  bot.callbackQuery('alerts', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).alertsText, { reply_markup: nav(locale) }); });
  bot.callbackQuery('pro', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).proText, { reply_markup: nav(locale) }); });
  bot.callbackQuery('help', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).helpText, { reply_markup: nav(locale) }); });
  bot.callbackQuery('home', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).start, { reply_markup: menu(locale) }); });
  bot.catch((error) => console.error('CryptoPulse bot error:', error.error));
  return bot;
}

async function sendMarkets(ctx: any, locale: 'en' | 'ar'): Promise<void> { const x = t(locale); const [btc, eth, sol] = await Promise.all([getMarketSnapshot('BTC'), getMarketSnapshot('ETH'), getMarketSnapshot('SOL')]); await ctx.reply(`${x.snapshot}\n\nBTC: $${btc.price.toLocaleString()} (${btc.change24h.toFixed(2)}%)\nETH: $${eth.price.toLocaleString()} (${eth.change24h.toFixed(2)}%)\nSOL: $${sol.price.toLocaleString()} (${sol.change24h.toFixed(2)}%)\n\n${x.liveReady}`, { reply_markup: nav(locale) }); }
async function editMarkets(ctx: any, locale: 'en' | 'ar'): Promise<void> { const x = t(locale); const [btc, eth, sol] = await Promise.all([getMarketSnapshot('BTC'), getMarketSnapshot('ETH'), getMarketSnapshot('SOL')]); await ctx.editMessageText(`${x.snapshot}\n\nBTC: $${btc.price.toLocaleString()} (${btc.change24h.toFixed(2)}%)\nETH: $${eth.price.toLocaleString()} (${eth.change24h.toFixed(2)}%)\nSOL: $${sol.price.toLocaleString()} (${sol.change24h.toFixed(2)}%)\n\n${x.liveReady}`, { reply_markup: nav(locale) }); }
async function showSignals(ctx: any, locale: 'en' | 'ar', edit = false): Promise<void> { const [btc, eth, sol] = await Promise.all([getMarketSnapshot('BTC'), getMarketSnapshot('ETH'), getMarketSnapshot('SOL')]); const text = locale === 'ar' ? `⚡ إشارات السوق المباشرة\n\nBTC ${btc.change24h >= 0 ? '🟢 اتجاه صاعد' : '🔴 اتجاه هابط'} — ${btc.change24h.toFixed(2)}%\nETH ${eth.change24h >= 0 ? '🟢 اتجاه صاعد' : '🔴 اتجاه هابط'} — ${eth.change24h.toFixed(2)}%\nSOL ${sol.change24h >= 0 ? '🟢 اتجاه صاعد' : '🔴 اتجاه هابط'} — ${sol.change24h.toFixed(2)}%\n\nهذه مؤشرات وصفية مبنية على تغير 24 ساعة، وليست ضمانًا للنتيجة.` : `⚡ Live Market Signals\n\nBTC ${btc.change24h >= 0 ? '🟢 Bullish' : '🔴 Bearish'} — ${btc.change24h.toFixed(2)}%\nETH ${eth.change24h >= 0 ? '🟢 Bullish' : '🔴 Bearish'} — ${eth.change24h.toFixed(2)}%\nSOL ${sol.change24h >= 0 ? '🟢 Bullish' : '🔴 Bearish'} — ${sol.change24h.toFixed(2)}%\n\nDescriptive 24h indicators only; not a profit guarantee.`; if (edit) await ctx.editMessageText(text, { reply_markup: nav(locale) }); else await ctx.reply(text, { reply_markup: nav(locale) }); }
async function showAuto(ctx: any, locale: 'en' | 'ar', edit = false): Promise<void> { const mode = tradingMode(); const text = locale === 'ar' ? `🤖 التداول الآلي\n\nحالة التنفيذ: ${mode === 'testnet' ? '🧪 Testnet آمن' : '🔴 Live'}\nالتداول الحقيقي: ${config.tradingEnabled ? 'مفعّل' : 'متوقف'}\n\nيمكن استخدام Testnet لاختبار الأوامر دون أموال حقيقية. لن يتم تفعيل التداول الحقيقي تلقائيًا.` : `🤖 Auto Trading\n\nExecution mode: ${mode === 'testnet' ? '🧪 Safe Testnet' : '🔴 Live'}\nLive trading: ${config.tradingEnabled ? 'enabled' : 'disabled'}\n\nTestnet can be used to validate orders without real funds. Live trading is never enabled automatically.`; if (edit) await ctx.editMessageText(text, { reply_markup: nav(locale) }); else await ctx.reply(text, { reply_markup: nav(locale) }); }
async function showPortfolio(ctx: any, locale: 'en' | 'ar', edit = false): Promise<void> { let text: string; try { const account = await getAccount(); const balances = account.balances.filter((b) => Number(b.free) + Number(b.locked) > 0).slice(0, 12); text = locale === 'ar' ? `💼 الحساب\n\nالوضع: ${tradingMode()}\n\n${balances.length ? balances.map((b) => `${b.asset}: ${b.free} متاح / ${b.locked} محجوز`).join('\n') : 'لا توجد أرصدة ظاهرة.'}` : `💼 Account\n\nMode: ${tradingMode()}\n\n${balances.length ? balances.map((b) => `${b.asset}: ${b.free} free / ${b.locked} locked`).join('\n') : 'No non-zero balances returned.'}`; } catch (error) { text = locale === 'ar' ? '💼 الحساب\n\nتعذر جلب الحساب. تأكد من إعداد مفاتيح Binance المناسبة.' : '💼 Account\n\nUnable to fetch the account. Configure the appropriate Binance API credentials.'; console.error(error); } if (edit) await ctx.editMessageText(text, { reply_markup: nav(locale) }); else await ctx.reply(text, { reply_markup: nav(locale) }); }

export async function startBot(): Promise<void> { if (!config.botToken) throw new Error('TELEGRAM_BOT_TOKEN is required to start the bot.'); const bot = createBot(); await bot.start({ onStart: (info) => console.log(`CryptoPulse Pro started as @${info.username}`) }); }
