export type AiErrorKind = 'auth' | 'rate_limit' | 'connection' | 'unknown';

export interface AiRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
}

export type AiChunk =
  | { type: 'text'; text: string }
  | { type: 'done'; usage: { inputTokens: number; outputTokens: number } }
  | { type: 'error'; kind: AiErrorKind; message: string };

export interface ConnectionResult {
  ok: boolean;
  ms: number;
  error?: string;
}

export interface AiProvider {
  generate(request: AiRequest, signal: AbortSignal): AsyncIterable<AiChunk>;
  testConnection(): Promise<ConnectionResult>;
}

export interface AiConfig {
  provider: 'anthropic';
  model: string;
  maxTokens: number;
}

export const DEFAULT_AI_CONFIG: AiConfig = { provider: 'anthropic', model: 'claude-opus-4-8', maxTokens: 4096 };
export const AI_MODELS = ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5'] as const;

export type AiActionKind = 'summarize' | 'explain' | 'explainSimply' | 'keyTerms' | 'example';
export type AiScope = 'section' | 'selection';

export const AI_ACTIONS: readonly AiActionKind[] = ['summarize', 'explain', 'explainSimply', 'keyTerms', 'example'];
