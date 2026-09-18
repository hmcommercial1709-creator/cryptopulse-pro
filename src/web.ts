import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Bot } from 'grammy';

const PORT = Number(process.env.PORT ?? 8080);
const HOST = '0.0.0.0';
const NEXT_PORT = Number(process.env.NEXT_PORT ?? 3000);
const WEBHOOK_PATH = '/telegram/webhook';
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
let nextWebReady = false;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function proxyToNext(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!nextWebReady) {
    sendJson(res, 503, { error: 'Mini App web service is starting.' });
    return;
  }

  const target = `http://127.0.0.1:${NEXT_PORT}${req.url ?? '/'}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null || key === 'host' || key === 'content-length' || key === 'connection') continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const body = hasBody ? await readBody(req) : undefined;
  const response = await fetch(target, {
    method: req.method ?? 'GET',
    headers,
    body: body && body.length ? body : undefined,
    redirect: 'manual',
  });

  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key !== 'connection' && key !== 'keep-alive' && key !== 'transfer-encoding') res.setHeader(key, value);
  });
  res.end(Buffer.from(await response.arrayBuffer()));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  res.setHeader('Cache-Control', 'no-store');

  if (url.pathname === '/health' || url.pathname === '/healthz') {
    sendJson(res, nextWebReady ? 200 : 503, {
      ok: nextWebReady,
      service: 'cryptopulse-pro',
      miniApp: nextWebReady,
      webhook: WEBHOOK_PATH,
    });
    return;
  }

  if (url.pathname === WEBHOOK_PATH) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }
    if (WEBHOOK_SECRET && req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    try {
      const body = await readBody(req);
      const update = JSON.parse(body) as Parameters<Bot['handleUpdate']>[0];
      const bot = (server as typeof server & { telegramBot?: Bot }).telegramBot;
      if (!bot) {
        sendJson(res, 503, { error: 'Bot not ready' });
        return;
      }
      await bot.handleUpdate(update);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      console.error('Telegram webhook update failed:', error);
      sendJson(res, 500, { error: 'Webhook processing failed' });
    }
    return;
  }

  if (url.pathname === '/' && !nextWebReady) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><body><h1>CryptoPulse Pro</h1><p>Starting Mini App web service…</p></body></html>');
    return;
  }

  try {
    await proxyToNext(req, res);
  } catch (error) {
    console.error('Mini App proxy failed:', error);
    sendJson(res, 502, { error: 'Mini App web service unavailable.' });
  }
});

server.on('error', (error) => {
  console.error('CryptoPulse HTTP server error:', error);
  process.exitCode = 1;
});

export function markNextWebReady(ready: boolean): void {
  nextWebReady = ready;
}

export function startWebServer(bot: Bot): void {
  (server as typeof server & { telegramBot?: Bot }).telegramBot = bot;
  server.listen(PORT, HOST, () => {
    console.log(`CryptoPulse HTTP gateway listening on http://${HOST}:${PORT}; Mini App upstream port ${NEXT_PORT}`);
  });
}
