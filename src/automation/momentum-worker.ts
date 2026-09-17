import 'dotenv/config';
import { buildCommitteeReport } from '../agents/committee.js';
import { formatCommitteeReport } from '../agents/committee-format.js';
import { getMarketSnapshots } from '../market.js';

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
};
const base = () => `${env('SUPABASE_URL')}/rest/v1`;
const headers = () => {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
};

type Previous = { volume_24h: number; price: number };
type Subscriber = { user_id: string; symbol: string; cp_users: { telegram_user_id: number | null } | null };

type Signal = {
  id: string;
  symbol: string;
  name: string;
  price: number;
  volume_change_pct: number;
  momentum_score: number;
  change_24h: number;
  volume_24h: number;
  detected_at: string;
};

async function read<T>(table: string, query: string): Promise<T[]> {
  const response = await fetch(`${base()}/${table}?${query}`, { headers: headers(), cache: 'no-store' });
  if (!response.ok) throw new Error(`Supabase ${table} read failed: ${response.status}`);
  return await response.json() as T[];
}

async function insert(table: string, body: Record<string, unknown>): Promise<{ created: boolean; id?: string }> {
  const response = await fetch(`${base()}/${table}`, {
    method: 'POST',
    headers: { ...headers(), Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (response.status === 409) return { created: false };
  if (!response.ok) throw new Error(`Supabase ${table} insert failed: ${response.status}`);
  const rows = await response.json() as Array<{ id?: string }>;
  const id = rows[0]?.id;
  return id ? { created: true, id } : { created: true };
}

async function persistCommitteeReport(signalId: string, report: ReturnType<typeof buildCommitteeReport>): Promise<void> {
  await insert('cp_committee_reports', {
    signal_id: signalId,
    symbol: report.symbol,
    decision: report.decision,
    confidence: report.confidence,
    report,
    generated_at: report.generatedAt,
  });
}

function score(volumeSpike: number, change24h: number): number {
  const volumeComponent = Math.min(70, Math.max(0, volumeSpike) * 10);
  const momentumComponent = Math.min(30, Math.max(0, change24h) * 3);
  return Math.round((volumeComponent + momentumComponent) * 10) / 10;
}

async function sendMomentumAlert(symbol: string, price: number, volumeSpike: number, momentumScore: number, change24h: number, committeeText?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('momentum-alerts-disabled: TELEGRAM_BOT_TOKEN is not configured');
    return;
  }

  const subscribers = await read<Subscriber>(
    'cp_watchlist_items',
    `symbol=eq.${encodeURIComponent(symbol)}&select=user_id,symbol,cp_users(telegram_user_id)&limit=5000`,
  );

  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, '');
  const miniAppUrl = username ? `https://t.me/${username}?startapp=momentum_${encodeURIComponent(symbol)}` : undefined;
  const text = [
    `⚡ CryptoPulse Momentum Alert\n\n${symbol}`,
    `Price: $${price.toLocaleString()}`,
    `24h: ${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%`,
    `Volume change: +${volumeSpike.toFixed(1)}%`,
    `Momentum score: ${momentumScore.toFixed(1)}`,
    committeeText ? `\n${committeeText}` : '',
  ].filter(Boolean).join('\n');

  let sent = 0;
  for (const subscriber of subscribers) {
    const chatId = subscriber.cp_users?.telegram_user_id;
    if (!chatId) continue;
    const replyMarkup = miniAppUrl
      ? { inline_keyboard: [[{ text: '📊 Open CryptoPulse', url: miniAppUrl }]] }
      : undefined;

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup }),
    });

    if (response.ok) sent += 1;
    else console.error(JSON.stringify({ event: 'momentum_alert_send_failed', symbol, chatId, status: response.status }));
  }

  console.log(JSON.stringify({ event: 'momentum_alert_dispatched', symbol, recipients: sent }));
}

async function cycle(): Promise<void> {
  const symbols = (process.env.MOMENTUM_SYMBOLS ?? 'BTC,ETH,SOL')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 50);
  const markets = await getMarketSnapshots(symbols);

  for (const market of markets) {
    const previous = await read<Previous>(
      'cp_momentum_snapshots',
      `symbol=eq.${encodeURIComponent(market.symbol)}&select=volume_24h,price&order=observed_at.desc&limit=1`,
    );
    const baseline = previous[0];
    const spike = baseline && baseline.volume_24h > 0
      ? ((market.volume24h - baseline.volume_24h) / baseline.volume_24h) * 100
      : 0;
    const momentumScore = score(spike / 100, market.change24h);

    await insert('cp_momentum_snapshots', {
      symbol: market.symbol,
      name: market.symbol,
      price: market.price,
      volume_24h: market.volume24h,
      change_24h: market.change24h,
    });

    if (
      baseline &&
      spike >= Number(process.env.MOMENTUM_VOLUME_SPIKE_PCT ?? 100) &&
      momentumScore >= Number(process.env.MOMENTUM_MIN_SCORE ?? 35)
    ) {
      const committee = buildCommitteeReport({
        symbol: market.symbol,
        price: market.price,
        change24h: market.change24h,
        volume24h: market.volume24h,
        volumeSpikePct: spike,
        momentumScore,
        observedAt: new Date().toISOString(),
      });
      const bucket = Math.floor(Date.now() / 300_000);
      const signal = await insert('cp_momentum_signals', {
        symbol: market.symbol,
        name: market.symbol,
        price: market.price,
        volume_change_pct: spike,
        momentum_score: momentumScore,
        change_24h: market.change24h,
        volume_24h: market.volume24h,
        share_key: `momentum:${market.symbol}:${bucket}`,
      });

      if (signal.created && signal.id) {
        await persistCommitteeReport(signal.id, committee);
        await sendMomentumAlert(market.symbol, market.price, spike, momentumScore, market.change24h, formatCommitteeReport(committee));
        console.log(JSON.stringify({ event: 'momentum_signal', symbol: market.symbol, signalId: signal.id, volumeSpikePct: spike, momentumScore, committeeDecision: committee.decision, committeeConfidence: committee.confidence }));
      }
    }
  }
}

const interval = Math.max(60_000, Number(process.env.MOMENTUM_INTERVAL_MS ?? 180_000));
async function main(): Promise<never> {
  for (;;) {
    try {
      await cycle();
    } catch (error) {
      console.error('momentum-cycle-failed', error instanceof Error ? error.message : 'unknown');
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

void main();
