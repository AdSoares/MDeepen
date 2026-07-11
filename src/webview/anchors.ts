import type { OutlineNode } from '../shared/types';

/** GitHub-style slug: lowercase, trim, strip non-word (keep spaces/hyphens), spaces → hyphens. */
export function slugify(title: string): string {
  return title.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
}

export function findBySlug(nodes: OutlineNode[], slug: string): OutlineNode | undefined {
  for (const n of nodes) {
    if (slugify(n.title) === slug) return n;
    const child = findBySlug(n.children, slug);
    if (child) return child;
  }
  return undefined;
}
