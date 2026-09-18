import { createBot } from './bot.js';
import { startWebServer } from './web.js';

const bot = createBot();
const publicUrl = process.env.WEBHOOK_URL
  ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined);

if (!publicUrl) {
  throw new Error('WEBHOOK_URL or RAILWAY_PUBLIC_DOMAIN is required for Telegram webhook mode.');
}

const webhookUrl = new URL('/telegram/webhook', publicUrl).toString();
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

startWebServer(bot);

bot.api.setWebhook(webhookUrl, {
  ...(webhookSecret ? { secret_token: webhookSecret } : {}),
  allowed_updates: ['message', 'callback_query', 'inline_query'],
}).then(() => {
  console.log(`CryptoPulse Pro webhook configured at ${webhookUrl}`);
}).catch((error: unknown) => {
  console.error('Failed to configure Telegram webhook:', error);
  process.exitCode = 1;
});
