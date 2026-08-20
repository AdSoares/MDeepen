import { describe, it, expect } from 'vitest';
import { planDocumentSummary } from './documentPlan';
import type { Page } from '../../shared/types';

function page(title: string, content: string): Page {
  return { id: title, title, level: 2, startLine: 0, endLine: 1, content, wordCount: 1 };
}

/** estimateTokens is chars/4, so 400 characters is 100 tokens. */
const chars = (tokens: number) => 'x'.repeat(tokens * 4);

describe('planDocumentSummary', () => {
  it('returns an empty plan for an empty document', () => {
    const plan = planDocumentSummary([], 100);
    expect(plan.steps).toEqual([]);
    expect(plan.sectionCount).toBe(0);
    expect(plan.estInputTokens).toBe(0);
    expect(plan.truncated).toEqual([]);
  });

  it('puts a single small section in one step', () => {
    const plan = planDocumentSummary([page('A', 'short')], 100);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].titles).toEqual(['A']);
    expect(plan.steps[0].content).toContain('short');
    expect(plan.sectionCount).toBe(1);
  });

  it('groups consecutive small sections into one step', () => {
    const plan = planDocumentSummary([page('A', 'a'), page('B', 'b'), page('C', 'c')], 100);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].titles).toEqual(['A', 'B', 'C']);
  });

  it('splits into more steps once the budget is exceeded, preserving order', () => {
    const pages = [page('A', chars(60)), page('B', chars(60)), page('C', chars(60))];
    const plan = planDocumentSummary(pages, 100);
    expect(plan.steps.length).toBeGreaterThan(1);
    expect(plan.steps.flatMap((s) => s.titles)).toEqual(['A', 'B', 'C']);
    for (const step of plan.steps) expect(step.estTokens).toBeLessThanOrEqual(100);
  });

  it('truncates a section that cannot fit alone, and names it', () => {
    const plan = planDocumentSummary([page('Huge', chars(500))], 100);
    expect(plan.truncated).toEqual(['Huge']);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].estTokens).toBeLessThanOrEqual(100);
  });

  it('keeps an oversized section in its own step, not merged with its neighbours', () => {
    const plan = planDocumentSummary([page('A', 'a'), page('Huge', chars(500)), page('B', 'b')], 100);
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[1].titles).toEqual(['Huge']);
  });

  it('projects the reduce input on top of the map total', () => {
    const plan = planDocumentSummary([page('A', chars(50))], 100);
    const mapTokens = plan.steps.reduce((n, s) => n + s.estTokens, 0);
    expect(plan.estInputTokens).toBeGreaterThan(mapTokens);
  });
});
