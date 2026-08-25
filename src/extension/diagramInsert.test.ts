import { describe, it, expect } from 'vitest';
import { buildDiagramBlock, locateSection, planDiagramInsert } from './diagramInsert';
import type { Page } from '../shared/types';

function page(title: string, level: number, startLine: number, endLine: number): Page {
  return { id: `page-${startLine}`, title, level, startLine, endLine, content: '', wordCount: 0 };
}

const FENCE = '`'.repeat(3);

describe('locateSection', () => {
  const PAGES = [
    page('Introduction', 0, 0, 4),
    page('Retries', 2, 5, 20),
    page('Backoff', 2, 21, 30),
  ];

  it('finds a unique section and reports where it ends', () => {
    const found = locateSection(PAGES, 'Retries', 2);
    expect(found).toEqual({ endLine: 20 });
  });

  it('refuses when the section is gone', () => {
    expect(locateSection(PAGES, 'Timeouts', 2)).toEqual({ error: 'missing' });
  });

  it('refuses when two sections share a title at the same level', () => {
    const dupes = [...PAGES, page('Retries', 2, 31, 40)];
    expect(locateSection(dupes, 'Retries', 2)).toEqual({ error: 'ambiguous' });
  });

  it('treats the same title at a different level as a different section', () => {
    const mixed = [...PAGES, page('Retries', 3, 31, 40)];
    expect(locateSection(mixed, 'Retries', 2)).toEqual({ endLine: 20 });
  });
});

describe('buildDiagramBlock', () => {
  it('wraps bare source in a mermaid fence', () => {
    const block = buildDiagramBlock('flowchart TD\n  A --> B');
    expect(block).toBe(`\n${FENCE}mermaid\nflowchart TD\n  A --> B\n${FENCE}\n`);
  });

  it('strips a fence the model added, so the result is never nested', () => {
    const block = buildDiagramBlock(`${FENCE}mermaid\nflowchart TD\n  A --> B\n${FENCE}`);
    expect(block).toBe(`\n${FENCE}mermaid\nflowchart TD\n  A --> B\n${FENCE}\n`);
  });

  it('strips a bare fence too', () => {
    const block = buildDiagramBlock(`${FENCE}\nmindmap\n  root\n${FENCE}`);
    expect(block).toContain('mindmap');
    expect(block.split(FENCE)).toHaveLength(3);
  });

  it('trims surrounding whitespace so the block never grows blank lines', () => {
    const block = buildDiagramBlock('\n\n  flowchart TD\n  A --> B  \n\n');
    expect(block).toBe(`\n${FENCE}mermaid\nflowchart TD\n  A --> B\n${FENCE}\n`);
  });
});

describe('planDiagramInsert', () => {
  // Eleven lines, so the expected positions can be counted by hand:
  //   0 '# Doc'  1 ''  2 'intro'  3 ''  4 '## Retries'  5 ''  6 'body'  7 ''
  //   8 '## Backoff'  9 ''  10 'tail'
  const DOC = ['# Doc', '', 'intro', '', '## Retries', '', 'body', '', '## Backoff', '', 'tail'].join('\n');
  const req = (over: Partial<{ sectionTitle: string; sectionLevel: number; code: string }> = {}) =>
    ({ sectionTitle: 'Retries', sectionLevel: 2, code: 'flowchart TD', ...over });

  it('inserts just after the section it was asked for', () => {
    const plan = planDiagramInsert(DOC, 2, req());
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.insertAt).toBe(8);
    expect(plan.displayLine).toBe(9);
    expect(plan.block).toContain('flowchart TD');
  });

  it('clamps to the end of the file for the last section', () => {
    const plan = planDiagramInsert(DOC, 2, req({ sectionTitle: 'Backoff' }));
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.insertAt).toBe(11);
  });

  it('refuses when the section is no longer there, and names it', () => {
    const plan = planDiagramInsert(DOC, 2, req({ sectionTitle: 'Timeouts' }));
    expect(plan.ok).toBe(false);
    if (plan.ok) throw new Error('expected a refusal');
    expect(plan.error).toContain('Timeouts');
  });

  it('refuses when two sections share the title', () => {
    const dupes = DOC + '\n\n## Retries\n\nagain';
    const plan = planDiagramInsert(dupes, 2, req());
    expect(plan.ok).toBe(false);
  });

  it('refuses empty or oversized source', () => {
    expect(planDiagramInsert(DOC, 2, req({ code: '   ' })).ok).toBe(false);
    expect(planDiagramInsert(DOC, 2, req({ code: 'x'.repeat(20_001) })).ok).toBe(false);
  });

  it('refuses a level outside the heading range', () => {
    expect(planDiagramInsert(DOC, 2, req({ sectionLevel: 7 })).ok).toBe(false);
    expect(planDiagramInsert(DOC, 2, req({ sectionLevel: -1 })).ok).toBe(false);
    expect(planDiagramInsert(DOC, 2, req({ sectionLevel: 1.5 })).ok).toBe(false);
  });

  it('normalises a fenced answer rather than nesting it', () => {
    const fenced = ['```mermaid', 'flowchart TD', '```'].join('\n');
    const plan = planDiagramInsert(DOC, 2, req({ code: fenced }));
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.block.split('```')).toHaveLength(3);
  });
});
