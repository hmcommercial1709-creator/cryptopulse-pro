import { createHash, randomUUID } from 'node:crypto';

const buckets = new Map<string, { count: number; resetAt: number }>();

export function requireServerEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

export function newIdempotencyKey(): string { return randomUUID(); }

export function idempotencyFingerprint(userId: number, key: string, payload: unknown): string {
  return createHash('sha256').update(`${userId}:${key}:${JSON.stringify(payload)}`).digest('hex');
}

export function requestFingerprint(request: Request, userId: number): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  return createHash('sha256').update(`${userId}:${forwarded}`).digest('hex');
}

export function enforceRateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (current.count >= limit) throw new Error('Rate limit exceeded.');
  current.count += 1;
}

export function requireIdempotencyHeader(request: Request): string {
  const key = request.headers.get('idempotency-key')?.trim() ?? '';
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) throw new Error('A valid Idempotency-Key is required.');
  return key;
}

export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const configured = process.env.MINI_APP_ORIGIN;
  if (!configured) return false;
  return origin === configured;
}
