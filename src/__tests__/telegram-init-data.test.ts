import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { validateTelegramInitData } from '../security/telegram-init-data.js';

test('validates Telegram initData and rejects tampering', () => {
  const token = '123456:TESTTOKEN';
  const authDate = Math.floor(Date.now() / 1000);
  const user = JSON.stringify({ id: 987654321, first_name: 'Test' });
  const params = new URLSearchParams({ auth_date: String(authDate), query_id: 'AA', user });
  const data = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(data).digest('hex');
  const initData = `${params.toString()}&hash=${hash}`;
  assert.equal(validateTelegramInitData(initData, token).id, 987654321);
  assert.throws(() => validateTelegramInitData(`${params.toString()}&hash=${'0'.repeat(64)}`, token));
});
