import 'dotenv/config';

const endpoint = process.env.MEMPOOL_WS_URL?.trim();
const subscription = process.env.MEMPOOL_WS_SUBSCRIPTION?.trim();
const watchedAddresses = new Set((process.env.SMART_MONEY_ADDRESSES ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));

function logEvent(raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const row = raw as Record<string, unknown>;
  const from = typeof row.from === 'string' ? row.from.toLowerCase() : '';
  const to = typeof row.to === 'string' ? row.to.toLowerCase() : '';
  const watched = (from && watchedAddresses.has(from)) || (to && watchedAddresses.has(to));
  if (watched) console.log(JSON.stringify({ type: 'smart_money_event', observedAt: new Date().toISOString(), from, to, hash: row.hash ?? null, value: row.value ?? null }));
}

export function startMempoolWorker(): void {
  if (!endpoint || !subscription) {
    console.log('Mempool worker disabled: configure MEMPOOL_WS_URL and MEMPOOL_WS_SUBSCRIPTION.');
    return;
  }
  const connect = (): void => {
    const socket = new WebSocket(endpoint);
    socket.addEventListener('open', () => {
      socket.send(subscription);
      console.log('Mempool stream connected.');
    });
    socket.addEventListener('message', (event) => {
      try { logEvent(JSON.parse(String(event.data))); } catch { console.warn('Ignored non-JSON mempool event.'); }
    });
    socket.addEventListener('error', () => console.error('Mempool stream error.'));
    socket.addEventListener('close', () => setTimeout(connect, 2000));
  };
  connect();
}

startMempoolWorker();
