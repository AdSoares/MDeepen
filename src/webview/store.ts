import type { HostToWebview } from '../shared/messages';
import type { OutlineNode, Page, ReaderConfig } from '../shared/types';
import { DEFAULT_CONFIG, DEFAULT_PANELS } from '../shared/defaults';
import type { AiActionKind, AiScope } from '../extension/ai/types';

export interface AiSource {
  title: string;
  pageIndex: number;
}

export type AiPending =
  | { kind: 'action'; action: AiActionKind; scope: AiScope; sectionTitle: string; pageIndex: number; excerpt?: string; truncated?: string[] }
  | { kind: 'chat'; question: string; sources: AiSource[]; droppedTurns: number };

/** An entry is a pending run plus the text that arrived, which is exactly how finalizeStream
 *  builds it — so the union propagates for free. */
export type AiMessage = AiPending & { text: string };

export interface AiState {
  configured: boolean;
  provider: string;
  model: string;
  streaming: boolean;
  streamText: string;
  pending: AiPending;
  progress?: { done: number; total: number };
  messages: AiMessage[];
  error?: { kind: string; message: string };
  confirm?: Omit<Extract<HostToWebview, { type: 'aiConfirmNeeded' }>, 'type'>;
  connection?: { ok: boolean; ms: number; error?: string };
}

export interface ReaderState {
  fileName: string;
  pages: Page[];
  outline: OutlineNode[];
  effectiveLevel: number;
  activeIndex: number;
  config: ReaderConfig;
  readIds: Set<string>;
  panels: { outlineVisible: boolean; aiVisible: boolean; outlineWidth: number; aiWidth: number; focus: boolean };
  ai: AiState;
}

const initialAi: AiState = {
  configured: false, provider: 'anthropic', model: '',
  streaming: false, streamText: '',
  pending: { kind: 'action', action: 'summarize', scope: 'section', sectionTitle: '', pageIndex: -1 },
  messages: [],
};

const initial: ReaderState = {
  fileName: '', pages: [], outline: [], effectiveLevel: 2, activeIndex: 0,
  readIds: new Set(),
  config: { ...DEFAULT_CONFIG },
  panels: { ...DEFAULT_PANELS, focus: false },
  ai: { ...initialAi },
};

const clamp = (i: number, len: number): number => Math.min(Math.max(i, 0), Math.max(0, len - 1));

const EXCERPT_MAX = 240;

/** Ends a stream, keeping whatever text arrived so a partial answer is never thrown away. */
function finalizeStream(ai: AiState): AiState {
  const messages = ai.streamText
    ? [...ai.messages, { text: ai.streamText, ...ai.pending }]
    : ai.messages;
  return { ...ai, streaming: false, streamText: '', progress: undefined, messages };
}

export function createReaderState() {
  let state: ReaderState = { ...initial };
  const subs = new Set<(s: ReaderState) => void>();
  const emit = () => subs.forEach((f) => f(state));

  return {
    get: () => state,
    subscribe(fn: (s: ReaderState) => void) { subs.add(fn); return () => subs.delete(fn); },
    setActiveIndex(index: number) {
      state = { ...state, activeIndex: clamp(index, state.pages.length) };
      emit();
    },
    setPanels(patch: Partial<ReaderState['panels']>) {
      state = { ...state, panels: { ...state.panels, ...patch } };
      emit();
    },
    setConfig(config: ReaderConfig) { state = { ...state, config }; emit(); },
    applyInit(m: Extract<HostToWebview, { type: 'init' }>) {
      state = {
        ...state, fileName: m.fileName, pages: m.pages, outline: m.outline,
        effectiveLevel: m.effectiveLevel, config: m.config,
        activeIndex: clamp(m.restoredIndex, m.pages.length),
        readIds: new Set(m.readIds),
        panels: { ...m.panels, focus: false },
      };
      emit();
    },
    applyUpdate(m: Extract<HostToWebview, { type: 'sectionsUpdated' }>) {
      state = {
        ...state, pages: m.pages, outline: m.outline, effectiveLevel: m.effectiveLevel,
        activeIndex: clamp(m.keepIndex, m.pages.length),
        readIds: new Set(m.readIds),
      };
      emit();
    },
    aiConfigState(configured: boolean, provider: string, model: string) {
      // Losing the key invalidates any connection result still on screen.
      const connection = configured ? state.ai.connection : undefined;
      state = { ...state, ai: { ...state.ai, configured, provider, model, connection } };
      emit();
    },
    aiStreamStart(meta: AiPending) {
      const pending: AiPending = meta.kind === 'action' && meta.excerpt && meta.excerpt.length > EXCERPT_MAX
        ? { ...meta, excerpt: `${meta.excerpt.slice(0, EXCERPT_MAX)}…` }
        : meta;
      state = { ...state, ai: { ...state.ai, streaming: true, streamText: '', progress: undefined, pending, error: undefined } };
      emit();
    },
    /** Sources belong to a chat turn; an action that is streaming has its own provenance already. */
    aiSources(sources: AiSource[], droppedTurns: number) {
      if (state.ai.pending.kind !== 'chat') return;
      state = { ...state, ai: { ...state.ai, pending: { ...state.ai.pending, sources, droppedTurns } } };
      emit();
    },
    aiDeleteMessage(index: number) {
      if (index < 0 || index >= state.ai.messages.length) return;
      const messages = state.ai.messages.filter((_, i) => i !== index);
      state = { ...state, ai: { ...state.ai, messages } };
      emit();
    },
    aiClearMessages() {
      state = { ...state, ai: { ...state.ai, messages: [] } };
      emit();
    },
    aiProgress(done: number, total: number) {
      state = { ...state, ai: { ...state.ai, progress: { done, total } } };
      emit();
    },
    aiChunk(text: string) {
      // The first token means the map is over and the reduce has begun.
      state = { ...state, ai: { ...state.ai, progress: undefined, streamText: state.ai.streamText + text } };
      emit();
    },
    aiDone() {
      state = { ...state, ai: finalizeStream(state.ai) };
      emit();
    },
    /** The host aborts silently on stop, so the webview closes out its own streaming state. */
    aiStopped() {
      state = { ...state, ai: finalizeStream(state.ai) };
      emit();
    },
    aiError(kind: string, message: string) {
      state = { ...state, ai: { ...finalizeStream(state.ai), error: { kind, message } } };
      emit();
    },
    aiConfirm(confirm: AiState['confirm']) {
      state = { ...state, ai: { ...state.ai, confirm } };
      emit();
    },
    aiConnection(connection: AiState['connection']) {
      state = { ...state, ai: { ...state.ai, connection } };
      emit();
    },
    markRead(id: string) {
      if (state.readIds.has(id)) return;
      const readIds = new Set(state.readIds);
      readIds.add(id);
      state = { ...state, readIds };
      emit();
    },
  };
}
