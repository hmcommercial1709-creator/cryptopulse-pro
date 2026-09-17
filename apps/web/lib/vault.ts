import { createDecipheriv } from 'node:crypto';

const KEY_BYTES = 32;
function vaultKey(): Buffer {
  const key = Buffer.from(process.env.CREDENTIAL_VAULT_KEY ?? '', 'base64');
  if (key.length !== KEY_BYTES) throw new Error('Invalid credential vault key.');
  return key;
}

export function decryptSecret(ciphertext: string, iv: string, authTag: string, keyVersion: string): string {
  if (keyVersion !== (process.env.CREDENTIAL_VAULT_KEY_VERSION ?? 'v1')) throw new Error('Unsupported credential key version.');
  const decipher = createDecipheriv('aes-256-gcm', vaultKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
