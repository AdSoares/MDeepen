import type { PanelsState, ReaderConfig } from '../../shared/types';

export interface MementoLike {
  get<T>(key: string, defaultValue?: T): T;
  update(key: string, value: unknown): Thenable<void>;
}

const DOC_KEY = 'mdeepen.docState';
const LEGACY_POSITIONS_KEY = 'mdeepen.positions';
const UI_KEY = 'mdeepen.uiState';

export interface ReadMark {
  id: string;
  title: string;
}

export interface DocState {
  index: number;
  read: ReadMark[];
}

/** Old persisted shape, kept only for backward-compat normalization. */
interface LegacyDocState {
  index: number;
  readIds?: string[];
}

export class DocStateStore {
  constructor(private readonly memento: MementoLike) {}

  private all(): Record<string, DocState | LegacyDocState> {
    return this.memento.get<Record<string, DocState | LegacyDocState>>(DOC_KEY, {});
  }

  get(uri: string): DocState {
    const found = this.all()[uri];
    if (found) {
      const read = (found as DocState).read ?? (found as LegacyDocState).readIds?.map((id) => ({ id, title: '' })) ?? [];
      return { index: found.index, read };
    }
    const legacy = this.memento.get<Record<string, number>>(LEGACY_POSITIONS_KEY, {});
    return { index: legacy[uri] ?? 0, read: [] };
  }

  set(uri: string, state: DocState): Thenable<void> {
    const next = { ...this.all(), [uri]: state };
    return this.memento.update(DOC_KEY, next);
  }
}

export interface UiState {
  config: ReaderConfig;
  panels: PanelsState;
}

const DEFAULT_UI_STATE: UiState = {
  config: { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' },
  panels: { outlineVisible: true, aiVisible: true, outlineWidth: 252, aiWidth: 340 },
};

export class UiStateStore {
  constructor(private readonly memento: MementoLike) {}

  get(): UiState {
    const raw = this.memento.get<UiState>(UI_KEY, DEFAULT_UI_STATE);
    const num = (v: unknown, min: number, max: number, dflt: number): number =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
    const bool = (v: unknown, dflt: boolean): boolean => (typeof v === 'boolean' ? v : dflt);
    const d = DEFAULT_UI_STATE;
    const colRaw = raw?.config?.columnWidth;
    return {
      config: {
        fontSize: num(raw?.config?.fontSize, 11, 24, d.config.fontSize),
        columnWidth: colRaw === 0 ? 0 : num(colRaw, 480, 1400, d.config.columnWidth),
        lineHeight: num(raw?.config?.lineHeight, 1.3, 2.2, d.config.lineHeight),
        theme: raw?.config?.theme === 'light' || raw?.config?.theme === 'dark' ? raw.config.theme : 'auto',
      },
      panels: {
        outlineVisible: bool(raw?.panels?.outlineVisible, true),
        aiVisible: bool(raw?.panels?.aiVisible, true),
        outlineWidth: num(raw?.panels?.outlineWidth, 180, 400, d.panels.outlineWidth),
        aiWidth: num(raw?.panels?.aiWidth, 260, 480, d.panels.aiWidth),
      },
    };
  }

  set(state: UiState): Thenable<void> {
    return this.memento.update(UI_KEY, state);
  }
}
