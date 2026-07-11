import { describe, it, expect } from 'vitest';
import { sectionize, resolveEffectiveLevel } from './sectionize';
import { extractHeadings } from './headings';

describe('resolveEffectiveLevel', () => {
  it('returns desired when present', () => {
    const h = extractHeadings('# A\n## B');
    expect(resolveEffectiveLevel(h, 2)).toBe(2);
  });
  it('falls back to nearest present level', () => {
    const h = extractHeadings('# A\n### C'); // no level 2
    expect(resolveEffectiveLevel(h, 2)).toBe(1); // 1 and 3 are equidistant → prefer shallower
  });
  it('falls back when desired is deeper than any heading', () => {
    const h = extractHeadings('# A\n## B');
    expect(resolveEffectiveLevel(h, 4)).toBe(2);
  });
});

describe('sectionize', () => {
  it('splits into pages at the chosen level', () => {
    const md = '# Doc\n\nintro line\n\n## One\n\naaa\n\n## Two\n\nbbb';
    const r = sectionize(md, 2);
    expect(r.effectiveLevel).toBe(2);
    // intro (# Doc + its body before first level-2), One, Two
    expect(r.pages.map((p) => p.title)).toEqual(['Doc', 'One', 'Two']);
    expect(r.pages[1].content).toContain('## One');
    expect(r.pages[1].content).toContain('aaa');
    expect(r.pages[1].content).not.toContain('bbb');
  });

  it('keeps deeper headings inside their parent page', () => {
    const md = '## One\n\na\n\n### One-A\n\nb\n\n## Two\n\nc';
    const r = sectionize(md, 2);
    expect(r.pages.map((p) => p.title)).toEqual(['One', 'Two']);
    expect(r.pages[0].content).toContain('### One-A');
  });

  it('creates an intro page for content before the first heading', () => {
    const md = 'preamble text\n\n## First\n\nx';
    const r = sectionize(md, 2);
    expect(r.pages[0].level).toBe(0);
    expect(r.pages[0].title).toBe('Introduction');
    expect(r.pages[0].content).toContain('preamble text');
    expect(r.pages[1].title).toBe('First');
  });

  it('treats a document with no headings as a single intro page', () => {
    const md = 'just some text\nand more';
    const r = sectionize(md, 2);
    expect(r.pages).toHaveLength(1);
    expect(r.pages[0].level).toBe(0);
    expect(r.pages[0].wordCount).toBeGreaterThan(0);
  });

  it('maps outline nodes to their containing page index', () => {
    const md = '## One\n\na\n\n### One-A\n\nb\n\n## Two\n\nc';
    const r = sectionize(md, 2);
    const oneA = r.outline[0].children[0];
    expect(oneA.title).toBe('One-A');
    expect(oneA.pageIndex).toBe(0); // belongs to page "One"
  });

  it('startLine/endLine are 0-based inclusive and contiguous', () => {
    const md = '## One\n\na\n\n## Two\n\nb';
    const r = sectionize(md, 2);
    expect(r.pages[0].startLine).toBe(0);
    expect(r.pages[1].startLine).toBe(r.pages[0].endLine + 1);
  });

  it('returns a single empty intro page for an empty document', () => {
    const r = sectionize('', 2);
    expect(r.pages).toHaveLength(1);
    expect(r.pages[0].level).toBe(0);
    expect(r.pages[0].wordCount).toBe(0);
  });

  it('excludes fenced code (``` and ~~~) from word count', () => {
    const md = '## S\n\nreal words here\n\n```\ncode tokens\n```\n\n~~~\nmore code\n~~~';
    const r = sectionize(md, 2);
    expect(r.pages[0].wordCount).toBe(4); // "S" + "real words here"
  });

  it('intro page is contiguous with the first boundary page', () => {
    const md = 'preamble\n\n## First\n\nx';
    const r = sectionize(md, 2);
    expect(r.pages[1].startLine).toBe(r.pages[0].endLine + 1);
  });
});
