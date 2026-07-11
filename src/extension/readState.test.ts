import { describe, it, expect } from 'vitest';
import { remapReadIds } from './readState';
import type { Page } from '../shared/types';

const p = (id: string, title: string): Page => ({
  id, title, level: 2, startLine: 0, endLine: 0, content: '', wordCount: 0,
});

describe('remapReadIds', () => {
  it('keeps ids that still exist', () => {
    const pages = [p('page-0', 'A'), p('page-5', 'B')];
    expect(remapReadIds(['page-0'], pages, pages)).toEqual(['page-0']);
  });
  it('remaps a shifted id by title', () => {
    const before = [p('page-0', 'A'), p('page-5', 'B')];
    const after = [p('page-0', 'A'), p('page-7', 'B')];
    expect(remapReadIds(['page-5'], before, after)).toEqual(['page-7']);
  });
  it('drops ids whose section disappeared', () => {
    const before = [p('page-0', 'A'), p('page-5', 'B')];
    const after = [p('page-0', 'A')];
    expect(remapReadIds(['page-5'], before, after)).toEqual([]);
  });
  it('dedupes and orders by new page order', () => {
    const before = [p('page-0', 'A'), p('page-5', 'B')];
    const after = [p('page-2', 'B'), p('page-9', 'A')];
    expect(remapReadIds(['page-5', 'page-0', 'page-5'], before, after)).toEqual(['page-2', 'page-9']);
  });
});
