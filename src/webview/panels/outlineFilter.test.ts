import { describe, it, expect } from 'vitest';
import { filterOutline } from './outlineFilter';
import type { OutlineNode } from '../../shared/types';

const node = (title: string, children: OutlineNode[] = []): OutlineNode => ({
  id: title, title, level: 2, line: 0, pageIndex: 0, children,
});

describe('filterOutline', () => {
  it('returns all nodes for empty query', () => {
    const tree = [node('Alpha'), node('Beta')];
    expect(filterOutline(tree, '')).toHaveLength(2);
  });
  it('keeps a parent when a child matches', () => {
    const tree = [node('Alpha', [node('retry logic')])];
    const out = filterOutline(tree, 'retry');
    expect(out).toHaveLength(1);
    expect(out[0].children).toHaveLength(1);
  });
  it('drops non-matching branches', () => {
    const tree = [node('Alpha'), node('Beta')];
    expect(filterOutline(tree, 'alpha').map((n) => n.title)).toEqual(['Alpha']);
  });
});
