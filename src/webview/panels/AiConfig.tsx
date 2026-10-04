import { useState } from 'preact/hooks';
import { post } from '../vscodeApi';
import type { AiState } from '../store';
import { DEFAULT_AI_CONFIG, PROVIDERS } from '../../extension/ai/types';
import type { ProviderId } from '../../extension/ai/types';
import { canRefreshModels, destinationLine, keyStoredFor, providerButtonTitle } from './aiConfigRules';
import { destinationKey } from '../../shared/destination';

interface Props {
  ai: AiState;
  onClose: () => void;
}

export function AiConfig({ ai, onClose }: Props) {
  const [provider, setProvider] = useState<ProviderId>((ai.provider as ProviderId) || DEFAULT_AI_CONFIG.provider);
  // A compatible endpoint saved before a model was chosen has an empty model, and must keep it:
  // falling back to the default would offer an Anthropic id to Ollama.
  const [model, setModel] = useState(ai.provider === 'compatible' ? ai.model : (ai.model || DEFAULT_AI_CONFIG.model));
  const [baseUrl, setBaseUrl] = useState(ai.baseUrl ?? PROVIDERS.compatible.defaultBaseUrl ?? '');
  const [custom, setCustom] = useState('');
  const [maxTokens, setMaxTokens] = useState(DEFAULT_AI_CONFIG.maxTokens);
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [armed, setArmed] = useState(false);

  const isCompatible = provider === 'compatible';
  const dest = destinationLine(baseUrl);
  const hasKey = keyStoredFor(provider, baseUrl, ai.configuredProviders, ai.keyedOrigins);
  const refreshable = canRefreshModels(provider, baseUrl, { provider: ai.provider, baseUrl: ai.baseUrl, configuredProviders: ai.configuredProviders });
  // A URL the destination rule cannot read is never saved: the host would refuse it anyway.
  const savable = !isCompatible || dest.ok;

  // Saving must not close the card: `configured` only flips once the host round-trips
  // aiConfigState, and Test connection is gated on it. Closing here made "save then test"
  // impossible without reopening the card.
  // The config goes first: the host stores a key against the origin of the config active when
  // the key arrives, so the other order would file a new endpoint's key under the old one.
  const save = () => {
    if (!savable) return;
    post({ type: 'aiSaveConfig', config: { provider, model, maxTokens, ...(isCompatible ? { baseUrl: baseUrl.trim() } : {}) } });
    if (key.trim()) post({ type: 'aiSaveKey', key: key.trim() });
    setKey('');
    setSaved(true);
  };

  const test = () => {
    setSaved(false);
    setArmed(false);
    post({ type: 'aiTestConnection' });
  };

  // Two-step, because removing the key means pasting it again from wherever it lives.
  const disconnect = () => {
    if (!armed) { setArmed(true); return; }
    setArmed(false);
    setSaved(false);
    setKey('');
    post({ type: 'aiClearKey' });
  };

  return (
    <div class="md-config">
      <h2>AI configuration</h2>

      <div class="md-config-row">
        <span class="md-config-label">Provider</span>
        {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => (
          <button key={id} class={`md-btn${id === provider ? ' primary' : ''}`} aria-pressed={id === provider}
            title={providerButtonTitle(id, ai)}
            onClick={() => {
              if (id === provider) return;
              // A model from the other provider would be offered and then rejected on send.
              setProvider(id);
              setModel(PROVIDERS[id].defaultModel);
              // A key typed for one destination must not be saved under another.
              setKey('');
              setSaved(false);
            }}>
            {PROVIDERS[id].label}{ai.configuredProviders.includes(id) ? ' ·' : ''}
          </button>
        ))}
      </div>

      {isCompatible && (
        <>
          <div class="md-config-row">
            <label class="md-config-label" for="ai-base-url">Base URL</label>
            <input id="ai-base-url" type="text" spellcheck={false} value={baseUrl} style={{ flex: 1, minWidth: 0 }}
              aria-describedby="ai-base-url-dest ai-base-url-hint"
              onInput={(e) => {
                const next = (e.target as HTMLInputElement).value;
                // A key typed for one origin must not be saved under another.
                if (destinationKey('compatible', next) !== destinationKey('compatible', baseUrl)) setKey('');
                setSaved(false);
                setBaseUrl(next);
              }} />
          </div>
          <p id="ai-base-url-dest" class="md-config-result" data-ok={String(dest.ok)} role="status">{dest.text}</p>
          <p id="ai-base-url-hint" class="md-config-hint">
            Ollama: http://localhost:11434/v1 · LM Studio: http://localhost:1234/v1
          </p>
        </>
      )}

      <div class="md-config-row">
        <label class="md-config-label" for="ai-model">Model</label>
        <select id="ai-model" value={model} onChange={(e) => { setSaved(false); setModel((e.target as HTMLSelectElement).value); }}>
          {/* The chosen model is always an option: a compatible endpoint has no curated list, so on
              reopening the card the saved id would otherwise be missing until a refresh. */}
          {[...new Set([model, ...PROVIDERS[provider].models, ...ai.fetchedModels].filter(Boolean))].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <button class="md-btn" disabled={!refreshable}
          title={refreshable ? 'Ask the endpoint which models it offers' : isCompatible ? 'Save this URL first' : 'Add a key for this provider first'}
          onClick={() => post({ type: 'aiListModels' })}>Refresh models</button>
      </div>

      {ai.modelListError && <p class="md-config-result" data-ok="false" role="status">{ai.modelListError}</p>}

      <div class="md-config-row">
        <label class="md-config-label" for="ai-custom-model">Or type an id</label>
        <input id="ai-custom-model" type="text" spellcheck={false} placeholder="model id"
          value={custom} style={{ width: '220px' }}
          onInput={(e) => setCustom((e.target as HTMLInputElement).value)}
          onBlur={() => { const v = custom.trim(); if (v) { setModel(v); setSaved(false); } }} />
      </div>

      <div class="md-config-row">
        <label class="md-config-label" for="ai-maxtokens">Max tokens</label>
        <input id="ai-maxtokens" type="number" min={256} max={64000} step={256} value={maxTokens} style={{ width: '96px' }}
          onInput={(e) => { setSaved(false); setMaxTokens(Number((e.target as HTMLInputElement).value)); }} />
      </div>

      <div class="md-config-row">
        <label class="md-config-label" for="ai-key">{isCompatible ? 'API key (optional)' : 'API key'}</label>
        <input id="ai-key" type="password" autocomplete="off" spellcheck={false}
          aria-describedby="ai-key-hint"
          placeholder={hasKey ? (isCompatible ? 'Saved for this URL - type to replace' : 'Saved for this provider - type to replace') : isCompatible ? 'Leave empty for Ollama or LM Studio' : 'Paste a key'}
          value={key} style={{ flex: 1, minWidth: 0 }}
          onInput={(e) => { setSaved(false); setKey((e.target as HTMLInputElement).value); }} />
      </div>
      <p id="ai-key-hint" class="md-config-hint">
        Stored in the VS Code secret store, never in settings or in your files.
      </p>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button class="md-btn primary" onClick={save} disabled={!savable}>Save</button>
        <button class="md-btn accent" onClick={test} disabled={!ai.configured}>Test connection</button>
        <button class="md-btn" onClick={onClose}>Close</button>
        <span style={{ flex: 1 }} />
        {ai.configuredProviders.length > 0 && (
          <button class={`md-btn danger${armed ? ' armed' : ''}`} onClick={disconnect}
            onBlur={() => setArmed(false)}
            aria-label={armed ? 'Confirm disconnecting the AI provider' : 'Disconnect the AI provider'}>
            {armed ? 'Confirm disconnect' : 'Disconnect'}
          </button>
        )}
      </div>

      {armed && (
        <p class="md-config-result" data-ok="false" role="status">
          This deletes every stored key, for every provider and endpoint, and asks for confirmation again before the next send.
        </p>
      )}

      {saved && !ai.connection && (
        <p class="md-config-result" data-ok="true" role="status">
          Saved. {ai.configured ? 'You can test the connection now.' : isCompatible ? 'Choose a model to turn AI on — Refresh models lists them.' : 'No API key stored yet.'}
        </p>
      )}

      {ai.connection && (
        <p class="md-config-result" data-ok={String(ai.connection.ok)} role="status">
          {ai.connection.ok ? `Connected in ${ai.connection.ms} ms` : `Failed: ${ai.connection.error ?? 'unknown error'}`}
        </p>
      )}
    </div>
  );
}
