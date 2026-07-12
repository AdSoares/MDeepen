export function AiPanel() {
  const gated = ['Summaries', 'Chat with the document', 'Generated diagrams'];
  return (
    <div style={{ padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <span class="codicon codicon-sparkle" style={{ color: 'var(--md-ai)' }} aria-hidden="true" />
        <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>AI features are off</h2>
      </div>
      <p style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '12px' }}>
        Reading, pagination and navigation all work without AI. These features are unavailable in this build:
      </p>
      <ul style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '12px', paddingLeft: '18px' }}>
        {gated.map((g) => <li key={g}>{g}</li>)}
      </ul>
    </div>
  );
}
