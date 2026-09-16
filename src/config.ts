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
  binanceApiKey: process.env.BINANCE_API_KEY ?? '',
  binanceApiSecret: process.env.BINANCE_API_SECRET ?? '',
  binanceTestnet: (process.env.BINANCE_TESTNET ?? 'true').toLowerCase() === 'true',
  tradingEnabled: (process.env.TRADING_ENABLED ?? 'false').toLowerCase() === 'true',
};

export function requireBotToken(): string {
  return required('TELEGRAM_BOT_TOKEN');
}

export function requireBinanceCredentials(): { apiKey: string; apiSecret: string } {
  if (!config.binanceApiKey || !config.binanceApiSecret) {
    throw new Error('BINANCE_API_KEY and BINANCE_API_SECRET are required for authenticated trading.');
  }
  return { apiKey: config.binanceApiKey, apiSecret: config.binanceApiSecret };
}
