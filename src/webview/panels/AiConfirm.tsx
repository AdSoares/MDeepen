import { useEffect, useRef, useState } from 'preact/hooks';
import type { AiState } from '../store';
import { formatCost } from '../../extension/ai/costEstimate';

interface Props {
  confirm: NonNullable<AiState['confirm']>;
  onSend: (opts: { dontAskAgain: boolean; masked: boolean }) => void;
  onCancel: () => void;
}

const FOCUSABLE = 'button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])';

export function AiConfirm({ confirm, onSend, onCancel }: Props) {
  const hasSecrets = confirm.secrets.count > 0;
  const isDocument = confirm.summary.scope === 'document';
  const isChat = confirm.summary.scope === 'chat';
  // Default to masking whenever something looks like a secret: the safe choice is the pre-selected one.
  const [masked, setMasked] = useState(hasSecrets);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== 'Tab' || !cardRef.current) return;
      // Keep focus inside the dialog: nothing behind it is reachable while it is open.
      const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !cardRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div class="md-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div class="md-modal-card" ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="ai-confirm-title">
        <h2 id="ai-confirm-title" class="md-modal-title">Send content to Anthropic?</h2>
        <p class="md-modal-lede">
          {isChat
            ? 'Answering a question sends the sections MDeepen picks as relevant, and it will do this for every question from now on.'
            : isDocument
              ? 'The whole document leaves your machine, one part at a time, and is sent to the Anthropic API.'
              : 'This section leaves your machine and is sent to the Anthropic API.'}
        </p>

        <dl class="md-modal-facts">
          <dt>Content</dt>
          <dd>
            {isChat
              ? `${confirm.summary.fileName} · ${confirm.summary.sectionCount} selected sections`
              : isDocument
                ? `${confirm.summary.fileName} · ${confirm.summary.sectionCount} sections`
                : `${confirm.summary.fileName} › ${confirm.summary.sectionTitle}`}
          </dd>
          <dt>Model</dt>
          <dd>{confirm.summary.model}</dd>
          <dt>Estimated tokens</dt>
          <dd>~{confirm.summary.estTokens.toLocaleString()}{isDocument ? ' (input, projected)' : ''}</dd>
          <dt>Estimated cost</dt>
          <dd>{formatCost(confirm.summary.estCost)}</dd>
        </dl>

        {confirm.summary.truncated.length > 0 && (
          <p class="md-ai-truncated">Too large to send whole, will be truncated: {confirm.summary.truncated.join(', ')}</p>
        )}

        {hasSecrets && (
          <div class="md-secret-strip" role="alert">
            <span class="codicon codicon-warning" style={{ color: 'var(--md-warn)' }} aria-hidden="true" />
            <span style={{ flex: 1 }}>{confirm.secrets.label}</span>
            <label class="md-check">
              <input type="checkbox" checked={masked} onChange={(e) => setMasked((e.target as HTMLInputElement).checked)} />
              Mask
            </label>
          </div>
        )}

        {!isDocument && !isChat && (
          <label class="md-check" style={{ marginBottom: '14px' }}>
            <input type="checkbox" checked={dontAskAgain} onChange={(e) => setDontAskAgain((e.target as HTMLInputElement).checked)} />
            Don&rsquo;t ask again in this workspace
          </label>
        )}

        <div class="md-modal-foot">
          <button class="md-btn" ref={cancelRef} onClick={onCancel}>Cancel</button>
          <button class="md-btn primary" onClick={() => onSend({ dontAskAgain, masked })}>
            {masked ? 'Mask & send' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
