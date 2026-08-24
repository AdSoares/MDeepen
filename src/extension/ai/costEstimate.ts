import type { ProviderId } from './types';
import { PROVIDERS } from './types';

/** When the price table was last checked. Shown beside every estimate, because a hardcoded price
 *  ages silently — unlike a stale model id, nothing fails when it drifts. */
export const PRICE_TABLE_DATE = '2026-08';

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Whether this model has a price in the table at all. */
export function isPricedModel(provider: ProviderId, model: string): boolean {
  const meta = PROVIDERS[provider] ?? PROVIDERS.anthropic;
  return typeof meta.inputPricePerM[model] === 'number';
}

/**
 * Undefined when the model has no price: a fetched id, a hand-typed one, or one nobody has looked
 * up. The dialog then says the cost is not known, because a wrong number is worse than no number —
 * only one of the two is believed.
 */
export function estimateCost(inputTokens: number, provider: ProviderId, model: string): number | undefined {
  const meta = PROVIDERS[provider] ?? PROVIDERS.anthropic;
  const price = meta.inputPricePerM[model];
  if (typeof price !== 'number') return undefined;
  return (inputTokens / 1_000_000) * price;
}
/** Renders an estimate without ever showing a real cost as $0.0000. */
export function formatCost(usd: number): string {
  if (usd > 0 && usd < 0.0001) return '< $0.0001';
  return `$${usd.toFixed(4)}`;
}
