import type { OutlineNode } from '../shared/types';

export interface Crumb {
  title: string;
  pageIndex: number;
}

/**
 * The chain of headings above the section a page belongs to, so a reader deep in a document can
 * see what it sits under.
 *
 * The page's owner is the first node found in document order whose `pageIndex` matches — parents
 * are visited before children, so that is the shallowest heading on the page, which is the one
 * that named it. The owner itself is never included: the reader already shows its title.
 *
 * A page no heading owns, such as an intro before the first title, has no chain.
 */
export function breadcrumbFor(outline: OutlineNode[], pageIndex: number): Crumb[] {
  const walk = (nodes: OutlineNode[], trail: Crumb[]): Crumb[] | undefined => {
    for (const n of nodes) {
      if (n.pageIndex === pageIndex) return trail;
      const found = walk(n.children, [...trail, { title: n.title, pageIndex: n.pageIndex }]);
      if (found) return found;
    }
    return undefined;
  };
  return walk(outline, []) ?? [];
}
