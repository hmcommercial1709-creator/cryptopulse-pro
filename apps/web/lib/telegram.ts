import { createHmac, timingSafeEqual } from 'node:crypto';

export type TelegramUser = { id: number; username?: string; first_name?: string; last_name?: string; language_code?: string };

export function validateTelegramInitData(initData: string, botToken: string, maxAgeSeconds = 3600): TelegramUser {
  if (!initData || !botToken) throw new Error('Telegram authentication is required.');
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  if (!hash || !Number.isSafeInteger(authDate)) throw new Error('Invalid Telegram initData.');
  if (Math.abs(Math.floor(Date.now() / 1000) - authDate) > maxAgeSeconds) throw new Error('Expired Telegram initData.');
  const dataCheck = [...params.entries()].filter(([k]) => k !== 'hash').sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheck).digest();
  const supplied = Buffer.from(hash, 'hex');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error('Invalid Telegram signature.');
  const rawUser = params.get('user');
  if (!rawUser) throw new Error('Telegram user is missing.');
  const user = JSON.parse(rawUser) as TelegramUser;
  if (!Number.isSafeInteger(user.id) || user.id <= 0) throw new Error('Invalid Telegram user.');
  return user;
}
