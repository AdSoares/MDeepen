import { describe, it, expect } from 'vitest';
import { classifyError } from './errorMap';

describe('classifyError', () => {
  it('maps auth errors', () => {
    expect(classifyError({ name: 'AuthenticationError', status: 401 })).toBe('auth');
  });
  it('maps rate limit', () => {
    expect(classifyError({ name: 'RateLimitError', status: 429 })).toBe('rate_limit');
  });
  it('maps connection', () => {
    expect(classifyError({ name: 'APIConnectionError' })).toBe('connection');
  });
  it('maps status 401/429 even without a name', () => {
    expect(classifyError({ status: 401 })).toBe('auth');
    expect(classifyError({ status: 429 })).toBe('rate_limit');
  });
  it('maps a real SDK connection error, which carries no name and no status', () => {
    // The Anthropic SDK never sets `name` on its error classes and leaves
    // `status` undefined on connection failures; only the class name identifies it.
    class APIConnectionError extends Error {}
    expect(classifyError(new APIConnectionError('Connection error.'))).toBe('connection');
  });
  it('falls back to unknown', () => {
    expect(classifyError(new Error('boom'))).toBe('unknown');
    expect(classifyError(null)).toBe('unknown');
  });
});
