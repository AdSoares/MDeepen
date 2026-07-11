import { describe, it, expect } from 'vitest';
import { classifyLink, reconcileIndex } from './linkAndReconcile';
import type { Page } from '../shared/types';

const p = (id: string, title: string): Page => ({
  id, title, level: 2, startLine: 0, endLine: 0, content: '', wordCount: 0,
});

describe('classifyLink', () => {
  it('detects external', () => {
    expect(classifyLink('https://x.com')).toBe('external');
    expect(classifyLink('mailto:a@b.com')).toBe('external');
  });
  it('detects anchors', () => expect(classifyLink('#section')).toBe('anchor'));
  it('treats relative paths as local', () => expect(classifyLink('./other.md')).toBe('local'));
  it('blocks dangerous schemes', () => {
    expect(classifyLink('javascript:alert(1)')).toBe('blocked');
    expect(classifyLink('vscode://x')).toBe('blocked');
    expect(classifyLink('data:text/html,x')).toBe('blocked');
  });
  it('still treats scheme-less relative paths as local', () => {
    expect(classifyLink('./a.md')).toBe('local');
    expect(classifyLink('sub/b.md')).toBe('local');
    expect(classifyLink('C:/x')).toBe('local'); // windows drive letter, not a URL scheme
  });
});

describe('reconcileIndex', () => {
  it('follows the same page id after re-parse', () => {
    const before = [p('page-0', 'A'), p('page-5', 'B'), p('page-9', 'C')];
    const after = [p('page-0', 'A'), p('page-6', 'B'), p('page-10', 'C')];
    // active was B (id page-5); id changed but title matches
    expect(reconcileIndex(before, after, 1)).toBe(1);
  });
  it('clamps when the page disappeared', () => {
    const before = [p('a', 'A'), p('b', 'B'), p('c', 'C')];
    const after = [p('a', 'A')];
    expect(reconcileIndex(before, after, 2)).toBe(0);
  });
  it('returns 0 for empty new pages', () => {
    expect(reconcileIndex([p('a', 'A')], [], 0)).toBe(0);
  });
});
