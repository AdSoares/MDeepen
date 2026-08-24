import OpenAI from 'openai';
import type { AiChunk, AiProvider, AiRequest, ConnectionResult } from './types';
import { classifyError } from './errorMap';
import { toOpenAiRequest } from './openAiRequest';

export class OpenAiProvider implements AiProvider {
  private readonly client: OpenAI;

  constructor(apiKey: string, private readonly model: string, baseURL?: string) {
    // baseURL is what makes an OpenAI-compatible local runtime reachable later without a new
    // provider. Undefined means the SDK's own default.
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }

  async *generate(request: AiRequest, signal: AbortSignal): AsyncIterable<AiChunk> {
    try {
      const stream = await this.client.chat.completions.create(toOpenAiRequest(request, this.model), { signal });
      let inputTokens = 0;
      let outputTokens = 0;
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) yield { type: 'text', text };
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
        }
      }
      yield { type: 'done', usage: { inputTokens, outputTokens } };
    } catch (err) {
      if (signal.aborted) return; // Stop requested — partial already streamed.
      yield { type: 'error', kind: classifyError(err), message: err instanceof Error ? err.message : 'AI request failed' };
    }
  }

  async listModels(): Promise<string[]> {
    const page = await this.client.models.list();
    return page.data.map((m) => m.id);
  }

  async testConnection(): Promise<ConnectionResult> {
    const start = Date.now();
    try {
      await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_completion_tokens: 1,
      });
      return { ok: true, ms: Date.now() - start };
    } catch (err) {
      return { ok: false, ms: Date.now() - start, error: err instanceof Error ? err.message : 'Connection failed' };
    }
  }
}
