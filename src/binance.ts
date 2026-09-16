import { createHmac } from 'node:crypto';
import { config, requireBinanceCredentials } from './config.js';

interface BinanceAccount {
  balances: Array<{ asset: string; free: string; locked: string }>;
}

interface BinanceOrder {
  symbol: string;
  orderId: number;
  status: string;
  side: string;
  type: string;
  executedQty: string;
  cummulativeQuoteQty: string;
}

function baseUrl(): string {
  return config.binanceTestnet ? 'https://testnet.binance.vision' : 'https://api.binance.com';
}

function sign(query: string, secret: string): string {
  return createHmac('sha256', secret).update(query).digest('hex');
}

async function signedRequest<T>(method: 'GET' | 'POST', path: string, params: Record<string, string> = {}): Promise<T> {
  if (!config.tradingEnabled) throw new Error('Trading is disabled. Set TRADING_ENABLED=true only after configuring an exchange account.');
  const { apiKey, apiSecret } = requireBinanceCredentials();
  const query = new URLSearchParams({ ...params, timestamp: String(Date.now()), recvWindow: '5000' }).toString();
  const url = `${baseUrl()}${path}?${query}&signature=${sign(query, apiSecret)}`;
  const response = await fetch(url, { method, headers: { 'X-MBX-APIKEY': apiKey, accept: 'application/json' } });
  const body = await response.text();
  if (!response.ok) throw new Error(`Binance API ${response.status}: ${body}`);
  return JSON.parse(body) as T;
}

export async function getAccount(): Promise<BinanceAccount> {
  return signedRequest<BinanceAccount>('GET', '/api/v3/account');
}

export async function placeMarketOrder(symbol: string, side: 'BUY' | 'SELL', quantity: string): Promise<BinanceOrder> {
  return signedRequest<BinanceOrder>('POST', '/api/v3/order', {
    symbol: symbol.toUpperCase(),
    side,
    type: 'MARKET',
    quantity,
  });
}

export function tradingMode(): 'testnet' | 'live' {
  return config.binanceTestnet ? 'testnet' : 'live';
}
