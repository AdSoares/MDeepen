import { describe, it, expect, afterEach, vi } from 'vitest';
import { createProvider, KEYLESS_PLACEHOLDER } from './providerRegistry';

const COMPATIBLE = { provider: 'compatible' as const, model: 'llama3', maxTokens: 64, baseUrl: 'http://localhost:11434/v1' };
const saved = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (saved === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = saved;
});

/** The real SDK client, reached through the provider. Its `apiKey` and `baseURL` are public on
 *  the SDK object; the provider keeps it private, hence the cast. */
const sdkOf = (p: unknown) => (p as { client: { apiKey: string; baseURL: string } }).client;

describe('createProvider for a compatible endpoint', () => {
  it('builds without a key, which the SDK would otherwise refuse', () => {
    expect(() => createProvider(COMPATIBLE, '')).not.toThrow();
  });

  it('never picks up OPENAI_API_KEY from the environment', () => {
    // An absent key makes the SDK read the environment, and this endpoint may be any host at all.
    process.env.OPENAI_API_KEY = 'sk-from-the-environment';
    const sdk = sdkOf(createProvider(COMPATIBLE, ''));
    expect(sdk.apiKey).toBe(KEYLESS_PLACEHOLDER);
    expect(sdk.apiKey).not.toBe('sk-from-the-environment');
  });

  it('sends a stored key when there is one', () => {
    expect(sdkOf(createProvider(COMPATIBLE, 'sk-or-123')).apiKey).toBe('sk-or-123');
  });

  it('targets the configured base URL', () => {
    expect(sdkOf(createProvider(COMPATIBLE, '')).baseURL).toBe('http://localhost:11434/v1');
  });

  it('refuses a compatible config with no base URL', () => {
    expect(() => createProvider({ ...COMPATIBLE, baseUrl: undefined }, '')).toThrow(/base URL/);
  });
});

describe('what a compatible endpoint is sent', () => {
  const ENV = ['OPENAI_ORG_ID', 'OPENAI_PROJECT_ID', 'OPENAI_CUSTOM_HEADERS'] as const;
  const before = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of ENV) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  });

  function captureFetch() {
    const seen: { headers: Headers; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (_url: unknown, init: RequestInit = {}) => {
      seen.push({ headers: new Headers(init.headers), init });
      return new Response(JSON.stringify({ object: 'list', data: [{ id: 'llama3', object: 'model' }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    });
    return seen;
  }

  it('never forwards organization, project or custom headers from the environment', async () => {
    // The SDK reads these for api.openai.com; a compatible endpoint may be any host at all, and
    // OPENAI_CUSTOM_HEADERS is where a gateway token would live.
    process.env.OPENAI_ORG_ID = 'org-from-env';
    process.env.OPENAI_PROJECT_ID = 'proj-from-env';
    process.env.OPENAI_CUSTOM_HEADERS = 'X-Gateway-Token: tok-123\nX-Other: y';
    const seen = captureFetch();

    const models = await createProvider(COMPATIBLE, '').listModels();

    expect(models).toEqual(['llama3']);
    const h = seen[0].headers;
    expect(h.get('openai-organization')).toBeNull();
    expect(h.get('openai-project')).toBeNull();
    expect(h.get('x-gateway-token')).toBeNull();
    expect(h.get('x-other')).toBeNull();
    expect(h.get('authorization')).toBe(`Bearer ${KEYLESS_PLACEHOLDER}`);
  });

  it('refuses to follow a redirect, so a local server cannot bounce content elsewhere', async () => {
    const seen = captureFetch();

    await createProvider(COMPATIBLE, '').listModels();

    expect(seen[0].init.redirect).toBe('error');
  });
});
