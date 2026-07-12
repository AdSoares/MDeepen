export const COL_MIN = 480;
export const COL_MAX = 1400;
export const COL_STEP = 100;
export const COL_FULL = 0; // sentinel: no max-width
export const READ_DWELL_MS = 5000;

export function stepColumnWidth(current: number, delta: 1 | -1): number {
  if (current === COL_FULL) return delta > 0 ? COL_FULL : COL_MAX;
  if (current >= COL_MAX && delta > 0) return COL_FULL;
  const aligned = current % COL_STEP === 0;
  if (!aligned) {
    // Snapping toward the step direction already IS the step.
    const snapped = delta > 0 ? Math.ceil(current / COL_STEP) * COL_STEP : Math.floor(current / COL_STEP) * COL_STEP;
    return Math.min(COL_MAX, Math.max(COL_MIN, snapped));
  }
  return Math.min(COL_MAX, Math.max(COL_MIN, current + delta * COL_STEP));
}

const PANEL_LIMITS = { outline: [180, 400], ai: [260, 480] } as const;

export function clampPanelWidth(kind: 'outline' | 'ai', value: number): number {
  const [min, max] = PANEL_LIMITS[kind];
  return Math.min(max, Math.max(min, Math.round(value)));
}
