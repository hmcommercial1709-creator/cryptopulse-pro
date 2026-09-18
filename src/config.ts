import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  botUsername: process.env.TELEGRAM_BOT_USERNAME ?? '',
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  marketApiKey: process.env.MARKET_DATA_API_KEY ?? '',
  miniAppUrl: (process.env.MINI_APP_URL ?? '').replace(/\/$/, ''),
};

export function requireBotToken(): string {
  return required('TELEGRAM_BOT_TOKEN');
}
