import { describe, it, expect } from 'vitest';
import { isWebviewToHost, isHostToWebview } from './messages';

describe('message type guards', () => {
  it('accepts a valid webview->host message', () => {
    expect(isWebviewToHost({ type: 'activeSectionChanged', index: 3 })).toBe(true);
  });
  it('rejects an unknown type', () => {
    expect(isWebviewToHost({ type: 'nope' })).toBe(false);
  });
  it('rejects a non-object', () => {
    expect(isWebviewToHost(null)).toBe(false);
    expect(isHostToWebview('string')).toBe(false);
  });
  it('accepts a valid host->webview init message', () => {
    const msg = {
      type: 'init',
      fileName: 'a.md',
      pages: [],
      outline: [],
      effectiveLevel: 2,
      restoredIndex: 0,
      readIds: [],
      panels: { outlineVisible: true, aiVisible: true, outlineWidth: 252, aiWidth: 340 },
      config: { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' },
    };
    expect(isHostToWebview(msg)).toBe(true);
  });
  it('accepts sectionRead and uiStateChanged webview->host messages', () => {
    expect(isWebviewToHost({ type: 'sectionRead', id: 'page-3' })).toBe(true);
    expect(
      isWebviewToHost({
        type: 'uiStateChanged',
        config: { fontSize: 15.5, columnWidth: 0, lineHeight: 1.72, theme: 'auto' },
        panels: { outlineVisible: false, aiVisible: true, outlineWidth: 200, aiWidth: 340 },
      }),
    ).toBe(true);
  });
  it('accepts new AI webview->host messages', () => {
    expect(isWebviewToHost({ type: 'aiSummarizeSection', id: 'page-3' })).toBe(true);
    expect(isWebviewToHost({ type: 'aiStop' })).toBe(true);
    expect(isWebviewToHost({ type: 'aiConfirmSend', dontAskAgain: true, masked: false })).toBe(true);
    expect(isWebviewToHost({ type: 'aiSaveConfig', config: { provider: 'anthropic', model: 'claude-opus-4-8', maxTokens: 4096 } })).toBe(true);
  });
  it('accepts the API key message, which must never travel inside aiSaveConfig', () => {
    expect(isWebviewToHost({ type: 'aiSaveKey', key: 'sk-test' })).toBe(true);
    expect(isWebviewToHost({ type: 'aiClearKey' })).toBe(true);
  });
  it('accepts the generic AI action message', () => {
    expect(isWebviewToHost({ type: 'aiAction', action: 'explain', scope: 'selection', id: 'p1', text: 'x' })).toBe(true);
    expect(isWebviewToHost({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' })).toBe(true);
  });
  it('accepts new AI host->webview messages', () => {
    expect(isHostToWebview({ type: 'aiChunk', text: 'x' })).toBe(true);
    expect(isHostToWebview({ type: 'aiDone', usage: { inputTokens: 1, outputTokens: 2 } })).toBe(true);
    expect(isHostToWebview({ type: 'aiError', kind: 'auth', message: 'x' })).toBe(true);
    expect(isHostToWebview({ type: 'aiShowConfig' })).toBe(true);
  });
  it('accepts section navigation driven by a real VS Code keybinding', () => {
    // Arrow navigation cannot live in a webview keydown listener: VS Code resolves
    // Alt+Left as navigateBack regardless of preventDefault.
    expect(isHostToWebview({ type: 'navigateSection', delta: 1 })).toBe(true);
    expect(isHostToWebview({ type: 'navigateSection', delta: -1 })).toBe(true);
  });
});
