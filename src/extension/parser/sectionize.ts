import { extractHeadings, buildTree, type Heading } from './headings';
import type { Page, SectionizeResult } from '../../shared/types';

export function resolveEffectiveLevel(headings: Heading[], desired: number): number {
  const present = new Set(headings.map((h) => h.level));
  if (present.size === 0) return desired;
  if (present.has(desired)) return desired;
  let best = desired;
  let bestDist = Infinity;
  for (const lvl of [...present].sort((a, b) => a - b)) {
    const dist = Math.abs(lvl - desired);
    if (dist < bestDist) {
      bestDist = dist;
      best = lvl; // ascending order → ties keep the shallower (smaller) level
    }
  }
  return best;
}

function wordCount(text: string): number {
  const stripped = text.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`~\-]/g, ' ');
  const words = stripped.split(/\s+/).filter(Boolean);
  return words.length;
}

export function sectionize(markdown: string, desiredLevel: number): SectionizeResult {
  const lines = markdown.split('\n');
  const headings = extractHeadings(markdown);
  const effectiveLevel = resolveEffectiveLevel(headings, desiredLevel);

  // Boundaries are headings at level <= effectiveLevel.
  const boundaries = headings.filter((h) => h.level <= effectiveLevel);

  const pages: Page[] = [];

  // Intro page: content before the first boundary.
  const firstBoundaryLine = boundaries.length > 0 ? boundaries[0].line : lines.length;
  const introText = lines.slice(0, firstBoundaryLine).join('\n');
  if (introText.trim().length > 0) {
    pages.push({
      id: 'page-intro',
      title: 'Introduction',
      level: 0,
      startLine: 0,
      endLine: firstBoundaryLine - 1,
      content: introText,
      wordCount: wordCount(introText),
    });
  }

  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i].line;
    const end = i + 1 < boundaries.length ? boundaries[i + 1].line - 1 : lines.length - 1;
    const content = lines.slice(start, end + 1).join('\n');
    pages.push({
      id: `page-${start}`,
      title: boundaries[i].title,
      level: boundaries[i].level,
      startLine: start,
      endLine: end,
      content,
      wordCount: wordCount(content),
    });
  }

  const pageIndexOf = (line: number): number => {
    for (let i = pages.length - 1; i >= 0; i--) {
      if (line >= pages[i].startLine) return i;
    }
    return 0;
  };

  const outline = buildTree(headings, pageIndexOf);
  return { outline, pages, effectiveLevel };
}
