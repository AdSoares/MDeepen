import { describe, it, expect } from 'vitest';
import { isUsableSelectionText, placeToolbar } from './selection';

const VIEWPORT = { width: 1200, height: 800 };
const COLUMN = { left: 300, right: 900 };
const TOOLBAR = { width: 260, height: 32 };

describe('isUsableSelectionText', () => {
  it('accepts a real selection', () => {
    expect(isUsableSelectionText('retry policy')).toBe(true);
  });
  it('rejects whitespace and near-empty selections', () => {
    expect(isUsableSelectionText('   \n  ')).toBe(false);
    expect(isUsableSelectionText('ab')).toBe(false);
    expect(isUsableSelectionText('')).toBe(false);
  });
});

describe('placeToolbar', () => {
  it('sits above the selection with a gap', () => {
    const p = placeToolbar({ top: 400, bottom: 420, left: 500, right: 620 }, VIEWPORT, COLUMN, TOOLBAR);
    expect(p.flipped).toBe(false);
    expect(p.top).toBe(400 - TOOLBAR.height - 8);
  });

  it('flips below when it would clip the top of the viewport', () => {
    const p = placeToolbar({ top: 10, bottom: 30, left: 500, right: 620 }, VIEWPORT, COLUMN, TOOLBAR);
    expect(p.flipped).toBe(true);
    expect(p.top).toBe(30 + 8);
  });

  it('centres on the selection', () => {
    const p = placeToolbar({ top: 400, bottom: 420, left: 500, right: 700 }, VIEWPORT, COLUMN, TOOLBAR);
    expect(p.left).toBe(600 - TOOLBAR.width / 2);
  });

  it('clamps to the left edge of the reading column', () => {
    const p = placeToolbar({ top: 400, bottom: 420, left: 305, right: 330 }, VIEWPORT, COLUMN, TOOLBAR);
    expect(p.left).toBe(COLUMN.left);
  });

  it('clamps to the right edge of the reading column', () => {
    const p = placeToolbar({ top: 400, bottom: 420, left: 860, right: 895 }, VIEWPORT, COLUMN, TOOLBAR);
    expect(p.left).toBe(COLUMN.right - TOOLBAR.width);
  });

  it('never leaves the column when the column is narrower than the toolbar', () => {
    const narrow = { left: 400, right: 500 };
    const p = placeToolbar({ top: 400, bottom: 420, left: 420, right: 460 }, VIEWPORT, narrow, TOOLBAR);
    expect(p.left).toBe(narrow.left);
  });
});
