import type { DocumentPlan } from './documentPlan';
import { buildActionRequest, buildMapRequest } from './prompts';
import type { AiActionKind, AiChunk, AiConfig, AiProvider } from './types';

/**
 * Map-reduce over a planned document. Yields the same AiChunk union a provider yields, plus
 * `progress`, so the controller can consume a twelve-part run through the identical loop it uses
 * for a single request — one abort path, one error path, one posting path.
 *
 * Map output is accumulated internally and never yielded as text: only the reduce streams.
 */
export async function* runDocumentSummary(
  plan: DocumentPlan,
  action: AiActionKind,
  ctx: { fileName: string },
  cfg: AiConfig,
  provider: AiProvider,
  signal: AbortSignal,
): AsyncIterable<AiChunk> {
  const condensed: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (let i = 0; i < plan.steps.length; i++) {
    if (signal.aborted) return;
    yield { type: 'progress', done: i, total: plan.steps.length };
    // Re-checked after the yield: the consumer may have aborted while holding this chunk.
    if (signal.aborted) return;

    const step = plan.steps[i];
    let text = '';
    for await (const chunk of provider.generate(buildMapRequest(step, cfg.maxTokens), signal)) {
      if (chunk.type === 'text') text += chunk.text;
      else if (chunk.type === 'done') { inputTokens += chunk.usage.inputTokens; outputTokens += chunk.usage.outputTokens; }
      else if (chunk.type === 'error') { yield chunk; return; }
    }
    if (signal.aborted) return;
    condensed.push(`## ${step.titles.join(' · ')}\n\n${text}`);
  }

  if (signal.aborted) return;
  yield { type: 'progress', done: plan.steps.length, total: plan.steps.length };
  if (signal.aborted) return;

  // The style is applied here, once, through the ordinary registry.
  const request = buildActionRequest(action, 'document', { title: ctx.fileName, content: condensed.join('\n\n') }, cfg.maxTokens);
  for await (const chunk of provider.generate(request, signal)) {
    if (chunk.type === 'done') {
      yield { type: 'done', usage: { inputTokens: inputTokens + chunk.usage.inputTokens, outputTokens: outputTokens + chunk.usage.outputTokens } };
    } else {
      yield chunk;
    }
  }
}
