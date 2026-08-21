import { useState } from 'preact/hooks';
import type { AiActionKind } from '../../extension/ai/types';
import { DIAGRAM_ACTION_BY_KIND, DIAGRAM_ACTIONS, DOCUMENT_ACTIONS, SECTION_ACTIONS } from '../../extension/ai/types';
import { DiagramView } from './DiagramView';
import { actionLabel } from '../../extension/ai/prompts';
import type { AiState } from '../store';

interface Props {
  ai: AiState;
  activePageId: string | undefined;
  onConfigure: () => void;
  onCite: (pageIndex: number) => void;
  onAction: (action: AiActionKind, scope: 'section' | 'document') => void;
  onAsk: (question: string) => void;
  onDiagramType: (action: AiActionKind) => void;
  onDiagramCancel: () => void;
  onEditDiagram: (index: number, source: string) => void;
  onInsertDiagram: (index: number) => void;
  onStop: () => void;
  onDelete: (index: number) => void;
  onClear: () => void;
}

const GATED = ['Summaries', 'Chat with the document', 'Generated diagrams'];

export function AiPanel({ ai, activePageId, onConfigure, onCite, onAction, onAsk, onDiagramType, onDiagramCancel, onEditDiagram, onInsertDiagram, onStop, onDelete, onClear }: Props) {
  const [more, setMore] = useState(false);
  const [question, setQuestion] = useState('');

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

      {ai.draft && (
        <div class="md-diagram-picker">
          <div class="md-menu-group">Diagram from the selection</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {DIAGRAM_ACTIONS.map((action) => (
              <button key={action} class="md-btn" onClick={() => onDiagramType(action)}>{actionLabel(action)}</button>
            ))}
            <button class="md-btn" onClick={onDiagramCancel}>Cancel</button>
          </div>
        </div>
      )}

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
          {m.kind === 'diagram' ? (
            <>
              <div class="md-ai-msg-head">
                {actionLabel(DIAGRAM_ACTION_BY_KIND[m.diagramType])}
                {` · §${String(m.pageIndex + 1).padStart(2, '0')} ${m.sectionTitle}`}
              </div>
              <DiagramView source={m.text} />
              <textarea
                class="md-diagram-source"
                value={m.text}
                rows={6}
                aria-label="Diagram source"
                onInput={(e) => onEditDiagram(i, (e.target as HTMLTextAreaElement).value)}
              />
              {m.inserted && (
                <p class="md-ai-truncated">
                  {'line' in m.inserted ? `Inserted at line ${m.inserted.line}` : m.inserted.error}
                </p>
              )}
              <div class="md-ai-msg-foot">
                <button class="md-btn primary" onClick={() => onInsertDiagram(i)}>
                  Insert at the end of &sect;{String(m.pageIndex + 1).padStart(2, '0')} {m.sectionTitle}
                </button>
                <button class="md-btn" aria-label="Copy this diagram source" onClick={() => navigator.clipboard.writeText(m.text)}>Copy</button>
                <button class="md-btn" aria-label="Delete this diagram" onClick={() => onDelete(i)}>Delete</button>
              </div>
            </>
          ) : m.kind === 'chat' ? (
            <>
              <div class="md-ai-question">{m.question}</div>
              <div class="md-ai-msg-text">{m.text}</div>
              {m.droppedTurns > 0 && (
                <p class="md-ai-truncated">Earlier turns trimmed to fit ({m.droppedTurns})</p>
              )}
              <div class="md-ai-msg-foot">
                {m.sources.map((s) => (
                  <button key={s.pageIndex} class="md-btn" onClick={() => onCite(s.pageIndex)}
                    aria-label={`Go to section ${s.pageIndex + 1}: ${s.title}`}>
                    &sect;{String(s.pageIndex + 1).padStart(2, '0')} {s.title}
                  </button>
                ))}
                <button class="md-btn" aria-label="Copy this answer" onClick={() => navigator.clipboard.writeText(m.text)}>Copy</button>
                <button class="md-btn" aria-label="Delete this answer" onClick={() => onDelete(i)}>Delete</button>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      ))}

      <form class="md-ask" onSubmit={(e) => {
        e.preventDefault();
        const q = question.trim();
        if (!q || ai.streaming) return;
        setQuestion('');
        onAsk(q);
      }}>
        <textarea
          class="md-ask-input"
          value={question}
          maxLength={4000}
          rows={2}
          placeholder="Ask about this document"
          aria-label="Ask about this document"
          disabled={ai.streaming}
          onInput={(e) => setQuestion((e.target as HTMLTextAreaElement).value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter is a newline. requestSubmit keeps one submit path.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
            }
          }}
        />
        <button class="md-btn primary" type="submit" disabled={ai.streaming || !question.trim()}>Ask</button>
      </form>
    </div>
  );
}
