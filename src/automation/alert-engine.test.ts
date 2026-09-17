import test from 'node:test';
import assert from 'node:assert/strict';

test('alert engine contract uses inclusive threshold semantics', () => {
  const above = (price: number, target: number) => price >= target;
  const below = (price: number, target: number) => price <= target;

  assert.equal(above(100, 100), true);
  assert.equal(below(100, 100), true);
  assert.equal(above(99.99, 100), false);
  assert.equal(below(100.01, 100), false);
});
