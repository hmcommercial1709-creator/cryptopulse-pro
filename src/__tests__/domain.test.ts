import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBeginnerTradePlan } from '../domain.js';

test('builds a 2:1 educational risk/reward plan', () => {
  const plan = buildBeginnerTradePlan({
    symbol: 'BTC', price: 100, change24h: 5, volume24h: 1000, updatedAt: new Date().toISOString(),
  }, 'low');

  assert.equal(plan.side, 'buy');
  assert.equal(plan.riskReward, 2);
  assert.ok(plan.stopLoss < plan.entry);
  assert.ok(plan.takeProfit > plan.entry);
});
