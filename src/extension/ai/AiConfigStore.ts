import type { AiConfig, ProviderId } from './types';
import { DEFAULT_AI_CONFIG, PROVIDERS } from './types';

export interface SecretsLike {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
}
export interface MementoLike {
  get<T>(key: string, defaultValue?: T): T;
  update(key: string, value: unknown): Thenable<void>;
}

const CONFIG_KEY = 'mdeepen.aiConfig';

export class AiConfigStore {
  constructor(private readonly secrets: SecretsLike, private readonly memento: MementoLike) {}

  getConfig(): AiConfig {
    return this.memento.get<AiConfig>(CONFIG_KEY, DEFAULT_AI_CONFIG);
  }
  setConfig(config: AiConfig): Thenable<void> {
    return this.memento.update(CONFIG_KEY, config);
  }

  /** The secret name of the active provider. Each provider owns its own, so switching never
   *  deletes the other's key and coming back is free. */
  private secretKey(provider: ProviderId = this.getConfig().provider): string {
    return (PROVIDERS[provider] ?? PROVIDERS.anthropic).secretKey;
  }

  getKey(): Thenable<string | undefined> {
    return this.secrets.get(this.secretKey());
  }
  setKey(key: string): Thenable<void> {
    return this.secrets.store(this.secretKey(), key);
  }
  /** Disconnect is all-or-nothing: afterwards the extension cannot send anywhere. */
  async clearAllKeys(): Promise<void> {
    for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
      await this.secrets.delete(this.secretKey(id));
    }
  }
  async isConfigured(): Promise<boolean> {
    const k = await this.getKey();
    return typeof k === 'string' && k.length > 0;
  }
  async configuredProviders(): Promise<ProviderId[]> {
    const found: ProviderId[] = [];
    for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
      const k = await this.secrets.get(this.secretKey(id));
      if (typeof k === 'string' && k.length > 0) found.push(id);
    }
    return found;
  }
}
