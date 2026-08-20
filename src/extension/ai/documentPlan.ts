import type { Page } from '../../shared/types';
import { estimateTokens } from './costEstimate';
import { MAP_SUMMARY_TARGET_WORDS } from './types';

export interface MapStep {
  titles: string[];
  content: string;
  estTokens: number;
}

export interface DocumentPlan {
  steps: MapStep[];
  sectionCount: number;
  estInputTokens: number;
  truncated: string[];
}

/** Roughly 1.35 tokens per English word, which is what the reduce reads back per part. */
const REDUCE_TOKENS_PER_STEP = Math.ceil(MAP_SUMMARY_TARGET_WORDS * 1.35);

const JOIN = '\n\n';

/**
 * Groups consecutive sections into steps that fit the budget. A step is a group, not a section:
 * a document with sixty short sections must not cost sixty-one requests. Grouping is greedy and
 * sequential, so document order is preserved and a part never mixes distant material.
 */
export function planDocumentSummary(pages: Page[], budgetTokens: number): DocumentPlan {
  const steps: MapStep[] = [];
  const truncated: string[] = [];
  let open: { titles: string[]; content: string } | undefined;

  const flush = () => {
    if (!open) return;
    steps.push({ titles: open.titles, content: open.content, estTokens: estimateTokens(open.content) });
    open = undefined;
  };

  for (const p of pages) {
    // A section too large to fit alone is truncated and named, rather than silently shortening
    // the coverage the answer claims.
    if (estimateTokens(p.content) > budgetTokens) {
      flush();
      const content = p.content.slice(0, budgetTokens * 4);
      truncated.push(p.title);
      steps.push({ titles: [p.title], content, estTokens: estimateTokens(content) });
      continue;
    }
    const candidate = open ? `${open.content}${JOIN}${p.content}` : p.content;
    if (open && estimateTokens(candidate) > budgetTokens) {
      flush();
      open = { titles: [p.title], content: p.content };
    } else {
      open = { titles: [...(open?.titles ?? []), p.title], content: candidate };
    }
  }
  flush();

  const mapTokens = steps.reduce((n, s) => n + s.estTokens, 0);
  return {
    steps,
    sectionCount: pages.length,
    estInputTokens: mapTokens + steps.length * REDUCE_TOKENS_PER_STEP,
    truncated,
  };
}
