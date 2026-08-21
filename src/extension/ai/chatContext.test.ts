import { describe, it, expect } from 'vitest';
import { rankSections } from './chatContext';
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
