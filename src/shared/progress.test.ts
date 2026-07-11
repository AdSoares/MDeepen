import { describe, it, expect } from 'vitest';
import { progressPercent, readingMinutes, remainingMinutes } from './progress';
import type { Page } from './types';

const page = (words: number): Page => ({
  id: 'x', title: 't', level: 2, startLine: 0, endLine: 0, content: '', wordCount: words,
});

describe('progressPercent', () => {
  it('is 0 at the first of many', () => expect(progressPercent(0, 6)).toBe(0));
  it('is 100 at the last', () => expect(progressPercent(5, 6)).toBe(100));
  it('is 0 for a single page', () => expect(progressPercent(0, 1)).toBe(0));
});

describe('readingMinutes', () => {
  it('rounds up', () => expect(readingMinutes(230, 220)).toBe(2));
  it('is at least 1 for any words', () => expect(readingMinutes(5)).toBe(1));
  it('is 0 for no words', () => expect(readingMinutes(0)).toBe(0));
});

describe('remainingMinutes', () => {
  it('sums from the active page to the end', () => {
    const pages = [page(220), page(220), page(440)];
    expect(remainingMinutes(pages, 1, 220)).toBe(3); // 1 + 2
  });
});
