import type { OutlineNode } from '../../shared/types';

export function filterOutline(nodes: OutlineNode[], query: string): OutlineNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const walk = (list: OutlineNode[]): OutlineNode[] => {
    const out: OutlineNode[] = [];
    for (const n of list) {
      const kids = walk(n.children);
      if (n.title.toLowerCase().includes(q) || kids.length > 0) {
        out.push({ ...n, children: kids });
      }
    }
    return out;
  };
  return walk(nodes);
}
