import type { AiState } from '../store';

interface Props {
  ai: AiState;
  activePageId: string | undefined;
  onConfigure: () => void;
  onCite: (pageIndex: number) => void;
  onSummarize: () => void;
  onStop: () => void;
}

const GATED = ['Summaries', 'Chat with the document', 'Generated diagrams'];

export function AiPanel({ ai, activePageId, onConfigure, onCite, onSummarize, onStop }: Props) {
  if (!ai.configured) {
    return (
      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
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

  return (
    <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span class="codicon codicon-sparkle" style={{ color: 'var(--md-ai)' }} aria-hidden="true" />
        <span style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>Anthropic - {ai.model}</span>
        <span style={{ flex: 1 }} />
        <button class="md-btn" aria-label="AI configuration" onClick={onConfigure}>
          <span class="codicon codicon-gear" aria-hidden="true" />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button class="md-btn primary" disabled={!activePageId || ai.streaming} onClick={onSummarize}>
          Summarize section
        </button>
        {ai.streaming && <button class="md-btn" onClick={onStop}>Stop generating</button>}
      </div>

      {ai.confirm && (
        <p role="status" style={{ margin: 0, fontSize: '12px', color: 'var(--md-warn)' }}>
          Waiting for your confirmation before sending...
        </p>
      )}

      {ai.error && (
        <p role="alert" style={{ margin: 0, fontSize: '12px', color: 'var(--md-warn)' }}>{ai.error.message}</p>
      )}

      {ai.streaming && (
        <div aria-live="polite" style={{ fontSize: '13px', whiteSpace: 'pre-wrap' }}>{ai.streamText}</div>
      )}

      {ai.messages.map((m, i) => (
        <div key={i} style={{ borderTop: '1px solid var(--vscode-panel-border)', paddingTop: '10px' }}>
          <div style={{ fontSize: '13px', whiteSpace: 'pre-wrap' }}>{m.text}</div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
            {m.pageIndex >= 0 && (
              <button class="md-btn" onClick={() => onCite(m.pageIndex)} title={`Go to section ${m.pageIndex + 1}`}>
                &sect;{String(m.pageIndex + 1).padStart(2, '0')} {m.sectionTitle}
              </button>
            )}
            <button class="md-btn" onClick={() => navigator.clipboard.writeText(m.text)}>Copy</button>
          </div>
        </div>
      ))}
    </div>
  );
}
