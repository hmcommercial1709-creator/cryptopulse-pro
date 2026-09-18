import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Bot } from 'grammy';

const PORT = Number(process.env.PORT ?? 8080);
const HOST = '0.0.0.0';
const WEBHOOK_PATH = '/telegram/webhook';
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  res.setHeader('Cache-Control', 'no-store');

  if (url.pathname === '/health' || url.pathname === '/healthz') {
    sendJson(res, 200, { ok: true, service: 'cryptopulse-pro', webhook: WEBHOOK_PATH });
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

  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CryptoPulse Pro</title>
</head>
<body>
<main>
<h1>CryptoPulse Pro</h1>
<p>Web service online.</p>
<p>Telegram webhook endpoint is active.</p>
</main>
</body>
</html>`);
    return;
  }

  sendJson(res, 404, { error: 'Not Found' });
});

server.on('error', (error) => {
  console.error('CryptoPulse HTTP server error:', error);
  process.exitCode = 1;
});

export function startWebServer(bot: Bot): void {
  (server as typeof server & { telegramBot?: Bot }).telegramBot = bot;
  server.listen(PORT, HOST, () => {
    console.log(`CryptoPulse HTTP server listening on http://${HOST}:${PORT}`);
  });
}
