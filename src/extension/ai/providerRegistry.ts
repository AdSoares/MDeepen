import type { AiConfig, AiProvider } from './types';
import { AnthropicProvider } from './AnthropicProvider';

export function createProvider(config: AiConfig, apiKey: string): AiProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(apiKey, config.model);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
