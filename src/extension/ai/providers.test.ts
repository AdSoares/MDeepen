import { describe, it, expect } from 'vitest';
import { PROVIDERS, DEFAULT_AI_CONFIG } from './types';

describe('PROVIDERS', () => {
  const ids = Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[];

  it('covers both providers', () => {
    expect(ids).toEqual(expect.arrayContaining(['anthropic', 'openai']));
  });

  it('offers at least one model each', () => {
    for (const id of ids) expect(PROVIDERS[id].models.length).toBeGreaterThan(0);
  });

  it('defaults to a model it actually offers', () => {
    for (const id of ids) expect(PROVIDERS[id].models).toContain(PROVIDERS[id].defaultModel);
  });

  it('never carries a price that is not a number', () => {
    // A model may have no price — a fetched or hand-typed id never will, and the estimate says so
    // rather than inventing one. What must never happen is a malformed entry.
    for (const id of ids) {
      for (const price of Object.values(PROVIDERS[id].inputPricePerM)) {
        expect(typeof price).toBe('number');
        expect(price).toBeGreaterThan(0);
      }
    }
  });

  it('gives every provider its own secret key name', () => {
    const keys = ids.map((id) => PROVIDERS[id].secretKey);
    expect(new Set(keys).size).toBe(ids.length);
  });

  it('keeps the default config pointing at a real provider and model', () => {
    const meta = PROVIDERS[DEFAULT_AI_CONFIG.provider];
    expect(meta).toBeDefined();
    expect(meta.models).toContain(DEFAULT_AI_CONFIG.model);
  });
});
