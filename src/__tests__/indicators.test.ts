import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateIndicators, ema, rsi, type Candle } from '../indicators.js';

test('EMA returns the expected value for a simple series', () => {
  assert.equal(ema([1, 2, 3, 4, 5], 3), 4);
});

test('RSI reaches 100 for a continuously rising series', () => {
  assert.equal(rsi(Array.from({ length: 16 }, (_, index) => index + 1)), 100);
});

test('indicator engine detects recent support and resistance', () => {
  const candles: Candle[] = Array.from({ length: 60 }, (_, index) => ({
    open: 100 + index,
    high: 102 + index,
    low: 98 + index,
    close: 101 + index,
    volume: 1000,
    timestamp: new Date(2026, 0, index + 1).toISOString(),
  }));
  const result = calculateIndicators(candles);
  assert.equal(result.support, 138);
  assert.equal(result.resistance, 161);
  assert.notEqual(result.ema50, null);
});
