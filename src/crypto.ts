import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function keyFromEnv(): Buffer {
  const raw = process.env.EXCHANGE_ENCRYPTION_KEY;
  if (!raw) throw new Error('EXCHANGE_ENCRYPTION_KEY is required for exchange credential encryption.');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('EXCHANGE_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  return key;
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFromEnv(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decryptSecret(payload: string): string {
  const [iv64, tag64, ciphertext64] = payload.split('.');
  if (!iv64 || !tag64 || !ciphertext64) throw new Error('Invalid encrypted secret payload.');
  const decipher = createDecipheriv('aes-256-gcm', keyFromEnv(), Buffer.from(iv64, 'base64'));
  decipher.setAuthTag(Buffer.from(tag64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext64, 'base64')), decipher.final()]).toString('utf8');
}
