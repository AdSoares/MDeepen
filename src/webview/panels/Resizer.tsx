import { useRef } from 'preact/hooks';
import { clampPanelWidth } from '../layout';

interface Props {
  kind: 'outline' | 'ai';
  currentWidth: number;
  onResize: (width: number) => void;
}

/** Vertical drag handle. For the outline the panel grows to the right (+dx);
 * for the AI panel it grows to the left (-dx). */
export function Resizer({ kind, currentWidth, onResize }: Props) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const onPointerDown = (e: PointerEvent) => {
    drag.current = { startX: e.clientX, startWidth: currentWidth };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const raw = kind === 'outline' ? drag.current.startWidth + dx : drag.current.startWidth - dx;
    onResize(clampPanelWidth(kind, raw));
  };
  const onPointerUp = (e: PointerEvent) => {
    drag.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      class="md-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={kind === 'outline' ? 'Resize outline panel' : 'Resize AI panel'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}
