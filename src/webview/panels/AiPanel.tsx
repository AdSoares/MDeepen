import { useState } from 'preact/hooks';
import type { AiActionKind } from '../../extension/ai/types';
import { DOCUMENT_ACTIONS, SECTION_ACTIONS } from '../../extension/ai/types';
import { actionLabel } from '../../extension/ai/prompts';
import type { AiState } from '../store';

interface Props {
  ai: AiState;
  activePageId: string | undefined;
  onConfigure: () => void;
  onCite: (pageIndex: number) => void;
  onAction: (action: AiActionKind, scope: 'section' | 'document') => void;
  onStop: () => void;
  onDelete: (index: number) => void;
  onClear: () => void;
}

const GATED = ['Summaries', 'Chat with the document', 'Generated diagrams'];

export function AiPanel({ ai, activePageId, onConfigure, onCite, onAction, onStop, onDelete, onClear }: Props) {
  const [more, setMore] = useState(false);

  if (!ai.configured) {
    return (
      <div style={{ padding: '16px' }}>
        <div class="md-ai-head" style={{ marginBottom: '10px' }}>
          <span class="codicon codicon-sparkle" style={{ color: 'var(--md-ai)' }} aria-hidden="true" />
          <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>AI features are off</h2>
        </div>
        <p style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '12px' }}>
          Reading, pagination and navigation all work without AI. Add an API key to enable:
        </p>
        <ul style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '12px', paddingLeft: '18px' }}>
          {GATED.map((g) => <li key={g}>{g}</li>)}
        </ul>
        <button class="md-btn primary" onClick={onConfigure}>Configure AI</button>
      </div>
    );
  }

  const busy = ai.streaming || !activePageId;

  return (
    <div class="md-ai-panel">
      <div class="md-ai-head">
        <span class="md-ai-badge">Anthropic &middot; {ai.model}</span>
        <span style={{ flex: 1 }} />
        {ai.messages.length > 0 && (
          <button class="md-btn" onClick={onClear} aria-label="Clear all answers">Clear all</button>
        )}
        <button class="md-btn" aria-label="AI configuration" onClick={onConfigure}>
          <span class="codicon codicon-gear" aria-hidden="true" />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
        <button class="md-btn primary" disabled={busy} onClick={() => onAction('summarize', 'section')}>Summarize section</button>
        <button class="md-btn" disabled={busy} aria-label="More actions" aria-expanded={more}
          onClick={() => setMore((v) => !v)}>&#8943;</button>
        {ai.streaming && <button class="md-btn" onClick={onStop}>Stop generating</button>}
        {more && (
          <div class="md-seltoolbar-menu" role="menu">
            <div class="md-menu-group">This section</div>
            {SECTION_ACTIONS.filter((a) => a !== 'summarize').map((action) => (
              <button key={action} class="md-btn" role="menuitem"
                onClick={() => { setMore(false); onAction(action, 'section'); }}>{actionLabel(action)}</button>
            ))}
            <div class="md-menu-group">Whole document</div>
            {DOCUMENT_ACTIONS.map((action) => (
              <button key={action} class="md-btn" role="menuitem"
                onClick={() => { setMore(false); onAction(action, 'document'); }}>{actionLabel(action)}</button>
            ))}
          </div>
        )}
      </div>

      {ai.error && <p class="md-ai-alert" role="alert">{ai.error.message}</p>}

      {ai.progress && (
        <div class="md-progress" role="status" aria-live="polite">
          <div class="md-progress-label">Reading part {ai.progress.done + 1} of {ai.progress.total}</div>
          <div class="md-progress-track">
            <div class="md-progress-fill" style={{ width: `${Math.round((ai.progress.done / Math.max(1, ai.progress.total)) * 100)}%` }} />
          </div>
        </div>
      )}

      {ai.streaming && (
        <div class="md-ai-stream" role="status" aria-live="polite" aria-busy="true">
          {ai.streamText}
          <span class="md-caret" aria-hidden="true" />
        </div>
      )}

      {ai.messages.map((m, i) => (
        <div class="md-ai-msg" key={i}>
          <div class="md-ai-msg-head">
            {actionLabel(m.action)}
            {m.pageIndex >= 0 && ` · §${String(m.pageIndex + 1).padStart(2, '0')} ${m.sectionTitle}`}
          </div>
          {m.excerpt && <blockquote class="md-ai-excerpt">{m.excerpt}</blockquote>}
          <div class="md-ai-msg-text">{m.text}</div>
          {m.truncated && m.truncated.length > 0 && (
            <p class="md-ai-truncated">Truncated to fit: {m.truncated.join(', ')}</p>
          )}
          <div class="md-ai-msg-foot">
            {m.pageIndex >= 0 && (
              <button class="md-btn" onClick={() => onCite(m.pageIndex)}
                aria-label={`Go to section ${m.pageIndex + 1}: ${m.sectionTitle}`}>
                &sect;{String(m.pageIndex + 1).padStart(2, '0')} {m.sectionTitle}
              </button>
            )}
            <button class="md-btn" aria-label="Copy this answer" onClick={() => navigator.clipboard.writeText(m.text)}>Copy</button>
            <button class="md-btn" aria-label="Delete this answer" onClick={() => onDelete(i)}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
