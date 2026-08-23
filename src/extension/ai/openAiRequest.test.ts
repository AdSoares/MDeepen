import { describe, it, expect } from 'vitest';
import { toOpenAiRequest } from './openAiRequest';
import type { AiRequest } from './types';

const REQ: AiRequest = {
  system: 'You summarize.',
  messages: [
    { role: 'user', content: 'first' },
    { role: 'assistant', content: 'second' },
    { role: 'user', content: 'third' },
  ],
  maxTokens: 1024,
};

describe('toOpenAiRequest', () => {
  it('turns the system field into the first message', () => {
    const out = toOpenAiRequest(REQ, 'some-model');
    expect(out.messages[0]).toEqual({ role: 'system', content: 'You summarize.' });
  });

  it('keeps the remaining messages in order', () => {
    const out = toOpenAiRequest(REQ, 'some-model');
    expect(out.messages.slice(1)).toEqual(REQ.messages);
  });

  it('carries the model and the token cap', () => {
    const out = toOpenAiRequest(REQ, 'some-model');
    expect(out.model).toBe('some-model');
    // Confirmed empirically against this account on 2026-08-23: max_tokens returns 400.
    expect(out.max_completion_tokens).toBe(1024);
  });

  it('asks for usage, without which the token counts come back as zero', () => {
    const out = toOpenAiRequest(REQ, 'some-model');
    expect(out.stream).toBe(true);
    expect(out.stream_options).toEqual({ include_usage: true });
  });
});
