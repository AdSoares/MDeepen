import type { OutlineNode } from '../../shared/types';

export interface Heading {
  level: number;
  title: string;
  line: number;
}

const ATX = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^(\s*)(```|~~~)/;

export function extractHeadings(markdown: string): Heading[] {
  const lines = markdown.split('\n');
  const headings: Heading[] = [];
  let inFence = false;
  let fenceMarker = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[2];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;
    const m = ATX.exec(line);
    if (m) {
      headings.push({ level: m[1].length, title: m[2].trim(), line: i });
    }
  }
  return headings;
}

export function buildTree(headings: Heading[], pageIndexOf: (line: number) => number): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  for (const h of headings) {
    const node: OutlineNode = {
      id: `sec-${h.line}`,
      title: h.title,
      level: h.level,
      line: h.line,
      pageIndex: pageIndexOf(h.line),
      children: [],
    };
    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }
  return roots;
}
