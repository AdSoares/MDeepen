import type { AiConfig, ProviderId } from './types';
import { DEFAULT_AI_CONFIG, PROVIDERS } from './types';
import { describeDestination } from '../../shared/destination';

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
const KEYED_ORIGINS = 'mdeepen.compatible.keyedOrigins';

export class AiConfigStore {
  constructor(private readonly secrets: SecretsLike, private readonly memento: MementoLike) {}

  getConfig(): AiConfig {
    return this.memento.get<AiConfig>(CONFIG_KEY, DEFAULT_AI_CONFIG);
  }
  setConfig(config: AiConfig): Thenable<void> {
    return this.memento.update(CONFIG_KEY, config);
  }

  /** The secret name for a config's destination. Each fixed provider owns one; a compatible
   *  endpoint owns one per origin, so a key pasted for one host never goes to another. Undefined
   *  when the config names no destination this extension can classify. */
  private secretName(config: AiConfig = this.getConfig()): string | undefined {
    const meta = PROVIDERS[config.provider] ?? PROVIDERS.anthropic;
    if (config.provider !== 'compatible') return meta.secretKey;
    const d = describeDestination(config.baseUrl ?? '');
    return d.ok ? `${meta.secretKey}:${d.origin}` : undefined;
  }

  async getKey(config: AiConfig = this.getConfig()): Promise<string | undefined> {
    const name = this.secretName(config);
    return name ? this.secrets.get(name) : undefined;
  }

  async setKey(key: string): Promise<void> {
    const config = this.getConfig();
    const name = this.secretName(config);
    if (!name) return;
    await this.secrets.store(name, key);
    if (config.provider !== 'compatible') return;
    // SecretStorage cannot list its keys, so Disconnect needs this to find them again.
    const d = describeDestination(config.baseUrl ?? '');
    const origins = this.keyedOrigins();
    if (d.ok && !origins.includes(d.origin)) await this.memento.update(KEYED_ORIGINS, [...origins, d.origin]);
  }

  keyedOrigins(): string[] {
    return this.memento.get<string[]>(KEYED_ORIGINS, []);
  }

  /** What to send with: the stored key, '' for a provider that works without one, undefined when
   *  a required key is missing or the endpoint cannot be classified.
   *
   *  A send passes the config it was built from. The stored config is shared by every panel and
   *  window, so reading it here could pair one destination with another provider's key. */
  async getCredential(config: AiConfig = this.getConfig()): Promise<string | undefined> {
    if (config.provider === 'compatible' && !describeDestination(config.baseUrl ?? '').ok) return undefined;
    const key = await this.getKey(config);
    if (typeof key === 'string' && key.length > 0) return key;
    return (PROVIDERS[config.provider] ?? PROVIDERS.anthropic).requiresKey ? undefined : '';
  }

  /** Disconnect is all-or-nothing: afterwards no stored key reaches anywhere. */
  async clearAllKeys(): Promise<void> {
    for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
      if (id !== 'compatible') await this.secrets.delete(PROVIDERS[id].secretKey);
    }
    for (const origin of this.keyedOrigins()) {
      await this.secrets.delete(`${PROVIDERS.compatible.secretKey}:${origin}`);
    }
    await this.memento.update(KEYED_ORIGINS, []);
  }

  /** A fixed provider is configured when it holds a key. A compatible endpoint needs none, so it
   *  is configured when its URL is valid and a model is chosen. */
  async isConfigured(): Promise<boolean> {
    const config = this.getConfig();
    if (config.provider === 'compatible') {
      return describeDestination(config.baseUrl ?? '').ok && config.model.trim().length > 0;
    }
    const k = await this.getKey();
    return typeof k === 'string' && k.length > 0;
  }

  async configuredProviders(): Promise<ProviderId[]> {
    const found: ProviderId[] = [];
    for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
      if (id === 'compatible') {
        const active = this.getConfig().provider === 'compatible' && (await this.isConfigured());
        if (active || this.keyedOrigins().length > 0) found.push(id);
        continue;
      }
      const k = await this.secrets.get(PROVIDERS[id].secretKey);
      if (typeof k === 'string' && k.length > 0) found.push(id);
    }
    return found;
  }
}
