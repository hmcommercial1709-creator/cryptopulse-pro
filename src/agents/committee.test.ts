import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCommitteeReport } from './committee.js';

test('committee never authorizes execution', () => {
  const report = buildCommitteeReport({
    symbol: 'BTC', price: 100_000, change24h: 4, volume24h: 5_000_000_000,
    volumeSpikePct: 120, momentumScore: 42, observedAt: new Date().toISOString(),
  });
  assert.equal(report.executionAllowed, false);
  assert.ok(report.agents.length === 3);
});

test('committee blocks invalid market data', () => {
  const report = buildCommitteeReport({
    symbol: 'BTC', price: 0, change24h: 0, volume24h: 0,
    volumeSpikePct: 0, momentumScore: 0, observedAt: new Date().toISOString(),
  });
  assert.equal(report.decision, 'blocked');
  assert.equal(report.executionAllowed, false);
});
