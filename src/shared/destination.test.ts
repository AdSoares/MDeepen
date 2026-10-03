import { describe, it, expect } from 'vitest';
import { describeDestination, destinationKey, isLocalConfig } from './destination';

const loopback = (url: string) => {
  const d = describeDestination(url);
  return d.ok ? d.isLoopback : 'refused';
};

describe('describeDestination', () => {
  it.each([
    'http://localhost:11434/v1',
    'http://localhost:1234/v1',
    'http://LOCALHOST:11434/v1',
    'http://127.0.0.1:11434/v1',
    'http://127.8.8.8/v1',
    'http://[::1]:11434/v1',
  ])('treats %s as this machine', (url) => {
    expect(loopback(url)).toBe(true);
  });

  it.each([
    'http://0.0.0.0:11434/v1',
    'http://192.168.0.50:11434/v1',
    'http://localhost.:11434/v1',
    'http://localhost.example.com/v1',
    'http://127.0.0.1.nip.io/v1',
    'http://[::ffff:127.0.0.1]/v1',
    'https://openrouter.ai/api/v1',
    // The part before @ is credentials; the host is evil.com.
    'http://localhost@evil.com/v1',
  ])('treats %s as remote', (url) => {
    expect(loopback(url)).toBe(false);
  });

  it.each(['', '   ', 'not a url', 'ftp://localhost/v1', 'file:///etc/passwd', 'localhost:11434'])(
    'refuses %j',
    (url) => {
      const d = describeDestination(url);
      expect(d.ok).toBe(false);
    },
  );

  it('reports the origin and host the URL normalises to', () => {
    const d = describeDestination(' HTTP://LocalHost:11434/v1/ ');
    expect(d).toEqual({ ok: true, origin: 'http://localhost:11434', host: 'localhost:11434', isLoopback: true, isTls: false });
  });

  it('knows TLS from plain http', () => {
    const a = describeDestination('https://openrouter.ai/api/v1');
    const b = describeDestination('http://192.168.0.50:11434/v1');
    expect(a.ok && a.isTls).toBe(true);
    expect(b.ok && b.isTls).toBe(false);
  });
});

describe('destinationKey', () => {
  it('is the provider itself for the fixed providers', () => {
    expect(destinationKey('anthropic')).toBe('anthropic');
    expect(destinationKey('openai', 'http://ignored')).toBe('openai');
  });

  it('carries the origin for a compatible endpoint, ignoring the path', () => {
    expect(destinationKey('compatible', 'http://localhost:11434/v1')).toBe('compatible:http://localhost:11434');
    expect(destinationKey('compatible', 'http://localhost:11434/other')).toBe('compatible:http://localhost:11434');
  });

  it('tells two ports on the same host apart', () => {
    expect(destinationKey('compatible', 'http://localhost:11434/v1'))
      .not.toBe(destinationKey('compatible', 'http://localhost:1234/v1'));
  });
});

describe('isLocalConfig', () => {
  it('is true only for a compatible endpoint on loopback', () => {
    expect(isLocalConfig('compatible', 'http://localhost:11434/v1')).toBe(true);
    expect(isLocalConfig('compatible', 'http://192.168.0.50:11434/v1')).toBe(false);
    expect(isLocalConfig('compatible', undefined)).toBe(false);
    expect(isLocalConfig('openai', 'http://localhost:11434/v1')).toBe(false);
  });
});
