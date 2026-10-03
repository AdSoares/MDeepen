import type { AiRequest } from './types';

export type TokenField = 'max_tokens' | 'max_completion_tokens';

export interface OpenAiChatRequest {
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  max_tokens?: number;
  max_completion_tokens?: number;
  stream: true;
  stream_options: { include_usage: true };
}

/**
 * Translates the shared request shape into OpenAI's. Two differences from Anthropic: the system
 * prompt is a message rather than a field, and usage only arrives when the request asks for it —
 * without `include_usage` the token counts come back as zero and the cost estimate quietly lies.
 *
 * The token cap goes in exactly one field. OpenAI's own models need `max_completion_tokens`
 * (confirmed against the account on 2026-08-23, where `max_tokens` returns 400); Ollama and most
 * compatible runtimes know only `max_tokens`.
 */
export function toOpenAiRequest(request: AiRequest, model: string, tokenField: TokenField = 'max_completion_tokens'): OpenAiChatRequest {
  const cap = tokenField === 'max_tokens' ? { max_tokens: request.maxTokens } : { max_completion_tokens: request.maxTokens };
  return {
    model,
    messages: [{ role: 'system', content: request.system }, ...request.messages],
    ...cap,
    stream: true,
    stream_options: { include_usage: true },
  };
}
