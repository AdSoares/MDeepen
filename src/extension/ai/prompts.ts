import type { AiActionKind, AiRequest, AiScope } from './types';

interface ActionContext {
  title: string;
  content: string;
}

const GROUNDING = 'Do not invent facts that are not present in the supplied text. Respond in the language of the supplied text.';

const scopeWord = (scope: AiScope): string => (scope === 'selection' ? 'excerpt' : 'section');

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

/** @deprecated Transitional shim; removed once the controller migrates to buildActionRequest. */
export function buildSummarizeRequest(section: { title: string; content: string }, maxTokens: number) {
  return buildActionRequest('summarize', 'section', section, maxTokens);
}
