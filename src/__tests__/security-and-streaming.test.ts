import assert from 'node:assert/strict';
import test from 'node:test';
import { idempotencyFingerprint, requireIdempotencyHeader } from '../../apps/web/lib/security.js';

test('idempotency fingerprint is stable for the same request', () => {
  const a = idempotencyFingerprint(42, 'request-1234', { symbol: 'BTC', amount: 10 });
  const b = idempotencyFingerprint(42, 'request-1234', { symbol: 'BTC', amount: 10 });
  assert.equal(a, b);
});

test('idempotency header rejects missing or malformed keys', () => {
  assert.throws(() => requireIdempotencyHeader(new Request('https://example.test')));
  assert.equal(requireIdempotencyHeader(new Request('https://example.test', { headers: { 'Idempotency-Key': 'request-1234' } })), 'request-1234');
});
