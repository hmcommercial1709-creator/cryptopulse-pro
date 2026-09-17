import 'dotenv/config';
import { getMarketSnapshots } from '../market.js';

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
};
const base = () => `${env('SUPABASE_URL')}/rest/v1`;
const headers = () => { const key = env('SUPABASE_SERVICE_ROLE_KEY'); return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }; };

type Previous = { volume_24h: number; price: number };

async function read<T>(table: string, query: string): Promise<T[]> {
  const response = await fetch(`${base()}/${table}?${query}`, { headers: headers(), cache: 'no-store' });
  if (!response.ok) throw new Error(`Supabase ${table} read failed: ${response.status}`);
  return await response.json() as T[];
}
async function insert(table: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${base()}/${table}`, { method: 'POST', headers: { ...headers(), Prefer: 'return=minimal' }, body: JSON.stringify(body) });
  if (!response.ok && response.status !== 409) throw new Error(`Supabase ${table} insert failed: ${response.status}`);
}

function score(volumeSpike: number, change24h: number): number {
  const volumeComponent = Math.min(70, Math.max(0, volumeSpike) * 10);
  const momentumComponent = Math.min(30, Math.max(0, change24h) * 3);
  return Math.round((volumeComponent + momentumComponent) * 10) / 10;
}

async function cycle(): Promise<void> {
  const symbols = (process.env.MOMENTUM_SYMBOLS ?? 'BTC,ETH,SOL').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 50);
  const markets = await getMarketSnapshots(symbols);
  for (const market of markets) {
    const previous = await read<Previous>('cp_momentum_snapshots', `symbol=eq.${encodeURIComponent(market.symbol)}&select=volume_24h,price&order=observed_at.desc&limit=1`);
    const baseline = previous[0];
    const spike = baseline && baseline.volume_24h > 0 ? ((market.volume24h - baseline.volume_24h) / baseline.volume_24h) * 100 : 0;
    const momentumScore = score(spike / 100, market.change24h);
    await insert('cp_momentum_snapshots', { symbol: market.symbol, name: market.symbol, price: market.price, volume_24h: market.volume24h, change_24h: market.change24h });
    if (baseline && spike >= Number(process.env.MOMENTUM_VOLUME_SPIKE_PCT ?? 100) && momentumScore >= Number(process.env.MOMENTUM_MIN_SCORE ?? 35)) {
      const bucket = Math.floor(Date.now() / 300_000);
      await insert('cp_momentum_signals', { symbol: market.symbol, name: market.symbol, price: market.price, volume_change_pct: spike, momentum_score: momentumScore, change_24h: market.change24h, volume_24h: market.volume24h, share_key: `momentum:${market.symbol}:${bucket}` });
      console.log(JSON.stringify({ event: 'momentum_signal', symbol: market.symbol, volumeSpikePct: spike, momentumScore }));
    }
  }
}

const interval = Math.max(60_000, Number(process.env.MOMENTUM_INTERVAL_MS ?? 180_000));
async function main(): Promise<never> { for (;;) { try { await cycle(); } catch (error) { console.error('momentum-cycle-failed', error instanceof Error ? error.message : 'unknown'); } await new Promise(resolve => setTimeout(resolve, interval)); } }
void main();
