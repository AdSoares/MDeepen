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
});
