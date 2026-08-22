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

describe('OpenAI-shaped errors', () => {
  // Both SDKs come from the same generator, so the class names and statuses match. These tests
  // pin that assumption rather than trusting it: if either SDK renames a class, one of these
  // fails instead of every error silently becoming 'unknown'.
  const shaped = (name: string, status?: number) => {
    const e = new Error('boom');
    Object.defineProperty(e, 'name', { value: name });
    if (status !== undefined) Object.assign(e, { status });
    return e;
  };

  it('classifies an authentication failure', () => {
    expect(classifyError(shaped('AuthenticationError', 401))).toBe('auth');
  });

  it('classifies a rate limit', () => {
    expect(classifyError(shaped('RateLimitError', 429))).toBe('rate_limit');
  });

  it('classifies a connection failure, which carries no status', () => {
    expect(classifyError(shaped('APIConnectionError'))).toBe('connection');
    expect(classifyError(shaped('APIConnectionTimeoutError'))).toBe('connection');
  });

  it('falls back to unknown for anything else', () => {
    expect(classifyError(shaped('BadRequestError', 400))).toBe('unknown');
  });
});
