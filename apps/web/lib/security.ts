import { createHash, randomUUID } from 'node:crypto';

export function requireServerEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

export function newIdempotencyKey(): string { return randomUUID(); }
export function idempotencyFingerprint(userId: number, key: string, payload: unknown): string {
  return createHash('sha256').update(`${userId}:${key}:${JSON.stringify(payload)}`).digest('hex');
}

export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const site = process.env.SITE_URL ?? 'https://cryptopulse.pro';
  return origin === site;
}
