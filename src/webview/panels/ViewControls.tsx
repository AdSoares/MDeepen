import type { ReaderConfig } from '../../shared/types';

interface Props { config: ReaderConfig; onChange: (c: ReaderConfig) => void; }

export function ViewControls({ config, onChange }: Props) {
  const set = (patch: Partial<ReaderConfig>) => onChange({ ...config, ...patch });
  const clampFs = (v: number) => Math.min(24, Math.max(11, v));
  const clampCol = (v: number) => Math.min(1000, Math.max(480, v));
  const clampLh = (v: number) => Math.min(2.2, Math.max(1.3, Math.round(v * 100) / 100));
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '0 12px' }}>
      <button class="md-btn" aria-label="Decrease font size" onClick={() => set({ fontSize: clampFs(config.fontSize - 1) })}>A−</button>
      <button class="md-btn" aria-label="Increase font size" onClick={() => set({ fontSize: clampFs(config.fontSize + 1) })}>A+</button>
      <button class="md-btn" aria-label="Narrower column" onClick={() => set({ columnWidth: clampCol(config.columnWidth - 40) })}>› ‹</button>
      <button class="md-btn" aria-label="Wider column" onClick={() => set({ columnWidth: clampCol(config.columnWidth + 40) })}>‹ ›</button>
      <button class="md-btn" aria-label="Tighter line spacing" onClick={() => set({ lineHeight: clampLh(config.lineHeight - 0.1) })}>↕−</button>
      <button class="md-btn" aria-label="Looser line spacing" onClick={() => set({ lineHeight: clampLh(config.lineHeight + 0.1) })}>↕+</button>
      <select
        aria-label="Theme"
        value={config.theme}
        onChange={(e) => set({ theme: (e.target as HTMLSelectElement).value as ReaderConfig['theme'] })}
      >
        <option value="auto">Auto</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
  );
}
