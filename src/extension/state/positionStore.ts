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
    return this.memento.get<UiState>(UI_KEY, DEFAULT_UI_STATE);
  }

  set(state: UiState): Thenable<void> {
    return this.memento.update(UI_KEY, state);
  }
}
