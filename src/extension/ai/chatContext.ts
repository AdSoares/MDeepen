import type { Page } from '../../shared/types';
import { estimateTokens } from './costEstimate';
import { MAX_CHAT_SECTIONS } from './types';

export interface ScoredSection {
  pageIndex: number;
  title: string;
  score: number;
  pinned: boolean;
}

const K1 = 1.2;
const B = 0.75;
/** A question matching a heading is answered by that section far more often than one matching a
 *  passing mention, so title terms are counted three times. */
const TITLE_WEIGHT = 3;

/** Lowercases and splits on non-alphanumerics. No stemming: it is language-specific, and this
 *  reader opens Markdown in any language. */
const tokenize = (text: string): string[] =>
  text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

interface Doc {
  counts: Map<string, number>;
  length: number;
}

function index(page: Page): Doc {
  const counts = new Map<string, number>();
  for (const t of tokenize(page.content)) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const t of tokenize(page.title)) counts.set(t, (counts.get(t) ?? 0) + TITLE_WEIGHT);
  let length = 0;
  counts.forEach((n) => { length += n; });
  return { counts, length };
}

/**
 * BM25 over the document's own sections. IDF is computed from this document, which is what
 * removes the need for a stopword list: a term appearing in every section earns a weight near
 * zero on its own, in whatever language the document is written in.
 *
 * The active section is pinned first whatever it scores — a reader asking a question while
 * looking at a section is usually asking about that section.
 */
export function rankSections(question: string, pages: Page[], activeIndex: number): ScoredSection[] {
  const terms = [...new Set(tokenize(question))];
  const docs = pages.map(index);
  const n = pages.length;
  const avgLength = docs.reduce((sum, d) => sum + d.length, 0) / Math.max(1, n);

  const df = new Map<string, number>();
  for (const t of terms) df.set(t, docs.filter((d) => d.counts.has(t)).length);

  const scored = pages.map((page, i) => {
    let score = 0;
    for (const t of terms) {
      const documentFrequency = df.get(t) ?? 0;
      const frequency = docs[i].counts.get(t) ?? 0;
      if (documentFrequency === 0 || frequency === 0) continue;
      const idf = Math.log(1 + (n - documentFrequency + 0.5) / (documentFrequency + 0.5));
      const norm = 1 - B + B * (docs[i].length / Math.max(1, avgLength));
      score += idf * ((frequency * (K1 + 1)) / (frequency + K1 * norm));
    }
    return { pageIndex: i, title: page.title, score, pinned: i === activeIndex };
  });

  return scored.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.score - a.score);
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatPlan {
  messages: { role: 'user' | 'assistant'; content: string }[];
  usedSections: { title: string; pageIndex: number }[];
  droppedTurns: number;
}

const label = (pageIndex: number): string => `§${String(pageIndex + 1).padStart(2, '0')}`;

/**
 * Assembles one chat turn. Sections claim the budget first and history is trimmed oldest-first
 * from what remains: the document is the source of truth, and a long conversation must not
 * starve the answer of the material it is supposed to answer from.
 */
export function planChatTurn(
  question: string,
  history: ChatTurn[],
  pages: Page[],
  activeIndex: number,
  ctx: { fileName: string },
  budget: { sectionTokens: number; historyTokens: number },
): ChatPlan {
  const chosen: ScoredSection[] = [];
  let spent = 0;
  for (const section of rankSections(question, pages, activeIndex)) {
    if (!section.pinned && section.score <= 0) continue;
    if (chosen.length >= MAX_CHAT_SECTIONS) break;
    const tokens = estimateTokens(pages[section.pageIndex].content);
    // The pinned section is always included; it is truncated below if it alone overruns.
    if (!section.pinned && spent + tokens > budget.sectionTokens) break;
    chosen.push(section);
    spent += tokens;
  }
  chosen.sort((a, b) => a.pageIndex - b.pageIndex);

  const blocks = chosen.map((s) => {
    const content = pages[s.pageIndex].content.slice(0, budget.sectionTokens * 4);
    return `## ${label(s.pageIndex)} ${s.title}\n\n${content}`;
  });

  const kept: ChatTurn[] = [];
  let historySpent = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(history[i].text);
    if (historySpent + tokens > budget.historyTokens) break;
    kept.unshift(history[i]);
    historySpent += tokens;
  }

  return {
    messages: [
      ...kept.map((t) => ({ role: t.role, content: t.text })),
      {
        role: 'user' as const,
        content: `Sections from "${ctx.fileName}":\n\n${blocks.join('\n\n')}\n\nQuestion: ${question}`,
      },
    ],
    usedSections: chosen.map((s) => ({ title: s.title, pageIndex: s.pageIndex })),
    droppedTurns: history.length - kept.length,
  };
}
