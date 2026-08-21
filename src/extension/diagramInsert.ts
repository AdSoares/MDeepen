import type { Page } from '../shared/types';

const FENCE = '`'.repeat(3);

export type LocateResult = { endLine: number } | { error: 'missing' | 'ambiguous' };

/**
 * Finds a section by title and level rather than by id. A page id is `page-${startLine}` — its
 * identity is its position — which is harmless for reading and wrong for writing, because the
 * document may have changed since the reader last parsed it.
 */
export function locateSection(pages: Page[], title: string, level: number): LocateResult {
  const matches = pages.filter((p) => p.title === title && p.level === level);
  if (matches.length === 0) return { error: 'missing' };
  if (matches.length > 1) return { error: 'ambiguous' };
  return { endLine: matches[0].endLine };
}

/** Normalises whatever the model returned into exactly one fenced mermaid block. */
export function buildDiagramBlock(code: string): string {
  const lines = code.trim().split('\n');
  if (lines[0]?.trimStart().startsWith(FENCE)) {
    lines.shift();
    if (lines[lines.length - 1]?.trimStart().startsWith(FENCE)) lines.pop();
  }
  const bare = lines.join('\n').trim();
  return `\n${FENCE}mermaid\n${bare}\n${FENCE}\n`;
}
