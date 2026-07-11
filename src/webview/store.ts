import type { HostToWebview } from '../shared/messages';
import type { OutlineNode, Page, ReaderConfig } from '../shared/types';
import { DEFAULT_CONFIG, DEFAULT_PANELS } from '../shared/defaults';

export interface ReaderState {
  fileName: string;
  pages: Page[];
  outline: OutlineNode[];
  effectiveLevel: number;
  activeIndex: number;
  config: ReaderConfig;
  readIds: Set<string>;
  panels: { outlineVisible: boolean; aiVisible: boolean; outlineWidth: number; aiWidth: number; focus: boolean };
}

const initial: ReaderState = {
  fileName: '', pages: [], outline: [], effectiveLevel: 2, activeIndex: 0,
  readIds: new Set(),
  config: { ...DEFAULT_CONFIG },
  panels: { ...DEFAULT_PANELS, focus: false },
};

const clamp = (i: number, len: number): number => Math.min(Math.max(i, 0), Math.max(0, len - 1));

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
    markRead(id: string) {
      if (state.readIds.has(id)) return;
      const readIds = new Set(state.readIds);
      readIds.add(id);
      state = { ...state, readIds };
      emit();
    },
  };
}
