export interface MementoLike {
  get<T>(key: string, defaultValue?: T): T;
  update(key: string, value: unknown): Thenable<void>;
}

const KEY = 'mdeepen.positions';

export class PositionStore {
  constructor(private readonly memento: MementoLike) {}

  private all(): Record<string, number> {
    return this.memento.get<Record<string, number>>(KEY, {});
  }

  get(uri: string): number {
    return this.all()[uri] ?? 0;
  }

  set(uri: string, index: number): Thenable<void> {
    const next = { ...this.all(), [uri]: index };
    return this.memento.update(KEY, next);
  }
}
