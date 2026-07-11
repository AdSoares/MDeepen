import { describe, it, expect } from 'vitest';
import { slugify, findBySlug } from './anchors';
import type { OutlineNode } from '../shared/types';

const node = (title: string, pageIndex: number, children: OutlineNode[] = []): OutlineNode => ({
  id: title, title, level: 2, line: 0, pageIndex, children,
});

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => expect(slugify('Data Flow')).toBe('data-flow'));
  it('strips punctuation', () => expect(slugify('Retries & Backoff!')).toBe('retries-backoff'));
  it('keeps existing hyphens', () => expect(slugify('auto-update')).toBe('auto-update'));
});

describe('findBySlug', () => {
  it('finds a nested node by slug', () => {
    const tree = [node('Intro', 0), node('Core', 1, [node('Data Flow', 2)])];
    expect(findBySlug(tree, 'data-flow')?.pageIndex).toBe(2);
  });
  it('returns undefined for no match', () => {
    expect(findBySlug([node('Intro', 0)], 'nope')).toBeUndefined();
  });
});
