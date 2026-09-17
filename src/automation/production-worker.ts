import { getMarketSnapshot } from '../market.js';
import { decryptSecret } from '../security/vault.js';
import { createHmac } from 'node:crypto';

function env(name: string): string { const value = process.env[name]; if (!value) throw new Error(`${name} is required for automation worker.`); return value; }
const supabaseBase = () => `${env('SUPABASE_URL')}/rest/v1`;
const supabaseHeaders = () => ({ apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}` });
async function select<T extends Record<string, unknown>>(table: string, query: string): Promise<T[]> { const r = await fetch(`${supabaseBase()}/${table}?${query}`, { headers: supabaseHeaders(), cache: 'no-store' }); if (!r.ok) throw new Error(`Supabase ${table} query failed (${r.status})`); return await r.json() as T[]; }
async function update(table: string, query: string, body: Record<string, unknown>): Promise<void> { const r = await fetch(`${supabaseBase()}/${table}?${query}`, { method: 'PATCH', headers: { ...supabaseHeaders(), 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`Supabase ${table} update failed (${r.status})`); }
async function insert(table: string, body: Record<string, unknown>): Promise<Record<string, unknown>[]> { const r = await fetch(`${supabaseBase()}/${table}`, { method: 'POST', headers: { ...supabaseHeaders(), 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`Supabase ${table} insert failed (${r.status})`); return await r.json() as Record<string, unknown>[]; }

async function executeAuto(userId: string, portfolioId: string, exchange: string, symbol: string, side: 'BUY' | 'SELL', quantity: string, mode: 'paper' | 'testnet' | 'live', strategy: string) {
  if (exchange !== 'binance') return;
  const slot = Math.floor(Date.now() / 60_000);
  const idempotencyKey = `auto_${strategy}_${symbol}_${side}_${slot}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32);
  const existing = await select('cp_orders', `user_id=eq.${userId}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=id,status&limit=1`);
  if (existing[0]) return;
  const connections = await select<Record<string, unknown>>('cp_exchange_connections', `user_id=eq.${userId}&exchange=eq.binance&select=api_key_ciphertext,api_secret_ciphertext,api_key_iv,api_secret_iv,api_key_tag,api_secret_tag,key_version,live_enabled&limit=1`);
  const c = connections[0]; if (!c) return;
  const live = mode === 'live'; if (live && c.live_enabled !== true) return;
  const key = decryptSecret(String(c.api_key_ciphertext), String(c.api_key_iv), String(c.api_key_tag), String(c.key_version));
  const secret = decryptSecret(String(c.api_secret_ciphertext), String(c.api_secret_iv), String(c.api_secret_tag), String(c.key_version));
  const clientOrderId = `cp_${userId.slice(0, 8)}_${idempotencyKey}`.slice(0, 36);
  const local = await insert('cp_orders', { user_id: userId, portfolio_id: portfolioId, client_order_id: clientOrderId, symbol, side, order_type: 'MARKET', quantity, status: 'pending', mode, idempotency_key: idempotencyKey, idempotency_fingerprint: `${exchange}:${symbol}:${side}:${quantity}:${mode}` });
  const localId = local[0]?.id; if (typeof localId !== 'string') return;
  try {
    if (mode === 'paper') { await update('cp_orders', `id=eq.${localId}`, { status: 'filled' }); return; }
    const base = live ? 'https://api.binance.com' : 'https://testnet.binance.vision';
    const params = new URLSearchParams({ symbol, side, type: 'MARKET', quantity, newClientOrderId: clientOrderId, timestamp: String(Date.now()), recvWindow: '5000' });
    const signature = createHmac('sha256', secret).update(params.toString()).digest('hex');
    const r = await fetch(`${base}/api/v3/order?${params}&signature=${signature}`, { method: 'POST', headers: { 'X-MBX-APIKEY': key }, signal: AbortSignal.timeout(10_000) });
    const body = await r.text(); if (!r.ok) throw new Error(`Binance execution failed (${r.status})`);
    const result = JSON.parse(body) as { orderId: number; status: string; executedQty: string; cummulativeQuoteQty: string };
    await update('cp_orders', `id=eq.${localId}`, { exchange_order_id: String(result.orderId), status: result.status.toLowerCase(), price: Number(result.cummulativeQuoteQty) / Math.max(Number(result.executedQty), 1) });
  } catch (error) { await update('cp_orders', `id=eq.${localId}`, { status: 'failed' }); throw error; }
}

async function cycle(): Promise<void> {
  const configs = await select<Record<string, unknown>>('cp_auto_trading_configs', 'enabled=eq.true&select=id,user_id,portfolio_id,mode,strategy,max_open_trades,symbols');
  for (const cfg of configs) {
    const userId = String(cfg.user_id); const portfolioId = String(cfg.portfolio_id); const mode = String(cfg.mode) as 'paper' | 'testnet' | 'live';
    const symbols = Array.isArray(cfg.symbols) ? cfg.symbols.map(String).map((s) => s.toUpperCase()).filter(Boolean) : [];
    const open = await select('cp_positions', `portfolio_id=eq.${portfolioId}&select=id&limit=${Math.max(1, Number(cfg.max_open_trades) || 1)}`);
    if (open.length >= (Number(cfg.max_open_trades) || 1)) continue;
    for (const symbol of [...new Set(symbols)]) {
      const snapshot = await getMarketSnapshot(symbol.replace(/USDT$/, ''));
      const action = snapshot.change24h >= 3 ? 'BUY' : snapshot.change24h <= -5 ? 'SELL' : 'HOLD';
      if (action === 'HOLD') continue;
      await executeAuto(userId, portfolioId, String(cfg.exchange ?? 'binance'), symbol.endsWith('USDT') ? symbol : `${symbol}USDT`, action, '0.001', mode, String(cfg.strategy ?? 'momentum-v1'));
    }
  }
}

async function main(): Promise<never> { let failures = 0; const interval = Math.max(10_000, Number(process.env.AUTOMATION_INTERVAL_MS ?? 30_000)); for (;;) { try { await cycle(); failures = 0; } catch (error) { failures += 1; console.error('automation-cycle-failed', error instanceof Error ? error.message : 'unknown'); await new Promise((r) => setTimeout(r, Math.min(interval * 2 ** Math.min(failures, 5), 120_000))); } await new Promise((r) => setTimeout(r, interval)); } }
main().catch((error) => { console.error('automation-worker-fatal', error); process.exit(1); });
