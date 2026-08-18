// Input-side USD per 1M tokens (from the claude-api model table).
const INPUT_PRICE_PER_M: Record<string, number> = {
  'claude-opus-4-8': 5,
  'claude-sonnet-5': 3,
  'claude-haiku-4-5': 1,
};

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateCost(inputTokens: number, model: string): number {
  const price = INPUT_PRICE_PER_M[model] ?? INPUT_PRICE_PER_M['claude-opus-4-8'];
  return (inputTokens / 1_000_000) * price;
}

/** Renders an estimate without ever showing a real cost as $0.0000. */
export function formatCost(usd: number): string {
  if (usd > 0 && usd < 0.0001) return '< $0.0001';
  return `$${usd.toFixed(4)}`;
}
