import type { OpenAiChatRequest } from './openAiRequest';

/**
 * The parts of each SDK this extension actually uses, and nothing more.
 *
 * These types exist so the providers can be tested against a fake without the network. They are a
 * deliberate narrowing, not a wrapper: the shapes below mirror the SDKs rather than hiding them,
 * so a mismatch shows up here as a compile error rather than at runtime.
 *
 * What they do NOT do is verify the SDKs. A fake shaped like this proves our code handles what we
 * believe the SDK sends; only a real request proves the belief.
 */

export interface OpenAiStreamChunk {
  choices?: { delta?: { content?: string | null } }[];
  usage?: { prompt_tokens: number; completion_tokens: number } | null;
}

export interface OpenAiPingRequest {
  model: string;
  messages: { role: 'user'; content: string }[];
  max_tokens?: number;
  max_completion_tokens?: number;
}

export interface OpenAiClientLike {
  chat: {
    completions: {
      create(body: OpenAiChatRequest, options: { signal: AbortSignal }): Promise<AsyncIterable<OpenAiStreamChunk>>;
      create(body: OpenAiPingRequest): Promise<unknown>;
    };
  };
  models: { list(): Promise<{ data: { id: string }[] }> };
}

export interface AnthropicTextEvent {
  type: string;
  delta?: { type: string; text?: string };
}

export interface AnthropicStreamLike extends AsyncIterable<AnthropicTextEvent> {
  finalMessage(): Promise<{ usage: { input_tokens: number; output_tokens: number } }>;
}

export interface AnthropicMessageRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

export interface AnthropicClientLike {
  messages: {
    stream(body: AnthropicMessageRequest, options: { signal: AbortSignal }): AnthropicStreamLike;
    create(body: AnthropicMessageRequest): Promise<unknown>;
  };
  models: { list(): Promise<{ data: { id: string }[] }> };
}
