import { describe, it, expect } from 'vitest';
import { runDocumentSummary } from './documentRun';
import type { DocumentPlan } from './documentPlan';
import type { AiChunk, AiConfig, AiProvider, AiRequest } from './types';

const CFG: AiConfig = { provider: 'anthropic', model: 'claude-opus-4-8', maxTokens: 1024 };

const PLAN: DocumentPlan = {
  steps: [
    { titles: ['A'], content: 'alpha body', estTokens: 3 },
    { titles: ['B'], content: 'beta body', estTokens: 3 },
  ],
  sectionCount: 2,
  estInputTokens: 600,
  truncated: [],
};

/** Replays one scripted response per call and records every request it received. */
function fakeProvider(script: AiChunk[][]): { provider: AiProvider; seen: AiRequest[] } {
  const seen: AiRequest[] = [];
  let call = 0;
  const provider: AiProvider = {
    async *generate(request, _signal) {
      seen.push(request);
      for (const chunk of script[call] ?? []) yield chunk;
      call++;
    },
    async testConnection() { return { ok: true, ms: 1 }; },
  };
  return { provider, seen };
}

const ok = (text: string, inputTokens = 10, outputTokens = 5): AiChunk[] => [
  { type: 'text', text },
  { type: 'done', usage: { inputTokens, outputTokens } },
];

async function collect(it: AsyncIterable<AiChunk>): Promise<AiChunk[]> {
  const out: AiChunk[] = [];
  for await (const c of it) out.push(c);
  return out;
}

describe('runDocumentSummary', () => {
  it('reports progress for every part, then streams only the reduce', async () => {
    const { provider } = fakeProvider([ok('condensed A'), ok('condensed B'), ok('final answer')]);
    const chunks = await collect(runDocumentSummary(PLAN, 'summarizeShort', { fileName: 'doc.md' }, CFG, provider, new AbortController().signal));

    expect(chunks.filter((c) => c.type === 'progress')).toEqual([
      { type: 'progress', done: 0, total: 2 },
      { type: 'progress', done: 1, total: 2 },
      { type: 'progress', done: 2, total: 2 },
    ]);
    const text = chunks.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text);
    expect(text).toEqual(['final answer']);
  });

  it('feeds every condensation into the reduce request', async () => {
    const { provider, seen } = fakeProvider([ok('condensed A'), ok('condensed B'), ok('final')]);
    await collect(runDocumentSummary(PLAN, 'keyPoints', { fileName: 'doc.md' }, CFG, provider, new AbortController().signal));

    expect(seen).toHaveLength(3);
    expect(seen[0].messages[0].content).toContain('alpha body');
    expect(seen[1].messages[0].content).toContain('beta body');
    expect(seen[2].messages[0].content).toContain('condensed A');
    expect(seen[2].messages[0].content).toContain('condensed B');
    expect(seen[2].messages[0].content).toContain('doc.md');
  });

  it('sums usage across map and reduce', async () => {
    const { provider } = fakeProvider([ok('a', 10, 5), ok('b', 20, 7), ok('final', 30, 11)]);
    const chunks = await collect(runDocumentSummary(PLAN, 'summarizeShort', { fileName: 'doc.md' }, CFG, provider, new AbortController().signal));
    const done = chunks.find((c) => c.type === 'done') as { usage: { inputTokens: number; outputTokens: number } };
    expect(done.usage).toEqual({ inputTokens: 60, outputTokens: 23 });
  });

  it('ends the run on a map error and never reaches the reduce', async () => {
    const { provider, seen } = fakeProvider([ok('a'), [{ type: 'error', kind: 'rate_limit', message: 'slow down' }]]);
    const chunks = await collect(runDocumentSummary(PLAN, 'summarizeShort', { fileName: 'doc.md' }, CFG, provider, new AbortController().signal));

    expect(chunks.some((c) => c.type === 'error')).toBe(true);
    expect(chunks.some((c) => c.type === 'done')).toBe(false);
    expect(seen).toHaveLength(2);
  });

  it('stops when aborted mid-map, leaving the reduce unsent', async () => {
    const abort = new AbortController();
    const { provider, seen } = fakeProvider([ok('a'), ok('b'), ok('final')]);
    const out: AiChunk[] = [];
    for await (const c of runDocumentSummary(PLAN, 'summarizeShort', { fileName: 'doc.md' }, CFG, provider, abort.signal)) {
      out.push(c);
      if (seen.length === 1) abort.abort();
    }
    expect(seen).toHaveLength(1);
    expect(out.some((c) => c.type === 'done')).toBe(false);
  });
});
