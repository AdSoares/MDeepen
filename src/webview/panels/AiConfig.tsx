import { useState } from 'preact/hooks';
import { post } from '../vscodeApi';
import type { AiState } from '../store';
import { AI_MODELS, DEFAULT_AI_CONFIG } from '../../extension/ai/types';

interface Props {
  ai: AiState;
  onClose: () => void;
}

export function AiConfig({ ai, onClose }: Props) {
  const [model, setModel] = useState(ai.model || DEFAULT_AI_CONFIG.model);
  const [maxTokens, setMaxTokens] = useState(DEFAULT_AI_CONFIG.maxTokens);
  const [key, setKey] = useState('');

  const save = () => {
    if (key.trim()) post({ type: 'aiSaveKey', key: key.trim() });
    post({ type: 'aiSaveConfig', config: { provider: 'anthropic', model, maxTokens } });
    setKey('');
    onClose();
  };

  return (
    <div class="md-config">
      <h2>AI configuration</h2>

      <div class="md-config-row">
        <span class="md-config-label">Mode</span>
        <button class="md-btn primary" aria-pressed="true" disabled>Remote</button>
        <button class="md-btn" disabled title="Local models are not part of this build">Local</button>
      </div>

      <div class="md-config-row">
        <label class="md-config-label" for="ai-model">Model</label>
        <select id="ai-model" value={model} onChange={(e) => setModel((e.target as HTMLSelectElement).value)}>
          {AI_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div class="md-config-row">
        <label class="md-config-label" for="ai-maxtokens">Max tokens</label>
        <input id="ai-maxtokens" type="number" min={256} max={64000} step={256} value={maxTokens} style={{ width: '96px' }}
          onInput={(e) => setMaxTokens(Number((e.target as HTMLInputElement).value))} />
      </div>

      <div class="md-config-row">
        <label class="md-config-label" for="ai-key">API key</label>
        <input id="ai-key" type="password" autocomplete="off" spellcheck={false}
          aria-describedby="ai-key-hint"
          placeholder={ai.configured ? 'Saved - type to replace' : 'sk-ant-...'}
          value={key} style={{ flex: 1, minWidth: 0 }}
          onInput={(e) => setKey((e.target as HTMLInputElement).value)} />
      </div>
      <p id="ai-key-hint" class="md-config-hint">
        Stored in the VS Code secret store, never in settings or in your files.
      </p>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button class="md-btn primary" onClick={save}>Save</button>
        <button class="md-btn" onClick={() => post({ type: 'aiTestConnection' })} disabled={!ai.configured}>Test connection</button>
        <button class="md-btn" onClick={onClose}>Close</button>
      </div>

      {ai.connection && (
        <p class="md-config-result" data-ok={String(ai.connection.ok)} role="status">
          {ai.connection.ok ? `Connected in ${ai.connection.ms} ms` : `Failed: ${ai.connection.error ?? 'unknown error'}`}
        </p>
      )}
    </div>
  );
}
