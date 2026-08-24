import type { Page } from '../shared/types';
import { sectionize } from './parser/sectionize';

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

export interface InsertRequest {
  sectionTitle: string;
  sectionLevel: number;
  code: string;
}

export type InsertPlan =
  | { ok: false; error: string }
  | { ok: true; insertAt: number; displayLine: number; block: string };

const MAX_DIAGRAM_CHARS = 20_000;

/**
 * Decides where a diagram goes, from the document's current text. Pure on purpose: the caller is
 * left with reading the file, applying one edit and replying, so every judgement this feature
 * makes is testable and none of it needs a VS Code stub.
 *
 * The section is found by title and level, never by the stored id — that id is a line number, and
 * the file may have moved since the reader last parsed it.
 */
export function planDiagramInsert(text: string, level: number, req: InsertRequest): InsertPlan {
  const code = typeof req.code === 'string' ? req.code.trim() : '';
  if (!code || code.length > MAX_DIAGRAM_CHARS) {
    return { ok: false, error: 'The diagram source is empty or too large.' };
  }
  if (!Number.isInteger(req.sectionLevel) || req.sectionLevel < 0 || req.sectionLevel > 6) {
    return { ok: false, error: 'That section could not be identified.' };
  }

  const { pages } = sectionize(text, level);
  const found = locateSection(pages, req.sectionTitle, req.sectionLevel);
  if ('error' in found) {
    return {
      ok: false,
      error: found.error === 'missing'
        ? `The section “${req.sectionTitle}” is no longer in this document. Refresh the reader and try again.`
        : `More than one section is called “${req.sectionTitle}”. Refresh the reader and insert from a unique section.`,
    };
  }

  const insertAt = Math.min(found.endLine + 1, text.split('\n').length);
  // displayLine is what an editor shows: the same position, counted from one.
  return { ok: true, insertAt, displayLine: insertAt + 1, block: buildDiagramBlock(code) };
}
