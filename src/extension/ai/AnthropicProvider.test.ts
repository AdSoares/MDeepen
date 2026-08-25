import { describe, it, expect } from 'vitest';
import { AnthropicProvider } from './AnthropicProvider';
import type { AiChunk, AiRequest } from './types';
import type { AnthropicClientLike, AnthropicTextEvent } from './sdkShapes';

const REQ: AiRequest = { system: 'You summarize.', messages: [{ role: 'user', content: 'hi' }], maxTokens: 64 };

/** A client shaped like the slice of the SDK we use. It proves this provider handles what we
 *  believe Anthropic sends; only a real request proves the belief. */
function fakeClient(
  events: AnthropicTextEvent[],
  opts: { failWith?: Error; usage?: { input_tokens: number; output_tokens: number }; models?: string[] } = {},
) {
  const seen: { body: unknown; signal?: AbortSignal }[] = [];
  const client = {
    messages: {
      stream: (body: unknown, options?: { signal: AbortSignal }) => {
        seen.push({ body, signal: options?.signal });
        if (opts.failWith) throw opts.failWith;
        return {
          async *[Symbol.asyncIterator]() {
            for (const e of events) yield e;
          },
          finalMessage: () =>
            Promise.resolve({ usage: opts.usage ?? { input_tokens: 0, output_tokens: 0 } }),
        };
      },
      create: () => Promise.resolve({}),
    },
    models: { list: () => Promise.resolve({ data: (opts.models ?? []).map((id) => ({ id })) }) },
  } as unknown as AnthropicClientLike;
  return { client, seen };
}

const delta = (text: string): AnthropicTextEvent =>
  ({ type: 'content_block_delta', delta: { type: 'text_delta', text } });

async function collect(it: AsyncIterable<AiChunk>): Promise<AiChunk[]> {
  const out: AiChunk[] = [];
  for await (const c of it) out.push(c);
  return out;
}

describe('AnthropicProvider.generate', () => {
  it('streams text deltas in order', async () => {
    const { client } = fakeClient([delta('one '), delta('two')]);
    const p = new AnthropicProvider('sk-x', 'a-model', client);

    const out = await collect(p.generate(REQ, new AbortController().signal));

    expect(out.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text)).toEqual(['one ', 'two']);
  });

  it('ignores events that are not text deltas', async () => {
    const { client } = fakeClient([
      { type: 'message_start' },
      { type: 'content_block_delta', delta: { type: 'input_json_delta' } },
      delta('real'),
    ]);
    const p = new AnthropicProvider('sk-x', 'a-model', client);

    const out = await collect(p.generate(REQ, new AbortController().signal));

    expect(out.filter((c) => c.type === 'text')).toHaveLength(1);
  });

  it('reports the usage from the final message', async () => {
    const { client } = fakeClient([delta('x')], { usage: { input_tokens: 99, output_tokens: 7 } });
    const p = new AnthropicProvider('sk-x', 'a-model', client);

    const out = await collect(p.generate(REQ, new AbortController().signal));
    const done = out.find((c) => c.type === 'done') as { usage: { inputTokens: number; outputTokens: number } };

    expect(done.usage).toEqual({ inputTokens: 99, outputTokens: 7 });
  });

  it('turns a failure into a typed error chunk', async () => {
    const err = new Error('slow down');
    Object.defineProperty(err, 'name', { value: 'RateLimitError' });
    const { client } = fakeClient([], { failWith: err });
    const p = new AnthropicProvider('sk-x', 'a-model', client);

    const out = await collect(p.generate(REQ, new AbortController().signal));

    expect(out).toEqual([{ type: 'error', kind: 'rate_limit', message: 'slow down' }]);
  });

  it('stays silent when the failure is an abort the user asked for', async () => {
    const abort = new AbortController();
    abort.abort();
    const { client } = fakeClient([], { failWith: new Error('aborted') });
    const p = new AnthropicProvider('sk-x', 'a-model', client);

    expect(await collect(p.generate(REQ, abort.signal))).toEqual([]);
  });

  it('sends the system prompt as its own field, unlike OpenAI', async () => {
    const { client, seen } = fakeClient([delta('x')]);
    const p = new AnthropicProvider('sk-x', 'a-model', client);

    await collect(p.generate(REQ, new AbortController().signal));

    expect(seen[0].body).toMatchObject({ system: 'You summarize.', max_tokens: 64, model: 'a-model' });
  });
});

describe('AnthropicProvider.listModels', () => {
  it('maps the ids out of the page', async () => {
    const { client } = fakeClient([], { models: ['claude-a', 'claude-b'] });
    const p = new AnthropicProvider('sk-x', 'a-model', client);

    expect(await p.listModels()).toEqual(['claude-a', 'claude-b']);
  });
});
