import { describe, it, expect } from 'vitest';
import { PositionStore } from './positionStore';

function fakeMemento() {
  const store: Record<string, unknown> = {};
  return {
    get: <T>(k: string, d?: T) => (k in store ? (store[k] as T) : (d as T)),
    update: (k: string, v: unknown) => { store[k] = v; return Promise.resolve(); },
  };
}

describe('PositionStore', () => {
  it('returns 0 for an unknown uri', () => {
    const s = new PositionStore(fakeMemento());
    expect(s.get('file:///a.md')).toBe(0);
  });

  it('persists and reads back a per-uri index', async () => {
    const mem = fakeMemento();
    const s = new PositionStore(mem);
    await s.set('file:///a.md', 4);
    await s.set('file:///b.md', 2);
    expect(new PositionStore(mem).get('file:///a.md')).toBe(4);
    expect(new PositionStore(mem).get('file:///b.md')).toBe(2);
  });
});
