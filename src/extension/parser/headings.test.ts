import { describe, it, expect } from 'vitest';
import { extractHeadings, buildTree } from './headings';

describe('extractHeadings', () => {
  it('extracts ATX headings with 0-based lines', () => {
    const md = '# Title\n\nText\n\n## Sub\n\nmore';
    expect(extractHeadings(md)).toEqual([
      { level: 1, title: 'Title', line: 0 },
      { level: 2, title: 'Sub', line: 4 },
    ]);
  });

  it('ignores heading-like lines inside fenced code blocks', () => {
    const md = '# Real\n\n```\n# not a heading\n```\n\n## Also real';
    const out = extractHeadings(md);
    expect(out.map((h) => h.title)).toEqual(['Real', 'Also real']);
  });

  it('returns empty for a document with no headings', () => {
    expect(extractHeadings('just text\nmore text')).toEqual([]);
  });
});

describe('buildTree', () => {
  it('nests headings by level', () => {
    const headings = [
      { level: 1, title: 'A', line: 0 },
      { level: 2, title: 'A1', line: 2 },
      { level: 2, title: 'A2', line: 4 },
      { level: 1, title: 'B', line: 6 },
    ];
    const tree = buildTree(headings, () => 0);
    expect(tree).toHaveLength(2);
    expect(tree[0].title).toBe('A');
    expect(tree[0].children.map((c) => c.title)).toEqual(['A1', 'A2']);
    expect(tree[1].title).toBe('B');
    expect(tree[0].id).toBe('sec-0');
  });

  it('handles a jump from level 1 to level 3 without crashing', () => {
    const headings = [
      { level: 1, title: 'A', line: 0 },
      { level: 3, title: 'deep', line: 2 },
    ];
    const tree = buildTree(headings, () => 0);
    expect(tree[0].children[0].title).toBe('deep');
  });
});
