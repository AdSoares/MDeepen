import { describe, it, expect } from 'vitest';
import { DocStateStore, UiStateStore } from './positionStore';

function fakeMemento() {
  const store: Record<string, unknown> = {};
  return {
    get: <T>(k: string, d?: T) => (k in store ? (store[k] as T) : (d as T)),
    update: (k: string, v: unknown) => { store[k] = v; return Promise.resolve(); },
    _raw: store,
  };
}

describe('DocStateStore', () => {
  it('returns defaults for an unknown uri', () => {
    const s = new DocStateStore(fakeMemento());
    expect(s.get('file:///a.md')).toEqual({ index: 0, readIds: [] });
  });
  it('persists and reads back per-uri state', async () => {
    const mem = fakeMemento();
    const s = new DocStateStore(mem);
    await s.set('file:///a.md', { index: 4, readIds: ['page-1', 'page-7'] });
    expect(new DocStateStore(mem).get('file:///a.md')).toEqual({ index: 4, readIds: ['page-1', 'page-7'] });
  });
  it('falls back to the legacy positions key for the index', () => {
    const mem = fakeMemento();
    mem._raw['mdeepen.positions'] = { 'file:///old.md': 3 };
    const s = new DocStateStore(mem);
    expect(s.get('file:///old.md')).toEqual({ index: 3, readIds: [] });
  });
});

describe('UiStateStore', () => {
  it('returns defaults when empty', () => {
    const s = new UiStateStore(fakeMemento());
    const st = s.get();
    expect(st.config.columnWidth).toBe(700);
    expect(st.panels).toEqual({ outlineVisible: true, aiVisible: true, outlineWidth: 252, aiWidth: 340 });
  });
  it('round-trips state', async () => {
    const mem = fakeMemento();
    const s = new UiStateStore(mem);
    const next = {
      config: { fontSize: 17, columnWidth: 0, lineHeight: 1.8, theme: 'dark' as const },
      panels: { outlineVisible: false, aiVisible: true, outlineWidth: 200, aiWidth: 300 },
    };
    await s.set(next);
    expect(new UiStateStore(mem).get()).toEqual(next);
  });
});
