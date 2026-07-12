import type { Page } from '../shared/types';

export function classifyLink(href: string): 'external' | 'anchor' | 'local' | 'blocked' {
  if (/^(https?:|mailto:)/i.test(href)) return 'external';
  if (href.startsWith('#')) return 'anchor';
  // A URL scheme is letter followed by letters/digits/+/-/. then ':'. A single
  // letter + ':' (e.g. Windows drive C:) is NOT a scheme in this heuristic.
  const scheme = /^([a-z][a-z0-9+.-]+):/i.exec(href);
  if (scheme) return 'blocked';
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
