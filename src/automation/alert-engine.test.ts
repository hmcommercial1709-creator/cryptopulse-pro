import { describe, expect, it } from 'vitest';

describe('alert engine contract', () => {
  it('uses inclusive threshold semantics', () => {
    const above = (price: number, target: number) => price >= target;
    const below = (price: number, target: number) => price <= target;
    expect(above(100, 100)).toBe(true);
    expect(below(100, 100)).toBe(true);
    expect(above(99.99, 100)).toBe(false);
    expect(below(100.01, 100)).toBe(false);
  });
});
