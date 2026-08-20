export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Placement {
  top: number;
  left: number;
  flipped: boolean;
}

const MIN_CHARS = 3;
const GAP = 8;

export function isUsableSelectionText(text: string): boolean {
  return text.trim().length >= MIN_CHARS;
}

/**
 * Reads the selected text without the reader's own UI. A selection crossing a code
 * block otherwise captures the toolbar's language label and Copy button.
 * DOM-dependent, so it is smoke-verified rather than unit-tested.
 */
export function selectionText(selection: Selection | null): string {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return '';
  const fragment = selection.getRangeAt(0).cloneContents();
  fragment.querySelectorAll('[data-md-ui]').forEach((node) => node.remove());
  return fragment.textContent ?? '';
}

/**
 * Places the toolbar above the selection, flipping below when that would clip the top of
 * the viewport, and clamped to the reading column so it never spills over the side panels.
 */
export function placeToolbar(
  selection: Rect,
  viewport: { width: number; height: number },
  column: { left: number; right: number },
  toolbar: { width: number; height: number },
): Placement {
  const above = selection.top - toolbar.height - GAP;
  const flipped = above < 0;
  const top = flipped ? selection.bottom + GAP : above;

  const centred = (selection.left + selection.right) / 2 - toolbar.width / 2;
  const maxLeft = Math.max(column.left, column.right - toolbar.width);
  const left = Math.min(Math.max(centred, column.left), maxLeft);

  return { top, left, flipped };
}
