import { describe, it, expect } from 'vitest';
import { estimateTokens, estimateCost, formatCost, isPricedModel, PRICE_TABLE_DATE } from './costEstimate';
import { PROVIDERS } from './types';

describe('estimateTokens', () => {
  it('approximates chars/4 rounded up', () => {
    expect(estimateTokens('12345678')).toBe(2); // 8/4
    expect(estimateTokens('123')).toBe(1);       // ceil(3/4)
    expect(estimateTokens('')).toBe(0);
  });
});

describe('estimateCost', () => {
  it('prices a model from its own provider table', () => {
    const model = PROVIDERS.anthropic.defaultModel;
    const price = PROVIDERS.anthropic.inputPricePerM[model];
    expect(estimateCost(1_000_000, 'anthropic', model)).toBeCloseTo(price, 6);
  });

  it('prices haiku cheaper than opus', () => {
    expect(estimateCost(1_000_000, 'anthropic', 'claude-haiku-4-5')!)
      .toBeLessThan(estimateCost(1_000_000, 'anthropic', 'claude-opus-4-8')!);
  });

  it('reports an unknown model as unknown rather than inventing a price', () => {
    // A fetched or hand-typed id has no entry. A wrong number is worse than no number, because
    // only one of the two is believed.
    expect(estimateCost(1_000_000, 'anthropic', 'mystery')).toBeUndefined();
    expect(estimateCost(1_000_000, 'openai', PROVIDERS.openai.defaultModel)).toBeUndefined();
  });

  it('scales linearly with tokens', () => {
    const model = PROVIDERS.anthropic.defaultModel;
    expect(estimateCost(2_000_000, 'anthropic', model)!).toBeCloseTo(estimateCost(1_000_000, 'anthropic', model)! * 2, 6);
  });

  it('says whether a model has a price of its own', () => {
    expect(isPricedModel('anthropic', PROVIDERS.anthropic.defaultModel)).toBe(true);
    expect(isPricedModel('anthropic', 'a-model-someone-typed')).toBe(false);
  });

  it('dates the table, so an estimate can admit how old it is', () => {
    expect(PRICE_TABLE_DATE).toHaveLength(7);
    expect(PRICE_TABLE_DATE[4]).toBe('-');
  });
});

describe('formatCost', () => {
  it('shows four decimals for a normal estimate', () => {
    expect(formatCost(0.0125)).toBe('$0.0125');
  });
  it('never renders a real cost as $0.0000', () => {
    expect(formatCost(0.00002)).toBe('< $0.0001');
  });
  it('shows free as zero', () => {
    expect(formatCost(0)).toBe('$0.0000');
  });
});
