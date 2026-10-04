import { describe, it, expect } from 'vitest';
import { OpenAiProvider } from './OpenAiProvider';
import type { AiChunk, AiRequest } from './types';
import type { OpenAiClientLike, OpenAiStreamChunk } from './sdkShapes';

const REQ: AiRequest = { system: 'You summarize.', messages: [{ role: 'user', content: 'hi' }], maxTokens: 64 };

/** A client shaped like the slice of the SDK we use. It proves this provider handles what we
 *  believe OpenAI sends; only a real request proves the belief. */
function fakeClient(chunks: OpenAiStreamChunk[], opts: { failWith?: Error; models?: string[] } = {}) {
  const seen: { body: unknown; signal?: AbortSignal }[] = [];
  const client = {
    chat: {
      completions: {
        create: (body: unknown, options?: { signal: AbortSignal }) => {
          seen.push({ body, signal: options?.signal });
          if (opts.failWith) return Promise.reject(opts.failWith);
          return Promise.resolve((async function* () {
            for (const c of chunks) yield c;
          })());
        },
      },
    },
    models: { list: () => Promise.resolve({ data: (opts.models ?? []).map((id) => ({ id })) }) },
  } as unknown as OpenAiClientLike;
  return { client, seen };
}

const text = (t: string): OpenAiStreamChunk => ({ choices: [{ delta: { content: t } }] });
const usage = (prompt: number, completion: number): OpenAiStreamChunk =>
  ({ choices: [{ delta: {} }], usage: { prompt_tokens: prompt, completion_tokens: completion } });

async function collect(it: AsyncIterable<AiChunk>): Promise<AiChunk[]> {
  const out: AiChunk[] = [];
  for await (const c of it) out.push(c);
  return out;
}

describe('OpenAiProvider.generate', () => {
  it('streams each delta as text, in order', async () => {
    const { client } = fakeClient([text('one '), text('two'), usage(10, 5)]);
    const p = new OpenAiProvider('sk-x', 'a-model', undefined, client);

    const out = await collect(p.generate(REQ, new AbortController().signal));

    expect(out.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text)).toEqual(['one ', 'two']);
  });

  it('reports the usage that arrived on the final chunk', async () => {
    const { client } = fakeClient([text('x'), usage(120, 34)]);
    const p = new OpenAiProvider('sk-x', 'a-model', undefined, client);

    const out = await collect(p.generate(REQ, new AbortController().signal));
    const done = out.find((c) => c.type === 'done') as { usage: { inputTokens: number; outputTokens: number } };

    expect(done.usage).toEqual({ inputTokens: 120, outputTokens: 34 });
  });

  it('reports zero usage when the stream never sent any, rather than failing', async () => {
    const { client } = fakeClient([text('x')]);
    const p = new OpenAiProvider('sk-x', 'a-model', undefined, client);

    const out = await collect(p.generate(REQ, new AbortController().signal));
    const done = out.find((c) => c.type === 'done') as { usage: { inputTokens: number; outputTokens: number } };

    expect(done.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it('ignores empty deltas, which arrive on the usage chunk', async () => {
    const { client } = fakeClient([{ choices: [{ delta: {} }] }, text('real'), usage(1, 1)]);
    const p = new OpenAiProvider('sk-x', 'a-model', undefined, client);

    const out = await collect(p.generate(REQ, new AbortController().signal));

    expect(out.filter((c) => c.type === 'text')).toHaveLength(1);
  });

  it('turns a failure into a typed error chunk', async () => {
    const err = new Error('bad key');
    Object.defineProperty(err, 'name', { value: 'AuthenticationError' });
    const { client } = fakeClient([], { failWith: err });
    const p = new OpenAiProvider('sk-x', 'a-model', undefined, client);

    const out = await collect(p.generate(REQ, new AbortController().signal));

    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ type: 'error', kind: 'auth', message: 'bad key' });
  });

  it('stays silent when the failure is an abort the user asked for', async () => {
    const abort = new AbortController();
    abort.abort();
    const { client } = fakeClient([], { failWith: new Error('aborted') });
    const p = new OpenAiProvider('sk-x', 'a-model', undefined, client);

    const out = await collect(p.generate(REQ, abort.signal));

    expect(out).toEqual([]);
  });

  it('passes the abort signal down to the SDK', async () => {
    const abort = new AbortController();
    const { client, seen } = fakeClient([usage(1, 1)]);
    const p = new OpenAiProvider('sk-x', 'a-model', undefined, client);

    await collect(p.generate(REQ, abort.signal));

    expect(seen[0].signal).toBe(abort.signal);
  });
});

describe('OpenAiProvider.listModels', () => {
  it('maps the ids out of the page', async () => {
    const { client } = fakeClient([], { models: ['m-1', 'm-2'] });
    const p = new OpenAiProvider('sk-x', 'a-model', undefined, client);

    expect(await p.listModels()).toEqual(['m-1', 'm-2']);
  });
});

describe('OpenAiProvider with max_tokens', () => {
  it('streams a request carrying max_tokens', async () => {
    const { client, seen } = fakeClient([text('x'), usage(1, 1)]);
    const p = new OpenAiProvider('no-key', 'llama3', 'http://localhost:11434/v1', client, 'max_tokens');

    await collect(p.generate(REQ, new AbortController().signal));

    expect(seen[0].body).toMatchObject({ max_tokens: 64 });
    expect(seen[0].body).not.toHaveProperty('max_completion_tokens');
  });

  it('pings with max_tokens too', async () => {
    const { client, seen } = fakeClient([]);
    const p = new OpenAiProvider('no-key', 'llama3', 'http://localhost:11434/v1', client, 'max_tokens');

    await p.testConnection();

    expect(seen[0].body).toMatchObject({ max_tokens: 1 });
    expect(seen[0].body).not.toHaveProperty('max_completion_tokens');
  });
});
