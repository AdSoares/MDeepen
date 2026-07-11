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
      config: { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' },
    };
    expect(isHostToWebview(msg)).toBe(true);
  });
});
