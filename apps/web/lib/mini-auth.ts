import { validateTelegramInitData, type TelegramUser } from './telegram';

export function requireTelegramUser(request: Request): TelegramUser {
  const initData = request.headers.get('x-telegram-init-data') ?? '';
  return validateTelegramInitData(initData, process.env.TELEGRAM_BOT_TOKEN ?? '');
}

export function normalizeSymbol(value: unknown): string {
  const symbol = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{2,20}$/.test(symbol)) throw new Error('Invalid symbol.');
  return symbol;
}

export function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}
