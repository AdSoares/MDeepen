import { useState } from 'preact/hooks';
import { post } from '../vscodeApi';
import type { AiState } from '../store';
import { AI_MODELS, DEFAULT_AI_CONFIG } from '../../extension/ai/types';

interface Props {
  ai: AiState;
  onClose: () => void;
}

const row = { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' } as const;
const labelStyle = { fontSize: '12px', width: '92px', color: 'var(--vscode-descriptionForeground)' } as const;

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
    <div style={{ padding: '14px', borderBottom: '1px solid var(--vscode-panel-border)' }}>
      <h2 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 600 }}>AI configuration</h2>

      <div style={row}>
        <span style={labelStyle}>Mode</span>
        <button class="md-btn primary" aria-pressed="true" disabled>Remote</button>
        <button class="md-btn" disabled title="Local models are not part of this build">Local</button>
      </div>

      <div style={row}>
        <label style={labelStyle} for="ai-model">Model</label>
        <select id="ai-model" value={model} onChange={(e) => setModel((e.target as HTMLSelectElement).value)}>
          {AI_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div style={row}>
        <label style={labelStyle} for="ai-maxtokens">Max tokens</label>
        <input id="ai-maxtokens" type="number" min={256} max={64000} step={256} value={maxTokens} style={{ width: '96px' }}
          onInput={(e) => setMaxTokens(Number((e.target as HTMLInputElement).value))} />
      </div>

      <div style={row}>
        <label style={labelStyle} for="ai-key">API key</label>
        <input id="ai-key" type="password" autocomplete="off" spellcheck={false}
          placeholder={ai.configured ? 'Saved - type to replace' : 'sk-ant-...'}
          value={key} style={{ flex: 1, minWidth: 0 }}
          onInput={(e) => setKey((e.target as HTMLInputElement).value)} />
      </div>
      <p style={{ margin: '0 0 12px 100px', fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
        Stored in the VS Code secret store, never in settings or in your files.
      </p>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button class="md-btn primary" onClick={save}>Save</button>
        <button class="md-btn" onClick={() => post({ type: 'aiTestConnection' })} disabled={!ai.configured}>Test connection</button>
        <button class="md-btn" onClick={onClose}>Close</button>
      </div>

      {ai.connection && (
        <p role="status" style={{ marginTop: '10px', fontSize: '12px', color: ai.connection.ok ? 'var(--md-success)' : 'var(--md-warn)' }}>
          {ai.connection.ok ? `Connected in ${ai.connection.ms} ms` : `Failed: ${ai.connection.error ?? 'unknown error'}`}
        </p>
      )}
    </div>
  );
}
