import type { AiConfig } from './types';
import { DEFAULT_AI_CONFIG } from './types';

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
const SECRET_KEY = 'mdeepen.anthropic.apiKey';

export class AiConfigStore {
  constructor(private readonly secrets: SecretsLike, private readonly memento: MementoLike) {}

  getConfig(): AiConfig {
    return this.memento.get<AiConfig>(CONFIG_KEY, DEFAULT_AI_CONFIG);
  }
  setConfig(config: AiConfig): Thenable<void> {
    return this.memento.update(CONFIG_KEY, config);
  }
  getKey(): Thenable<string | undefined> {
    return this.secrets.get(SECRET_KEY);
  }
  setKey(key: string): Thenable<void> {
    return this.secrets.store(SECRET_KEY, key);
  }
  async isConfigured(): Promise<boolean> {
    const k = await this.secrets.get(SECRET_KEY);
    return typeof k === 'string' && k.length > 0;
  }
}
