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

  it('accumulates streaming ai text and finalizes', () => {
    const s = createReaderState();
    s.aiConfigState(true, 'anthropic', 'claude-opus-4-8');
    expect(s.get().ai.configured).toBe(true);
    s.aiStreamStart({ action: 'summarize', scope: 'section', sectionTitle: '', pageIndex: -1 });
    s.aiChunk('Hel'); s.aiChunk('lo');
    expect(s.get().ai.streamText).toBe('Hello');
    expect(s.get().ai.streaming).toBe(true);
    s.aiDone();
    expect(s.get().ai.streaming).toBe(false);
    expect(s.get().ai.messages.at(-1)?.text).toBe('Hello');
  });

  it('disconnecting drops a stale connection result', () => {
    const s = createReaderState();
    s.aiConfigState(true, 'anthropic', 'claude-opus-4-8');
    s.aiConnection({ ok: true, ms: 120 });
    s.aiConfigState(false, 'anthropic', 'claude-opus-4-8');
    expect(s.get().ai.connection).toBeUndefined();
  });

  it('keeps the partial answer when a stream errors', () => {
    const s = createReaderState();
    s.aiStreamStart({ action: 'summarize', scope: 'section', sectionTitle: 'Retries', pageIndex: 3 });
    s.aiChunk('half an ans');
    s.aiError('rate_limit', 'slow down');
    expect(s.get().ai.streaming).toBe(false);
    expect(s.get().ai.messages.at(-1)?.text).toBe('half an ans');
    expect(s.get().ai.messages.at(-1)?.pageIndex).toBe(3);
    expect(s.get().ai.error?.kind).toBe('rate_limit');
  });

  it('stopping finalizes the partial answer and clears streaming', () => {
    const s = createReaderState();
    s.aiStreamStart({ action: 'summarize', scope: 'section', sectionTitle: 'Retries', pageIndex: 1 });
    s.aiChunk('partial');
    s.aiStopped();
    expect(s.get().ai.streaming).toBe(false);
    expect(s.get().ai.messages.at(-1)?.text).toBe('partial');
  });

  it('a stream with no text leaves no empty message behind', () => {
    const s = createReaderState();
    s.aiStreamStart({ action: 'summarize', scope: 'section', sectionTitle: '', pageIndex: -1 });
    s.aiError('auth', 'no key');
    expect(s.get().ai.messages).toHaveLength(0);
  });

  it('holds and clears the confirm payload', () => {
    const s = createReaderState();
    s.aiConfirm({ summary: { fileName: 'a.md', sectionTitle: 'Retries', scope: 'section', sectionCount: 1, truncated: [], model: 'claude-opus-4-8', estTokens: 10, estCost: 0.00005 }, secrets: { label: '1 possible secret detected', count: 1 } });
    expect(s.get().ai.confirm?.secrets.count).toBe(1);
    s.aiConfirm(undefined);
    expect(s.get().ai.confirm).toBeUndefined();
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

  it('records which action produced an answer and what it was applied to', () => {
    const s = createReaderState();
    s.aiStreamStart({ action: 'explain', scope: 'selection', sectionTitle: 'Retries', pageIndex: 2, excerpt: 'we retry 3x' });
    s.aiChunk('because');
    s.aiDone();
    const last = s.get().ai.messages.at(-1);
    expect(last?.action).toBe('explain');
    expect(last?.scope).toBe('selection');
    expect(last?.excerpt).toBe('we retry 3x');
    expect(last?.pageIndex).toBe(2);
  });

  it('truncates a long excerpt', () => {
    const s = createReaderState();
    s.aiStreamStart({ action: 'explain', scope: 'selection', sectionTitle: 'Retries', pageIndex: 0, excerpt: 'x'.repeat(400) });
    s.aiChunk('ok');
    s.aiDone();
    expect(s.get().ai.messages.at(-1)?.excerpt?.length).toBeLessThanOrEqual(241);
  });

  it('deletes one answer without touching the others', () => {
    const s = createReaderState();
    for (const text of ['first', 'second', 'third']) {
      s.aiStreamStart({ action: 'summarize', scope: 'section', sectionTitle: 't', pageIndex: 0 });
      s.aiChunk(text);
      s.aiDone();
    }
    s.aiDeleteMessage(1);
    expect(s.get().ai.messages.map((m) => m.text)).toEqual(['first', 'third']);
  });

  it('ignores a delete outside the range', () => {
    const s = createReaderState();
    s.aiStreamStart({ action: 'summarize', scope: 'section', sectionTitle: 't', pageIndex: 0 });
    s.aiChunk('only');
    s.aiDone();
    s.aiDeleteMessage(7);
    s.aiDeleteMessage(-1);
    expect(s.get().ai.messages).toHaveLength(1);
  });

  it('clears every answer', () => {
    const s = createReaderState();
    s.aiStreamStart({ action: 'summarize', scope: 'section', sectionTitle: 't', pageIndex: 0 });
    s.aiChunk('gone');
    s.aiDone();
    s.aiClearMessages();
    expect(s.get().ai.messages).toHaveLength(0);
  });
});

describe('document run progress', () => {
  it('records progress and clears it once the reduce starts streaming', () => {
    const store = createReaderState();
    store.aiStreamStart({ action: 'summarizeShort', scope: 'document', sectionTitle: 'doc.md', pageIndex: -1 });

    store.aiProgress(1, 4);
    expect(store.get().ai.progress).toEqual({ done: 1, total: 4 });

    store.aiChunk('first token');
    expect(store.get().ai.progress).toBeUndefined();
  });

  it('clears progress when the run ends', () => {
    const store = createReaderState();
    store.aiStreamStart({ action: 'summarizeShort', scope: 'document', sectionTitle: 'doc.md', pageIndex: -1 });
    store.aiProgress(2, 4);
    store.aiChunk('text');
    store.aiDone();
    expect(store.get().ai.progress).toBeUndefined();
    expect(store.get().ai.streaming).toBe(false);
  });

  it('clears stale progress when a new run starts', () => {
    const store = createReaderState();
    store.aiProgress(3, 4);
    store.aiStreamStart({ action: 'summarize', scope: 'section', sectionTitle: 'A', pageIndex: 0 });
    expect(store.get().ai.progress).toBeUndefined();
  });

  it('carries the truncated section list into the finished answer', () => {
    const store = createReaderState();
    store.aiStreamStart({ action: 'summarizeShort', scope: 'document', sectionTitle: 'doc.md', pageIndex: -1, truncated: ['Huge'] });
    store.aiChunk('answer');
    store.aiDone();
    expect(store.get().ai.messages[0].truncated).toEqual(['Huge']);
  });
});
