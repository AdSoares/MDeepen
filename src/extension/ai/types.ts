export type AiErrorKind = 'auth' | 'rate_limit' | 'connection' | 'unknown';

export interface AiRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
}

export type AiChunk =
  | { type: 'text'; text: string }
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; usage: { inputTokens: number; outputTokens: number } }
  | { type: 'error'; kind: AiErrorKind; message: string };

export interface ConnectionResult {
  ok: boolean;
  ms: number;
  error?: string;
}

export interface AiProvider {
  generate(request: AiRequest, signal: AbortSignal): AsyncIterable<AiChunk>;
  /** What this provider currently offers. The list is shown whole rather than filtered: a
   *  `gpt-*` rule would be the same guess as a hardcoded list, ageing the same way, hidden. */
  listModels(): Promise<string[]>;
  testConnection(): Promise<ConnectionResult>;
}

import type { TokenField } from './openAiRequest';

export type ProviderId = 'anthropic' | 'openai' | 'compatible';

export interface ProviderMeta {
  label: string;
  /** For `compatible`, a prefix: the stored name carries the origin, so a key never travels to a
   *  host it was not pasted for. */
  secretKey: string;
  /** A compatible endpoint works without one: Ollama and LM Studio take no key. */
  requiresKey: boolean;
  models: readonly string[];
  defaultModel: string;
  /** USD per 1M input tokens. A model may be absent: the estimate then reports the cost as
   *  unknown rather than inventing a number. */
  inputPricePerM: Record<string, number>;
  /** Undefined means the SDK's own default. Set it to reach an OpenAI-compatible runtime. */
  defaultBaseUrl?: string;
  /** Which field carries the token cap, for the OpenAI-shaped providers. */
  tokenField?: TokenField;
}

export interface AiConfig {
  provider: ProviderId;
  model: string;
  maxTokens: number;
  baseUrl?: string;
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  anthropic: {
    label: 'Anthropic',
    secretKey: 'mdeepen.anthropic.apiKey',
    requiresKey: true,
    models: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5'],
    defaultModel: 'claude-opus-4-8',
    inputPricePerM: { 'claude-opus-4-8': 5, 'claude-sonnet-5': 3, 'claude-haiku-4-5': 1 },
  },
  openai: {
    label: 'OpenAI',
    secretKey: 'mdeepen.openai.apiKey',
    requiresKey: true,
    // Curated from the account's own /v1/models listing on 2026-08-23. Prices are not filled in:
    // none were looked up, and an invented figure would be shown to the user as a cost.
    models: ['gpt-5.5', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.3-chat-latest', 'gpt-4o-mini'],
    defaultModel: 'gpt-5.5',
    inputPricePerM: {},
    tokenField: 'max_completion_tokens',
  },
  compatible: {
    label: 'OpenAI-compatible endpoint',
    secretKey: 'mdeepen.compatible.apiKey',
    requiresKey: false,
    // No curated list: the endpoint is whatever the user points at. Models come from /models or
    // are typed by hand; prices are unknown for a remote one and zero for a local one.
    models: [],
    defaultModel: '',
    inputPricePerM: {},
    defaultBaseUrl: 'http://localhost:11434/v1',
    // A guess about runtimes this extension has not been run against until the 2.6 smoke.
    tokenField: 'max_tokens',
  },
};

export const DEFAULT_AI_CONFIG: AiConfig = {
  provider: 'anthropic',
  model: PROVIDERS.anthropic.defaultModel,
  maxTokens: 4096,
};

export type AiActionKind =
  | 'summarize' | 'explain' | 'explainSimply' | 'keyTerms' | 'example'
  | 'summarizeShort' | 'summarizeExecutive' | 'summarizeTechnical' | 'keyPoints'
  | 'diagramFlowchart' | 'diagramSequence' | 'diagramMindmap' | 'diagramState';
export type AiScope = 'section' | 'selection' | 'document';

export const SECTION_ACTIONS: readonly AiActionKind[] = ['summarize', 'explain', 'explainSimply', 'keyTerms', 'example'];
export const DOCUMENT_ACTIONS: readonly AiActionKind[] = ['summarizeShort', 'summarizeExecutive', 'summarizeTechnical', 'keyPoints'];
export const DIAGRAM_ACTIONS: readonly AiActionKind[] = ['diagramFlowchart', 'diagramSequence', 'diagramMindmap', 'diagramState'];
export const AI_ACTIONS: readonly AiActionKind[] = [...SECTION_ACTIONS, ...DOCUMENT_ACTIONS, ...DIAGRAM_ACTIONS];

export type DiagramKind = 'flowchart' | 'sequence' | 'mindmap' | 'state';

export const DIAGRAM_ACTION_BY_KIND: Record<DiagramKind, AiActionKind> = {
  flowchart: 'diagramFlowchart',
  sequence: 'diagramSequence',
  mindmap: 'diagramMindmap',
  state: 'diagramState',
};

export const DIAGRAM_KIND_BY_ACTION: Record<string, DiagramKind> = {
  diagramFlowchart: 'flowchart',
  diagramSequence: 'sequence',
  diagramMindmap: 'mindmap',
  diagramState: 'state',
};

/** A map step is capped well below the model limit: a 20:1 squeeze loses the detail the
 *  technical summary needs, while one call per section would cost sixty-one requests. */
export const MAP_STEP_BUDGET_TOKENS = 4_000;
export const MAP_SUMMARY_TARGET_WORDS = 200;
export const MAX_MAP_STEPS = 40;

/** Sections claim the budget before history: the document is the source of truth and the
 *  conversation is secondary context. */
export const CHAT_SECTION_BUDGET_TOKENS = 6_000;
export const CHAT_HISTORY_BUDGET_TOKENS = 2_000;
export const MAX_CHAT_SECTIONS = 8;
