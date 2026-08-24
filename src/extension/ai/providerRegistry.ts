import type { AiConfig, AiProvider } from './types';
import { PROVIDERS } from './types';
import { AnthropicProvider } from './AnthropicProvider';
import { OpenAiProvider } from './OpenAiProvider';

export function createProvider(config: AiConfig, apiKey: string): AiProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(apiKey, config.model);
    case 'openai':
      return new OpenAiProvider(apiKey, config.model, config.baseUrl ?? PROVIDERS.openai.defaultBaseUrl);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
