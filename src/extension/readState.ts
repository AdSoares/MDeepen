import type { Page } from '../shared/types';

/** Remap persisted read ids after a reparse: keep existing ids, follow renamed
 * start lines by title, drop sections that disappeared. Result follows newPages order. */
export function remapReadIds(readIds: string[], oldPages: Page[], newPages: Page[]): string[] {
  const wanted = new Set<string>();
  const newIds = new Set(newPages.map((p) => p.id));
  for (const id of readIds) {
    if (newIds.has(id)) {
      wanted.add(id);
      continue;
    }
    const old = oldPages.find((p) => p.id === id);
    if (!old) continue;
    const match = newPages.find((p) => p.title === old.title);
    if (match) wanted.add(match.id);
  }
  return newPages.filter((p) => wanted.has(p.id)).map((p) => p.id);
}
