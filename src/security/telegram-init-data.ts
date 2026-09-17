import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramWebAppUser { id: number; username?: string; language_code?: string; first_name?: string; last_name?: string }

export function validateTelegramInitData(initData: string, botToken: string, maxAgeSeconds = 3600): TelegramWebAppUser {
  if (!initData || !botToken) throw new Error('Telegram authentication required');
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  if (!hash || !Number.isSafeInteger(authDate)) throw new Error('Invalid initData');
  if (Math.abs(Math.floor(Date.now() / 1000) - authDate) > maxAgeSeconds) throw new Error('Expired initData');
  const dataCheckString = [...params.entries()].filter(([key]) => key !== 'hash').sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secretKey).update(dataCheckString).digest();
  const supplied = Buffer.from(hash, 'hex');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error('Invalid Telegram signature');
  const rawUser = params.get('user');
  if (!rawUser) throw new Error('Telegram user missing');
  const user = JSON.parse(rawUser) as TelegramWebAppUser;
  if (!Number.isSafeInteger(user.id) || user.id <= 0) throw new Error('Invalid Telegram user');
  return user;
}
