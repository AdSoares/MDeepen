import type { AiRequest } from './types';

export interface OpenAiChatRequest {
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  max_completion_tokens: number;
  stream: true;
  stream_options: { include_usage: true };
}

/**
 * Translates the shared request shape into OpenAI's. Two differences from Anthropic: the system
 * prompt is a message rather than a field, and usage only arrives when the request asks for it —
 * without `include_usage` the token counts come back as zero and the cost estimate quietly lies.
 *
 * `max_completion_tokens` rather than `max_tokens`: confirmed against the account's own models on
 * 2026-08-23, where `max_tokens` returns 400.
 */
export function toOpenAiRequest(request: AiRequest, model: string): OpenAiChatRequest {
  return {
    model,
    messages: [{ role: 'system', content: request.system }, ...request.messages],
    max_completion_tokens: request.maxTokens,
    stream: true,
    stream_options: { include_usage: true },
  };
}
