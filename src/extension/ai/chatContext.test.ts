import { describe, it, expect } from 'vitest';
import { planChatTurn, rankSections } from './chatContext';
import type { Page } from '../../shared/types';

function page(title: string, content: string): Page {
  return { id: title, title, level: 2, startLine: 0, endLine: 1, content, wordCount: 1 };
}

describe('rankSections', () => {
  const PAGES = [
    page('Overview', 'the system handles payments end to end'),
    page('Retries', 'the system retries a failed call three times with exponential backoff'),
    page('Storage', 'the system stores records in postgres for seven years'),
  ];

  it('ranks the section containing the rare term first', () => {
    const ranked = rankSections('how many retries', PAGES, 0).filter((s) => !s.pinned);
    expect(ranked[0].title).toBe('Retries');
  });

  it('gives almost no weight to a term present in every section', () => {
    // "the system" appears in all three, so IDF flattens it — this is what replaces a stopword list.
    // Asserted relative to a rare term rather than against a magic threshold, so the test
    // survives a change to k1 or b.
    const common = rankSections('the system', PAGES, 0).filter((s) => !s.pinned).map((s) => s.score);
    const rare = rankSections('retries', PAGES, 0).find((s) => s.title === 'Retries')!.score;
    expect(Math.max(...common)).toBeLessThan(rare / 2);
  });

  it('weighs a title match above a body mention', () => {
    const pages = [
      page('Backoff', 'doubling, capped at eight seconds'),
      page('Notes', 'we mention backoff here once in passing'),
      page('Unrelated', 'nothing to do with any of it'),
    ];
    // The active section is the unrelated third one, so neither candidate is pinned.
    const ranked = rankSections('backoff', pages, 2).filter((s) => !s.pinned);
    expect(ranked[0].title).toBe('Backoff');
  });

  it('pins the active section first whatever it scores', () => {
    const ranked = rankSections('retries', PAGES, 2);
    expect(ranked[0].title).toBe('Storage');
    expect(ranked[0].pinned).toBe(true);
  });

  it('scores a section with no matching term at zero', () => {
    const ranked = rankSections('kubernetes', PAGES, 0);
    for (const s of ranked) expect(s.score).toBe(0);
  });

  it('is unaffected by punctuation and case in the question', () => {
    const a = rankSections('Retries?', PAGES, 0).find((s) => s.title === 'Retries');
    const b = rankSections('retries', PAGES, 0).find((s) => s.title === 'Retries');
    expect(a!.score).toBeCloseTo(b!.score, 10);
  });
});

describe('planChatTurn', () => {
  const PAGES = [
    page('Overview', 'the system handles payments end to end'),
    page('Retries', 'the system retries a failed call three times with exponential backoff'),
    page('Storage', 'the system stores records in postgres for seven years'),
  ];
  const CTX = { fileName: 'handbook.md' };
  const BUDGET = { sectionTokens: 6000, historyTokens: 2000 };

  it('puts the question last, after any history', () => {
    const history = [
      { role: 'user' as const, text: 'what is this?' },
      { role: 'assistant' as const, text: 'a payments handbook' },
    ];
    const plan = planChatTurn('how many retries?', history, PAGES, 0, CTX, BUDGET);
    const last = plan.messages[plan.messages.length - 1];
    expect(last.role).toBe('user');
    expect(last.content).toContain('how many retries?');
    expect(plan.messages).toHaveLength(3);
  });

  it('includes the file name and the numbered section headings in the context block', () => {
    const plan = planChatTurn('retries', [], PAGES, 0, CTX, BUDGET);
    const block = plan.messages[plan.messages.length - 1].content;
    expect(block).toContain('handbook.md');
    expect(block).toContain('§02 Retries');
    expect(block).toContain('exponential backoff');
  });

  it('reports the sections it used, in document order', () => {
    const plan = planChatTurn('retries storage', [], PAGES, 0, CTX, BUDGET);
    const indexes = plan.usedSections.map((s) => s.pageIndex);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    expect(plan.usedSections.some((s) => s.title === 'Retries')).toBe(true);
  });

  it('always includes the active section, even when nothing matches', () => {
    const plan = planChatTurn('kubernetes', [], PAGES, 2, CTX, BUDGET);
    expect(plan.usedSections).toHaveLength(1);
    expect(plan.usedSections[0].title).toBe('Storage');
  });

  it('drops the oldest turns when history exceeds its budget, and counts them', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      text: `turn ${i} ${'x'.repeat(2000)}`,
    }));
    const plan = planChatTurn('retries', history, PAGES, 0, CTX, { sectionTokens: 6000, historyTokens: 1000 });
    expect(plan.droppedTurns).toBeGreaterThan(0);
    const kept = plan.messages.slice(0, -1).map((m) => m.content);
    expect(kept.some((c) => c.includes('turn 9'))).toBe(true);
    expect(kept.some((c) => c.includes('turn 0'))).toBe(false);
  });

  it('never sends more than MAX_CHAT_SECTIONS sections', () => {
    const many = Array.from({ length: 20 }, (_, i) => page(`S${i}`, 'retries retries retries'));
    const plan = planChatTurn('retries', [], many, 0, CTX, BUDGET);
    expect(plan.usedSections.length).toBeLessThanOrEqual(8);
  });

  it('stops adding sections once the section budget is spent', () => {
    const big = Array.from({ length: 6 }, (_, i) => page(`S${i}`, `retries ${'y'.repeat(8000)}`));
    const plan = planChatTurn('retries', [], big, 0, CTX, { sectionTokens: 4000, historyTokens: 2000 });
    expect(plan.usedSections.length).toBeLessThan(6);
  });
});
