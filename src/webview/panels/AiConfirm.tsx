import { useEffect, useRef, useState } from 'preact/hooks';
import type { AiState } from '../store';
import { formatCost } from '../../extension/ai/costEstimate';

interface Props {
  confirm: NonNullable<AiState['confirm']>;
  onSend: (opts: { dontAskAgain: boolean; masked: boolean }) => void;
  onCancel: () => void;
}

const backdrop = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
} as const;

const card = {
  background: 'var(--vscode-editor-background)',
  border: '1px solid var(--vscode-panel-border)',
  borderRadius: '8px', padding: '18px', width: 'min(460px, 90vw)',
  boxShadow: '0 8px 32px rgba(0,0,0,.35)',
} as const;

const dt = { color: 'var(--vscode-descriptionForeground)', fontSize: '12px' } as const;
const dd = { fontSize: '12px', textAlign: 'right', margin: 0 } as const;

export function AiConfirm({ confirm, onSend, onCancel }: Props) {
  const hasSecrets = confirm.secrets.count > 0;
  // Default to masking whenever something looks like a secret: the safe choice is the pre-selected one.
  const [masked, setMasked] = useState(hasSecrets);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div style={backdrop} onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={card} role="dialog" aria-modal="true" aria-labelledby="ai-confirm-title">
        <h2 id="ai-confirm-title" style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600 }}>
          Send content to Anthropic?
        </h2>
        <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
          This section leaves your machine and is sent to the Anthropic API.
        </p>

        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', margin: '0 0 14px' }}>
          <dt style={dt}>Content</dt>
          <dd style={dd}>{confirm.summary.fileName} &rsaquo; {confirm.summary.sectionTitle}</dd>
          <dt style={dt}>Model</dt>
          <dd style={dd}>{confirm.summary.model}</dd>
          <dt style={dt}>Estimated tokens</dt>
          <dd style={dd}>~{confirm.summary.estTokens.toLocaleString()}</dd>
          <dt style={dt}>Estimated cost</dt>
          <dd style={dd}>{formatCost(confirm.summary.estCost)}</dd>
        </dl>

        {hasSecrets && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', marginBottom: '12px', borderRadius: '5px', border: '1px solid var(--md-warn)', fontSize: '12px' }}>
            <span class="codicon codicon-warning" style={{ color: 'var(--md-warn)' }} aria-hidden="true" />
            <span style={{ flex: 1 }}>{confirm.secrets.label}</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <input type="checkbox" checked={masked} onChange={(e) => setMasked((e.target as HTMLInputElement).checked)} />
              Mask
            </label>
          </div>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginBottom: '14px' }}>
          <input type="checkbox" checked={dontAskAgain} onChange={(e) => setDontAskAgain((e.target as HTMLInputElement).checked)} />
          Don&rsquo;t ask again in this workspace
        </label>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button class="md-btn" ref={cancelRef} onClick={onCancel}>Cancel</button>
          <button class="md-btn primary" onClick={() => onSend({ dontAskAgain, masked })}>
            {masked ? 'Mask & send' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
