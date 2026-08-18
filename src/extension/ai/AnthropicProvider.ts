import Anthropic from '@anthropic-ai/sdk';
import type { AiChunk, AiProvider, AiRequest, ConnectionResult } from './types';
import { classifyError } from './errorMap';

export class AnthropicProvider implements AiProvider {
  private readonly client: Anthropic;

  constructor(apiKey: string, private readonly model: string) {
    this.client = new Anthropic({ apiKey });
  }

  async *generate(request: AiRequest, signal: AbortSignal): AsyncIterable<AiChunk> {
    try {
      const stream = this.client.messages.stream(
        {
          model: this.model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: request.messages,
        },
        { signal },
      );
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      yield {
        type: 'done',
        usage: { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens },
      };
    } catch (err) {
      if (signal.aborted) return; // Stop requested — partial already streamed.
      yield { type: 'error', kind: classifyError(err), message: err instanceof Error ? err.message : 'AI request failed' };
    }
  }

  async testConnection(): Promise<ConnectionResult> {
    const start = Date.now();
    try {
      await this.client.messages.create({
        model: this.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return { ok: true, ms: Date.now() - start };
    } catch (err) {
      return { ok: false, ms: Date.now() - start, error: err instanceof Error ? err.message : 'Connection failed' };
    }
  }
}
