import { describe, it, expect } from 'vitest';
import { breadcrumbFor } from './breadcrumb';
import type { OutlineNode } from '../shared/types';

function node(title: string, level: number, pageIndex: number, children: OutlineNode[] = []): OutlineNode {
  return { id: title, title, level, line: 0, pageIndex, children };
}

// # Guide            page 0
//   ## Setup         page 1
//     ### Keys       page 1
//   ## Usage         page 2
//     ### Reading    page 3
//     ### Writing    page 4
const OUTLINE: OutlineNode[] = [
  node('Guide', 1, 0, [
    node('Setup', 2, 1, [node('Keys', 3, 1)]),
    node('Usage', 2, 2, [node('Reading', 3, 3), node('Writing', 3, 4)]),
  ]),
];

describe('breadcrumbFor', () => {
  it('returns the ancestors of the section that owns the page', () => {
    expect(breadcrumbFor(OUTLINE, 3)).toEqual([
      { title: 'Guide', pageIndex: 0 },
      { title: 'Usage', pageIndex: 2 },
    ]);
  });

  it('is empty for a top-level section, which has no ancestors', () => {
    expect(breadcrumbFor(OUTLINE, 0)).toEqual([]);
  });

  it('is empty for a page no heading owns, such as an intro', () => {
    expect(breadcrumbFor(OUTLINE, 99)).toEqual([]);
  });

  it('takes the chain of the owning sibling, not of the first one', () => {
    expect(breadcrumbFor(OUTLINE, 4)).toEqual([
      { title: 'Guide', pageIndex: 0 },
      { title: 'Usage', pageIndex: 2 },
    ]);
    expect(breadcrumbFor(OUTLINE, 1)).toEqual([{ title: 'Guide', pageIndex: 0 }]);
  });

  it('stops at the section that owns the page, never including it', () => {
    for (const page of [0, 1, 2, 3, 4]) {
      const titles = breadcrumbFor(OUTLINE, page).map((c) => c.title);
      expect(titles).not.toContain(['Guide', 'Setup', 'Usage', 'Reading', 'Writing'][page]);
    }
  });

  it('handles a repeated title at a different level without confusing the chains', () => {
    const repeated: OutlineNode[] = [
      node('Notes', 1, 0, [node('Notes', 2, 1, [node('Detail', 3, 2)])]),
    ];
    expect(breadcrumbFor(repeated, 2)).toEqual([
      { title: 'Notes', pageIndex: 0 },
      { title: 'Notes', pageIndex: 1 },
    ]);
  });

  it('returns an empty chain for an empty outline', () => {
    expect(breadcrumbFor([], 0)).toEqual([]);
  });
});
