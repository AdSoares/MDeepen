import { describe, it, expect } from 'vitest';
import { PROVIDERS, DEFAULT_AI_CONFIG } from './types';

describe('PROVIDERS', () => {
  const ids = Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[];
  // A compatible endpoint has no curated list: its models come from /models or are typed. The
  // exemption is named, so the rule still binds every provider that does ship a list.
  const curated = ids.filter((id) => id !== 'compatible');

  it('covers all three providers', () => {
    expect(ids).toEqual(expect.arrayContaining(['anthropic', 'openai', 'compatible']));
  });

  it('offers at least one model for each curated provider', () => {
    for (const id of curated) expect(PROVIDERS[id].models.length).toBeGreaterThan(0);
  });

  it('defaults each curated provider to a model it actually offers', () => {
    for (const id of curated) expect(PROVIDERS[id].models).toContain(PROVIDERS[id].defaultModel);
  });

  it('gives a compatible endpoint no curated list, no default model and no prices', () => {
    expect(PROVIDERS.compatible.models).toEqual([]);
    expect(PROVIDERS.compatible.defaultModel).toBe('');
    expect(PROVIDERS.compatible.inputPricePerM).toEqual({});
  });

  it('points a compatible endpoint at Ollama by default', () => {
    expect(PROVIDERS.compatible.defaultBaseUrl).toBe('http://localhost:11434/v1');
  });

  it('lets only a compatible endpoint go without a key', () => {
    expect(PROVIDERS.anthropic.requiresKey).toBe(true);
    expect(PROVIDERS.openai.requiresKey).toBe(true);
    expect(PROVIDERS.compatible.requiresKey).toBe(false);
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
