import { spawn } from 'node:child_process';
import { createBot } from './bot.js';
import { markNextWebReady, startWebServer } from './web.js';

const bot = createBot();
await bot.init();
console.log(`CryptoPulse bot initialized as @${bot.botInfo.username} (id=${bot.botInfo.id})`);
const publicUrl = process.env.WEBHOOK_URL
  ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined);

if (!publicUrl) throw new Error('WEBHOOK_URL or RAILWAY_PUBLIC_DOMAIN is required for Telegram webhook mode.');

const webhookUrl = new URL('/telegram/webhook', publicUrl).toString();
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const nextPort = Number(process.env.NEXT_PORT ?? 3000);
const miniAppPath = process.env.MINI_APP_PATH ?? '/mini';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const nextProcess = spawn(npmCommand, ['--prefix', 'apps/web', 'start'], {
  env: { ...process.env, PORT: String(nextPort) },
  stdio: 'inherit',
});

nextProcess.on('error', (error) => {
  console.error('Failed to start Mini App Next.js server:', error);
  process.exitCode = 1;
});
nextProcess.on('exit', (code, signal) => {
  if (code !== 0 && signal !== 'SIGTERM') {
    console.error(`Mini App Next.js server exited: code=${code ?? 'null'} signal=${signal ?? 'null'}`);
    process.exitCode = 1;
  }
});

startWebServer(bot);

async function waitForMiniApp(): Promise<void> {
  const healthUrl = `http://127.0.0.1:${nextPort}${miniAppPath}`;
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const response = await fetch(healthUrl, { redirect: 'manual' });
      if (response.status < 500) {
        markNextWebReady(true);
        console.log(`CryptoPulse Mini App ready on internal port ${nextPort}`);
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.error('Mini App Next.js server did not become ready within 30 seconds.');
}

void waitForMiniApp();

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`CryptoPulse shutdown requested by ${signal}`);

  try {
    await bot.stop();
  } catch (error) {
    console.error('Telegram bot shutdown failed:', error);
  }

  if (nextProcess.exitCode === null && !nextProcess.killed) {
    nextProcess.kill('SIGTERM');
  }
}

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

bot.api.setWebhook(webhookUrl, {
  ...(webhookSecret ? { secret_token: webhookSecret } : {}),
  allowed_updates: ['message', 'callback_query', 'inline_query'],
}).then(() => {
  console.log(`CryptoPulse Pro webhook configured at ${webhookUrl}`);
}).catch((error: unknown) => {
  console.error('Failed to configure Telegram webhook:', error);
  process.exitCode = 1;
});
