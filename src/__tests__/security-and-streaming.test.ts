import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateIndicators, ema, rsi, sma } from '../indicators.js';

test('technical indicator primitives remain deterministic', () => {
  assert.equal(sma([1, 2, 3, 4], 2), 3.5);
  assert.equal(ema([1, 2, 3, 4], 2), 3.5);
  assert.equal(rsi([1, 2, 3, 4, 5], 2), 100);
});

test('indicator aggregate exposes the expected committee inputs', () => {
  const candles = Array.from({ length: 30 }, (_, index) => ({
    open: index + 1,
    high: index + 2,
    low: index,
    close: index + 1,
    volume: 1000 + index,
    timestamp: new Date(index * 1000).toISOString(),
  }));
  const result = calculateIndicators(candles);
  assert.ok(result.sma20 !== null);
  assert.ok(result.ema20 !== null);
  assert.ok(result.rsi14 !== null);
  assert.ok(result.atr14 !== null);
});
