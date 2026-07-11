import { describe, it, expect } from 'vitest';
import { createReaderState } from './store';
import type { Page } from '../shared/types';

const p = (id: string): Page => ({ id, title: id, level: 2, startLine: 0, endLine: 0, content: '', wordCount: 10 });

describe('reader store', () => {
  it('applies init and clamps active index', () => {
    const s = createReaderState();
    s.applyInit({
      type: 'init', fileName: 'a.md', pages: [p('a'), p('b')], outline: [],
      effectiveLevel: 2, restoredIndex: 5, config: { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' },
    });
    expect(s.get().activeIndex).toBe(1); // clamped to last
    expect(s.get().fileName).toBe('a.md');
  });

  it('notifies subscribers on setActiveIndex', () => {
    const s = createReaderState();
    s.applyInit({
      type: 'init', fileName: 'a.md', pages: [p('a'), p('b'), p('c')], outline: [],
      effectiveLevel: 2, restoredIndex: 0, config: { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' },
    });
    let seen = -1;
    s.subscribe((st) => { seen = st.activeIndex; });
    s.setActiveIndex(2);
    expect(seen).toBe(2);
  });

  it('clamps setActiveIndex within bounds', () => {
    const s = createReaderState();
    s.applyInit({
      type: 'init', fileName: 'a.md', pages: [p('a'), p('b')], outline: [],
      effectiveLevel: 2, restoredIndex: 0, config: { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' },
    });
    s.setActiveIndex(99);
    expect(s.get().activeIndex).toBe(1);
    s.setActiveIndex(-3);
    expect(s.get().activeIndex).toBe(0);
  });
});
