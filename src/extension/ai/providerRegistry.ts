import type { AiConfig, AiProvider } from './types';
import { PROVIDERS } from './types';
import { AnthropicProvider } from './AnthropicProvider';
import { OpenAiProvider } from './OpenAiProvider';

/**
 * What a keyless compatible endpoint is constructed with. Never an absent key: the SDK then reads
 * OPENAI_API_KEY from the environment and would send it to whatever host the URL names. Never an
 * empty one either: the SDK refuses it.
 */
export const KEYLESS_PLACEHOLDER = 'no-key';

export function createProvider(config: AiConfig, apiKey: string): AiProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(apiKey, config.model);
    case 'openai':
      return new OpenAiProvider(apiKey, config.model, config.baseUrl ?? PROVIDERS.openai.defaultBaseUrl);
    case 'compatible':
      if (!config.baseUrl) throw new Error('An OpenAI-compatible endpoint needs a base URL');
      return new OpenAiProvider(apiKey || KEYLESS_PLACEHOLDER, config.model, config.baseUrl, undefined, PROVIDERS.compatible.tokenField);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
