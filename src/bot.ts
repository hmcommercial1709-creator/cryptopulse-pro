import { Bot, InlineKeyboard } from 'grammy';
import { config, requireBotToken } from './config.js';
import { getMarketSnapshot } from './market.js';
import { buildBeginnerTradePlan, type RiskLevel } from './domain.js';
import { getLocale, t } from './i18n.js';

function menu(locale: 'en' | 'ar'): InlineKeyboard {
  const x = t(locale);
  return new InlineKeyboard().text(x.markets, 'markets').text(x.trade, 'trade').row().text(x.alerts, 'alerts').text(x.learn, 'learn').row().text(x.pro, 'pro').text(x.help, 'help');
}
function riskMenu(locale: 'en' | 'ar'): InlineKeyboard { const x = t(locale); return new InlineKeyboard().text(x.low, 'risk:low').row().text(x.medium, 'risk:medium').row().text(x.high, 'risk:high'); }
function nav(locale: 'en' | 'ar'): InlineKeyboard { const x = t(locale); return new InlineKeyboard().text(x.trade, 'trade').text(x.home, 'home'); }

export function createBot(): Bot {
  const bot = new Bot(requireBotToken());
  bot.command('start', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.reply(t(locale).start, { reply_markup: menu(locale) }); });
  bot.command('markets', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await sendMarkets(ctx, locale); });
  bot.command('trade', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.reply(t(locale).tradeIntro, { reply_markup: riskMenu(locale) }); });

  for (const locale of ['en', 'ar'] as const) {
    const x = t(locale);
    void bot.api.setMyCommands([
      { command: 'start', description: locale === 'ar' ? 'بدء CryptoPulse' : 'Start CryptoPulse' },
      { command: 'markets', description: x.markets.replace(/^[^ ]+ /, '') },
      { command: 'trade', description: x.trade.replace(/^[^ ]+ /, '') },
      { command: 'alerts', description: x.alerts.replace(/^[^ ]+ /, '') },
      { command: 'learn', description: x.learn.replace(/^[^ ]+ /, '') },
      { command: 'help', description: x.help.replace(/^[^ ]+ /, '') },
    ], { language_code: locale });
  }

  bot.callbackQuery('markets', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await editMarkets(ctx, locale); });
  bot.callbackQuery('trade', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).tradeIntro, { reply_markup: riskMenu(locale) }); });
  bot.callbackQuery(/^risk:(low|medium|high)$/, async (ctx) => {
    const locale = getLocale(ctx.from?.language_code); const x = t(locale); await ctx.answerCallbackQuery();
    const risk = ctx.match[1] as RiskLevel; const snapshot = await getMarketSnapshot('BTC'); const plan = buildBeginnerTradePlan(snapshot, risk);
    const direction = locale === 'ar' ? (plan.side === 'buy' ? 'شراء' : 'بيع') : plan.side.toUpperCase();
    await ctx.editMessageText(`${x.plan}\n\n${x.direction}: ${direction}\n${x.reference}: $${plan.entry.toLocaleString()}\n${x.stop}: $${plan.stopLoss.toFixed(2)}\n${x.target}: $${plan.takeProfit.toFixed(2)}\n${x.risk}: ${plan.riskLevel}\n${x.rr}: ${plan.riskReward}:1\n\n${x.riskNote}`, { reply_markup: new InlineKeyboard().text(x.retry, 'trade').text(x.home, 'home') });
  });
  bot.callbackQuery('learn', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).learnText, { reply_markup: nav(locale) }); });
  bot.callbackQuery('alerts', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).alertsText, { reply_markup: nav(locale) }); });
  bot.callbackQuery('pro', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).proText, { reply_markup: nav(locale) }); });
  bot.callbackQuery('help', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).helpText, { reply_markup: nav(locale) }); });
  bot.callbackQuery('home', async (ctx) => { const locale = getLocale(ctx.from?.language_code); await ctx.answerCallbackQuery(); await ctx.editMessageText(t(locale).start, { reply_markup: menu(locale) }); });
  bot.catch((error) => console.error('CryptoPulse bot error:', error.error));
  return bot;
}

async function sendMarkets(ctx: Parameters<Bot['command']>[1] extends never ? never : any, locale: 'en' | 'ar'): Promise<void> {
  const x = t(locale); const [btc, eth, sol] = await Promise.all([getMarketSnapshot('BTC'), getMarketSnapshot('ETH'), getMarketSnapshot('SOL')]);
  await ctx.reply(`${x.snapshot}\n\nBTC: $${btc.price.toLocaleString()}\nETH: $${eth.price.toLocaleString()}\nSOL: $${sol.price.toLocaleString()}\n\n${x.liveReady}`, { reply_markup: nav(locale) });
}
async function editMarkets(ctx: any, locale: 'en' | 'ar'): Promise<void> {
  const x = t(locale); const [btc, eth, sol] = await Promise.all([getMarketSnapshot('BTC'), getMarketSnapshot('ETH'), getMarketSnapshot('SOL')]);
  await ctx.editMessageText(`${x.snapshot}\n\nBTC: $${btc.price.toLocaleString()}\nETH: $${eth.price.toLocaleString()}\nSOL: $${sol.price.toLocaleString()}\n\n${x.liveReady}`, { reply_markup: nav(locale) });
}

export async function startBot(): Promise<void> {
  if (!config.botToken) throw new Error('TELEGRAM_BOT_TOKEN is required to start the bot.');
  const bot = createBot();
  await bot.start({ onStart: (info) => console.log(`CryptoPulse Pro started as @${info.username}`) });
}
