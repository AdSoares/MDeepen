import { describe, it, expect } from 'vitest';
import { buildDiagramBlock, locateSection } from './diagramInsert';
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
