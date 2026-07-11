import type { PanelsState, ReaderConfig } from '../../shared/types';

export interface MementoLike {
  get<T>(key: string, defaultValue?: T): T;
  update(key: string, value: unknown): Thenable<void>;
}

const DOC_KEY = 'mdeepen.docState';
const LEGACY_POSITIONS_KEY = 'mdeepen.positions';
const UI_KEY = 'mdeepen.uiState';

export interface DocState {
  index: number;
  readIds: string[];
}

export class DocStateStore {
  constructor(private readonly memento: MementoLike) {}

  private all(): Record<string, DocState> {
    return this.memento.get<Record<string, DocState>>(DOC_KEY, {});
  }

  get(uri: string): DocState {
    const found = this.all()[uri];
    if (found) return found;
    const legacy = this.memento.get<Record<string, number>>(LEGACY_POSITIONS_KEY, {});
    return { index: legacy[uri] ?? 0, readIds: [] };
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
