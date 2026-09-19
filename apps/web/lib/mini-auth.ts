import { validateTelegramInitData, type TelegramUser } from './telegram';

export function requireTelegramUser(request: Request): TelegramUser {
  const initData = request.headers.get('x-telegram-init-data') ?? '';
  // Cloudflare production uses BOT_TOKEN for the shared Worker secret, while older
  // Node/Railway deployments used TELEGRAM_BOT_TOKEN. Accept both names so the
  // authenticated Mini App API does not silently lose Telegram auth after migration.
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN ?? process.env.BOT_TOKEN ?? '').trim();
  return validateTelegramInitData(initData, botToken);
}

export function normalizeSymbol(value: unknown): string {
  const symbol = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{2,20}$/.test(symbol)) throw new Error('Invalid symbol.');
  return symbol;
}

export function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}
