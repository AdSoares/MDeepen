import type { Page } from './types';

export function progressPercent(activeIndex: number, total: number): number {
  if (total <= 1) return 0;
  return Math.round((activeIndex / (total - 1)) * 100);
}

export function readingMinutes(words: number, wpm = 220): number {
  if (words <= 0) return 0;
  return Math.max(1, Math.ceil(words / wpm));
}

export function remainingMinutes(pages: Page[], activeIndex: number, wpm = 220): number {
  let total = 0;
  for (let i = activeIndex; i < pages.length; i++) {
    total += readingMinutes(pages[i].wordCount, wpm);
  }
  return total;
}
