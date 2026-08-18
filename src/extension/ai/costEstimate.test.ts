import { describe, it, expect } from 'vitest';
import { estimateTokens, estimateCost } from './costEstimate';

describe('estimateTokens', () => {
  it('approximates chars/4 rounded up', () => {
    expect(estimateTokens('12345678')).toBe(2); // 8/4
    expect(estimateTokens('123')).toBe(1);       // ceil(3/4)
    expect(estimateTokens('')).toBe(0);
  });
});

describe('estimateCost', () => {
  it('prices opus input at $5 / 1M tokens', () => {
    expect(estimateCost(1_000_000, 'claude-opus-4-8')).toBeCloseTo(5, 5);
  });
  it('prices haiku cheaper than opus', () => {
    expect(estimateCost(1_000_000, 'claude-haiku-4-5')).toBeLessThan(estimateCost(1_000_000, 'claude-opus-4-8'));
  });
  it('falls back to opus price for an unknown model', () => {
    expect(estimateCost(1_000_000, 'mystery')).toBeCloseTo(5, 5);
  });
});
