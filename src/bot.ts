import { Bot, InlineKeyboard } from 'grammy';
import { config, requireBotToken } from './config.js';
import { getMarketSnapshot } from './market.js';
import { buildBeginnerTradePlan, type RiskLevel } from './domain.js';

const riskButtons = new InlineKeyboard()
  .text('🟢 Beginner / Low risk', 'risk:low').row()
  .text('🟡 Balanced / Medium', 'risk:medium').row()
  .text('🔴 Aggressive / High', 'risk:high');

export function createBot(): Bot {
  const bot = new Bot(requireBotToken());

  bot.command('start', async (ctx) => {
    await ctx.reply(
      '🚀 CryptoPulse Pro\n\n' +
      'A beginner-friendly crypto command center.\n\n' +
      'Choose what you want to do:',
      {
        reply_markup: new InlineKeyboard()
          .text('📊 Markets', 'markets').text('🧭 Trade Helper', 'trade').row()
          .text('🔔 Alerts', 'alerts').text('📚 Learn Trading', 'learn').row()
          .text('💎 Pro', 'pro').text('ℹ️ Help', 'help'),
      },
    );
  });

  bot.callbackQuery('markets', async (ctx) => {
    await ctx.answerCallbackQuery();
    const [btc, eth, sol] = await Promise.all([
      getMarketSnapshot('BTC'), getMarketSnapshot('ETH'), getMarketSnapshot('SOL'),
    ]);
    await ctx.editMessageText(
      `📊 Market snapshot\n\nBTC: $${btc.price.toLocaleString()}\nETH: $${eth.price.toLocaleString()}\nSOL: $${sol.price.toLocaleString()}\n\nData adapters are ready for live provider integration.`,
      { reply_markup: new InlineKeyboard().text('🧭 Trade Helper', 'trade').text('⬅️ Home', 'home') },
    );
  });

  bot.callbackQuery('trade', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      '🧭 Trade Helper\n\nTell me your experience level. CryptoPulse will explain the plan in plain language and show entry, stop-loss and target concepts.',
      { reply_markup: riskButtons },
    );
  });

  bot.callbackQuery(/^risk:(low|medium|high)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const risk = ctx.match[1] as RiskLevel;
    const snapshot = await getMarketSnapshot('BTC');
    const plan = buildBeginnerTradePlan(snapshot, risk);
    await ctx.editMessageText(
      `🧠 BTC educational plan\n\n` +
      `Direction: ${plan.side.toUpperCase()}\n` +
      `Reference price: $${plan.entry.toLocaleString()}\n` +
      `Stop-loss example: $${plan.stopLoss.toFixed(2)}\n` +
      `Target example: $${plan.takeProfit.toFixed(2)}\n` +
      `Risk level: ${plan.riskLevel}\n` +
      `Risk/reward model: ${plan.riskReward}:1\n\n` +
      `⚠️ ${plan.explanation}`,
      { reply_markup: new InlineKeyboard().text('🔄 Try another level', 'trade').text('🏠 Home', 'home') },
    );
  });

  bot.callbackQuery('learn', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      '📚 Trading made simple\n\n1. Choose an asset.\n2. Understand the trend and volatility.\n3. Define how much you can afford to lose.\n4. Set a stop before entering.\n5. Never risk money you cannot afford to lose.\n\nCryptoPulse Pro is designed to explain each step before a user acts.',
      { reply_markup: new InlineKeyboard().text('🧭 Trade Helper', 'trade').text('🏠 Home', 'home') },
    );
  });

  bot.callbackQuery('alerts', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('🔔 Alerts\n\nAlert infrastructure is ready. Live price-provider integration and user alert storage will be added next.', { reply_markup: new InlineKeyboard().text('🏠 Home', 'home') });
  });

  bot.callbackQuery('pro', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('💎 CryptoPulse Pro\n\nPremium features will use Telegram Stars for digital services. No fake guarantees, hidden charges, or misleading performance claims.', { reply_markup: new InlineKeyboard().text('🏠 Home', 'home') });
  });

  bot.callbackQuery('help', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('ℹ️ Help\n\nCryptoPulse Pro explains market information and trading concepts for beginners. It does not guarantee profits or replace professional financial advice.', { reply_markup: new InlineKeyboard().text('🏠 Home', 'home') });
  });

  bot.callbackQuery('home', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('🚀 CryptoPulse Pro\n\nChoose what you want to do:', { reply_markup: new InlineKeyboard().text('📊 Markets', 'markets').text('🧭 Trade Helper', 'trade').row().text('🔔 Alerts', 'alerts').text('📚 Learn Trading', 'learn').row().text('💎 Pro', 'pro').text('ℹ️ Help', 'help') });
  });

  bot.catch((error) => console.error('CryptoPulse bot error:', error.error));
  return bot;
}

export async function startBot(): Promise<void> {
  if (!config.botToken) throw new Error('TELEGRAM_BOT_TOKEN is required to start the bot.');
  const bot = createBot();
  await bot.start({ onStart: (info) => console.log(`CryptoPulse Pro started as @${info.username}`) });
}
