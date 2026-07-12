import { describe, it, expect } from 'vitest';
import { createReaderState } from './store';
import type { Page } from '../shared/types';

const p = (id: string): Page => ({ id, title: id, level: 2, startLine: 0, endLine: 0, content: '', wordCount: 10 });

describe('reader store', () => {
  it('applies init and clamps active index', () => {
    const s = createReaderState();
    s.applyInit({
      type: 'init', fileName: 'a.md', pages: [p('a'), p('b')], outline: [],
      effectiveLevel: 2, restoredIndex: 5, readIds: [], panels: { outlineVisible: true, aiVisible: true, outlineWidth: 252, aiWidth: 340 }, config: { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' },
    });
    expect(s.get().activeIndex).toBe(1); // clamped to last
    expect(s.get().fileName).toBe('a.md');
  });

  it('notifies subscribers on setActiveIndex', () => {
    const s = createReaderState();
    s.applyInit({
      type: 'init', fileName: 'a.md', pages: [p('a'), p('b'), p('c')], outline: [],
      effectiveLevel: 2, restoredIndex: 0, readIds: [], panels: { outlineVisible: true, aiVisible: true, outlineWidth: 252, aiWidth: 340 }, config: { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' },
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
      effectiveLevel: 2, restoredIndex: 0, readIds: [], panels: { outlineVisible: true, aiVisible: true, outlineWidth: 252, aiWidth: 340 }, config: { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' },
    });
    s.setActiveIndex(99);
    expect(s.get().activeIndex).toBe(1);
    s.setActiveIndex(-3);
    expect(s.get().activeIndex).toBe(0);
  });

  it('ingests readIds on init and update', () => {
    const s = createReaderState();
    s.applyInit({
      type: 'init', fileName: 'a.md', pages: [p('a'), p('b')], outline: [],
      effectiveLevel: 2, restoredIndex: 0, readIds: ['a'],
      panels: { outlineVisible: true, aiVisible: true, outlineWidth: 252, aiWidth: 340 },
      config: { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' },
    });
    expect(s.get().readIds.has('a')).toBe(true);
    s.applyUpdate({ type: 'sectionsUpdated', pages: [p('a')], outline: [], effectiveLevel: 2, keepIndex: 0, readIds: [] });
    expect(s.get().readIds.size).toBe(0);
  });

  it('markRead adds and notifies', () => {
    const s = createReaderState();
    s.applyInit({
      type: 'init', fileName: 'a.md', pages: [p('a'), p('b')], outline: [],
      effectiveLevel: 2, restoredIndex: 0, readIds: [],
      panels: { outlineVisible: true, aiVisible: true, outlineWidth: 252, aiWidth: 340 },
      config: { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' },
    });
    let notified = false;
    s.subscribe(() => { notified = true; });
    s.markRead('b');
    expect(s.get().readIds.has('b')).toBe(true);
    expect(notified).toBe(true);
  });

  it('applyInit ingests panels state', () => {
    const s = createReaderState();
    s.applyInit({
      type: 'init', fileName: 'a.md', pages: [p('a')], outline: [],
      effectiveLevel: 2, restoredIndex: 0, readIds: [],
      panels: { outlineVisible: false, aiVisible: true, outlineWidth: 300, aiWidth: 400 },
      config: { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' },
    });
    expect(s.get().panels.outlineVisible).toBe(false);
    expect(s.get().panels.outlineWidth).toBe(300);
  });
});
