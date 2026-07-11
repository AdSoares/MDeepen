import type { Page } from '../shared/types';

export function classifyLink(href: string): 'external' | 'anchor' | 'local' {
  if (/^(https?:|mailto:)/i.test(href)) return 'external';
  if (href.startsWith('#')) return 'anchor';
  return 'local';
}

export function reconcileIndex(oldPages: Page[], newPages: Page[], oldIndex: number): number {
  if (newPages.length === 0) return 0;
  const active = oldPages[oldIndex];
  if (active) {
    let match = newPages.findIndex((p) => p.id === active.id);
    if (match === -1) match = newPages.findIndex((p) => p.title === active.title);
    if (match !== -1) return match;
  }
  return Math.min(Math.max(oldIndex, 0), newPages.length - 1);
}
