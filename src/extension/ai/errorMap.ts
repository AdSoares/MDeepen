import type { AiErrorKind } from './types';

// The SDK's error classes do not set `name` (it stays 'Error'), so the class
// name is the only marker on a connection failure, which also has no status.
function classNameOf(err: object): string | undefined {
  const name = (err as { name?: string }).name;
  if (name && name !== 'Error') return name;
  return err.constructor?.name;
}

export function classifyError(err: unknown): AiErrorKind {
  if (typeof err !== 'object' || err === null) return 'unknown';
  const e = err as { status?: number };
  const name = classNameOf(err);
  if (name === 'AuthenticationError' || e.status === 401) return 'auth';
  if (name === 'RateLimitError' || e.status === 429) return 'rate_limit';
  if (name === 'APIConnectionError' || name === 'APIConnectionTimeoutError') return 'connection';
  return 'unknown';
}
