/**
 * The `fetch` a compatible endpoint is reached through. The OpenAI SDK fills requests from the
 * environment — `OPENAI_ORG_ID`, `OPENAI_PROJECT_ID`, and arbitrary `OPENAI_CUSTOM_HEADERS` —
 * which is meant for api.openai.com and offers no switch to turn off. A compatible endpoint may be
 * any host at all, so only the headers a request needs leave, and a redirect is an error rather
 * than a second destination the user never chose.
 */
const ALLOWED = new Set(['accept', 'authorization', 'content-type', 'idempotency-key', 'user-agent']);

const allowed = (name: string) => ALLOWED.has(name) || name.startsWith('x-stainless-');

export const compatibleFetch: typeof fetch = (input, init = {}) => {
  const headers = new Headers();
  new Headers(init.headers).forEach((value, name) => { if (allowed(name)) headers.set(name, value); });
  // Read at call time, so the runtime's fetch — or a test's stub — is the one used.
  return globalThis.fetch(input, { ...init, headers, redirect: 'error' });
};
