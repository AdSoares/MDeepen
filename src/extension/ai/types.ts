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
  testConnection(): Promise<ConnectionResult>;
}

export interface AiConfig {
  provider: 'anthropic';
  model: string;
  maxTokens: number;
}

export const DEFAULT_AI_CONFIG: AiConfig = { provider: 'anthropic', model: 'claude-opus-4-8', maxTokens: 4096 };
export const AI_MODELS = ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5'] as const;

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
