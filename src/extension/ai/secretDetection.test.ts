import { describe, it, expect } from 'vitest';
import { detectSecrets, maskSecrets } from './secretDetection';

describe('detectSecrets', () => {
  it('detects an sk- style key', () => {
    const out = detectSecrets('token is sk-abcdef0123456789abcdef here');
    expect(out.length).toBe(1);
    expect(out[0].kind).toBe('api-key');
  });
  it('detects an AWS access key id', () => {
    expect(detectSecrets('AKIAIOSFODNN7EXAMPLE').some((s) => s.kind === 'aws-key')).toBe(true);
  });
  it('detects a github token', () => {
    expect(detectSecrets('ghp_1234567890abcdefghijklmnopqrstuvwxyz').length).toBe(1);
  });
  it('returns empty for clean text', () => {
    expect(detectSecrets('the quick brown fox jumps over the lazy dog')).toEqual([]);
  });
});

describe('maskSecrets', () => {
  it('replaces a detected secret with the redaction marker', () => {
    const masked = maskSecrets('key sk-abcdef0123456789abcdef done');
    expect(masked).toContain('\u2039redacted\u203a');
    expect(masked).not.toContain('sk-abcdef');
    expect(masked).toContain('key ');
    expect(masked).toContain(' done');
  });
  it('leaves clean text unchanged', () => {
    expect(maskSecrets('nothing to see')).toBe('nothing to see');
  });
});
