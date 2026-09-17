import { createHmac } from 'node:crypto';
import { decryptSecret } from './vault';
import { supabaseInsert, supabaseSelect, supabaseUpdate } from './supabase-admin';
import { validateTelegramInitData } from './telegram';

type OrderInput = { exchange?: string; symbol?: string; side?: 'BUY' | 'SELL'; quantity?: string; mode?: 'paper' | 'testnet' | 'live'; idempotencyKey?: string };
type Connection = Record<string, unknown>;

function requiredString(value: unknown, name: string): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`); return value.trim(); }
function validKey(key: string): boolean { return /^[A-Za-z0-9._:-]{16,128}$/.test(key); }

async function binanceOrder(apiKey: string, apiSecret: string, input: Required<Pick<OrderInput, 'symbol' | 'side' | 'quantity'>>, live: boolean, clientOrderId: string) {
  const base = live ? 'https://api.binance.com' : 'https://testnet.binance.vision';
  const params = new URLSearchParams({ symbol: input.symbol, side: input.side, type: 'MARKET', quantity: input.quantity, newClientOrderId: clientOrderId, timestamp: String(Date.now()), recvWindow: '5000' });
  const signature = createHmac('sha256', apiSecret).update(params.toString()).digest('hex');
  const response = await fetch(`${base}/api/v3/order?${params.toString()}&signature=${signature}`, { method: 'POST', headers: { 'X-MBX-APIKEY': apiKey, accept: 'application/json' }, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
  const body = await response.text();
  if (!response.ok) throw new Error(`Exchange order rejected (${response.status}).`);
  return JSON.parse(body) as { orderId: number; status: string; executedQty: string; cummulativeQuoteQty: string };
}

export async function executeUserOrder(initData: string, input: OrderInput) {
  const user = validateTelegramInitData(initData, requiredString(process.env.TELEGRAM_BOT_TOKEN, 'TELEGRAM_BOT_TOKEN'));
  const symbol = requiredString(input.symbol, 'symbol').toUpperCase();
  const side = input.side;
  const quantity = requiredString(input.quantity, 'quantity');
  const exchange = input.exchange ?? 'binance';
  const mode = input.mode ?? 'testnet';
  const idempotencyKey = requiredString(input.idempotencyKey, 'idempotencyKey');
  if (!/^[A-Z0-9]{2,20}(USDT|USDC|BTC|ETH)$/.test(symbol) || !/^[0-9]+(?:\.[0-9]+)?$/.test(quantity) || Number(quantity) <= 0) throw new Error('Invalid order parameters.');
  if (side !== 'BUY' && side !== 'SELL') throw new Error('Invalid order side.');
  if (exchange !== 'binance') throw new Error('Exchange is not enabled for execution yet.');
  if (mode !== 'testnet' && mode !== 'live') throw new Error('Invalid execution mode.');
  if (mode === 'live' && process.env.LIVE_TRADING_ENABLED !== 'true') throw new Error('Live trading is disabled by server policy.');

  const users = await supabaseSelect('cp_users', `telegram_user_id=eq.${user.id}&select=id&limit=1`);
  const dbUser = users[0];
  if (!dbUser?.id || typeof dbUser.id !== 'string') throw new Error('CryptoPulse user is not registered.');
  const userId = dbUser.id;

  const existing = await supabaseSelect('cp_orders', `user_id=eq.${userId}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=id,status,exchange_order_id,client_order_id,mode&limit=1`);
  if (existing[0]) return { reused: true, order: existing[0] };

  const portfolios = await supabaseSelect('cp_portfolios', `user_id=eq.${userId}&select=id&limit=1`);
  const portfolio = portfolios[0];
  if (!portfolio?.id || typeof portfolio.id !== 'string') throw new Error('Trading portfolio is not configured.');

  const connections = await supabaseSelect('cp_exchange_connections', `user_id=eq.${userId}&exchange=eq.${exchange}&select=api_key_ciphertext,api_secret_ciphertext,api_key_iv,api_secret_iv,api_key_tag,api_secret_tag,key_version,live_enabled&limit=1`);
  const connection = connections[0] as Connection | undefined;
  if (!connection) throw new Error('Exchange connection is not configured.');
  const live = mode === 'live';
  if (live && connection.live_enabled !== true) throw new Error('Live trading is not enabled for this exchange connection.');

  const fingerprint = `${exchange}:${symbol}:${side}:${quantity}:${mode}`;
  const clientOrderId = `cp_${userId.slice(0, 8)}_${idempotencyKey}`.slice(0, 36);
  let localOrder: Record<string, unknown> | undefined;
  try {
    const inserted = await supabaseInsert('cp_orders', { user_id: userId, portfolio_id: portfolio.id, client_order_id: clientOrderId, symbol, side, order_type: 'MARKET', quantity, status: 'pending', mode, idempotency_key: idempotencyKey, idempotency_fingerprint: fingerprint });
    localOrder = inserted[0];
  } catch {
    const raced = await supabaseSelect('cp_orders', `user_id=eq.${userId}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=id,status,exchange_order_id,client_order_id,mode&limit=1`);
    if (raced[0]) return { reused: true, order: raced[0] };
    throw new Error('Could not reserve order intent.');
  }
  if (!localOrder?.id || typeof localOrder.id !== 'string') throw new Error('Could not reserve order intent.');

  try {
    const apiKey = decryptSecret(String(connection.api_key_ciphertext), String(connection.api_key_iv), String(connection.api_key_tag), String(connection.key_version));
    const apiSecret = decryptSecret(String(connection.api_secret_ciphertext), String(connection.api_secret_iv), String(connection.api_secret_tag), String(connection.key_version));
    if (!validKey(apiKey) || !validKey(apiSecret)) throw new Error('Stored exchange credentials failed validation.');
    const result = await binanceOrder(apiKey, apiSecret, { symbol, side, quantity }, live, clientOrderId);
    const executed = Number(result.executedQty);
    const quote = Number(result.cummulativeQuoteQty);
    const averagePrice = executed > 0 ? quote / executed : undefined;
    const updated = await supabaseUpdate('cp_orders', `id=eq.${localOrder.id}`, { exchange_order_id: String(result.orderId), status: result.status.toLowerCase(), ...(averagePrice !== undefined ? { price: averagePrice } : {}) });
    return { reused: false, order: updated[0] ?? localOrder };
  } catch (error) {
    await supabaseUpdate('cp_orders', `id=eq.${localOrder.id}`, { status: 'failed' });
    throw error;
  }
}
