import type { AiActionKind, AiRequest, AiScope } from './types';
import { MAP_SUMMARY_TARGET_WORDS } from './types';

interface ActionContext {
  title: string;
  content: string;
}

const GROUNDING = 'Do not invent facts that are not present in the supplied text. Respond in the language of the supplied text.';

const scopeWord = (scope: AiScope): string =>
  scope === 'selection' ? 'excerpt' : scope === 'document' ? 'document' : 'section';

const ACTIONS: Record<AiActionKind, { label: string; system: string; user: (ctx: ActionContext, scope: AiScope) => string }> = {
  summarize: {
    label: 'Summarize',
    system: `You summarize part of a Markdown document for a technical reader. Produce a concise summary of 3-5 sentences capturing the key points. ${GROUNDING}`,
    user: (ctx, scope) => `Summarize this ${scopeWord(scope)} from "${ctx.title}":\n\n${ctx.content}`,
  },
  explain: {
    label: 'Explain',
    system: `You explain part of a Markdown document to a working software engineer. Say what it means, why it matters, and what it implies in practice. ${GROUNDING}`,
    user: (ctx, scope) => `Explain this ${scopeWord(scope)} from "${ctx.title}":\n\n${ctx.content}`,
  },
  explainSimply: {
    label: 'Explain simply',
    system: `You explain part of a Markdown document in plain language, assuming no domain knowledge. Avoid jargon; when a technical term is unavoidable, define it in the same sentence. ${GROUNDING}`,
    user: (ctx, scope) => `Explain this ${scopeWord(scope)} from "${ctx.title}" in plain language:\n\n${ctx.content}`,
  },
  keyTerms: {
    label: 'Key terms',
    system: `You identify the important terms in part of a Markdown document. Return a short list; each entry is the term followed by a one-sentence definition grounded in this text. ${GROUNDING}`,
    user: (ctx, scope) => `List the important terms in this ${scopeWord(scope)} from "${ctx.title}":\n\n${ctx.content}`,
  },
  example: {
    label: 'Create an example',
    system: `You illustrate part of a Markdown document with one concrete example. Prefer a short code snippet or a worked case over prose. State any assumption the example makes. ${GROUNDING}`,
    user: (ctx, scope) => `Give one concrete example illustrating this ${scopeWord(scope)} from "${ctx.title}":\n\n${ctx.content}`,
  },
  summarizeShort: {
    label: 'Short summary',
    system: `You summarize a whole Markdown document for a technical reader. Produce 3-5 sentences that convey what the document is about and how it is organised. ${GROUNDING}`,
    user: (ctx, scope) => `Write a short summary of this ${scopeWord(scope)}, "${ctx.title}":\n\n${ctx.content}`,
  },
  summarizeExecutive: {
    label: 'Executive summary',
    system: `You summarize a whole Markdown document for a decision maker. Lead with decisions, outcomes and their implications; leave out implementation detail. ${GROUNDING}`,
    user: (ctx, scope) => `Write an executive summary of this ${scopeWord(scope)}, "${ctx.title}":\n\n${ctx.content}`,
  },
  summarizeTechnical: {
    label: 'Technical summary',
    system: `You summarize a whole Markdown document for an engineer who will work on it. Preserve mechanisms, constraints, interfaces and numbers; prefer specifics over generalities. ${GROUNDING}`,
    user: (ctx, scope) => `Write a technical summary of this ${scopeWord(scope)}, "${ctx.title}":\n\n${ctx.content}`,
  },
  keyPoints: {
    label: 'Key points',
    system: `You extract the load-bearing claims of a whole Markdown document. Return a list; each entry is one claim the document actually makes, stated in one sentence. ${GROUNDING}`,
    user: (ctx, scope) => `List the key points of this ${scopeWord(scope)}, "${ctx.title}":\n\n${ctx.content}`,
  },
};

export function actionLabel(action: AiActionKind): string {
  return ACTIONS[action].label;
}

export function isActionKind(value: unknown): value is AiActionKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ACTIONS, value);
}

export function buildActionRequest(action: AiActionKind, scope: AiScope, ctx: ActionContext, maxTokens: number): AiRequest {
  const entry = ACTIONS[action];
  return {
    system: entry.system,
    messages: [{ role: 'user', content: entry.user(ctx, scope) }],
    maxTokens,
  };
}

/** Condenses one map step. Deliberately neutral: the requested style is applied once, at the
 *  reduce. A styled map would style already-styled text, and detail dropped here never returns.
 *  Not a member of AI_ACTIONS — the user never picks it. */
export function buildMapRequest(step: { titles: string[]; content: string }, maxTokens: number): AiRequest {
  return {
    system: `You condense part of a Markdown document. Preserve the claims, numbers and terms it contains, in the order it makes them. Do not editorialise, rank or conclude. Aim for about ${MAP_SUMMARY_TARGET_WORDS} words. ${GROUNDING}`,
    messages: [{
      role: 'user',
      content: `Condense this part of the document, covering ${step.titles.join(', ')}:\n\n${step.content}`,
    }],
    maxTokens,
  };
}
