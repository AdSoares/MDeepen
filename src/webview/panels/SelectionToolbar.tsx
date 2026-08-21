import { useEffect, useRef, useState } from 'preact/hooks';
import type { AiActionKind } from '../../extension/ai/types';
import { actionLabel } from '../../extension/ai/prompts';
import type { Placement } from '../selection';

const PRIMARY: AiActionKind[] = ['summarize', 'explain', 'keyTerms'];
const OVERFLOW: AiActionKind[] = ['explainSimply', 'example'];

interface Props {
  placement: Placement;
  onAction: (action: AiActionKind) => void;
  onDiagram: () => void;
  onDismiss: () => void;
}

export function SelectionToolbar({ placement, onAction, onDiagram, onDismiss }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onDismiss(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div class="md-seltoolbar" role="toolbar" aria-label="Actions for the selected text" ref={ref}
      style={{ top: `${placement.top}px`, left: `${placement.left}px` }}
      onMouseDown={(e) => e.preventDefault()}>
      <span class="codicon codicon-sparkle" style={{ color: 'var(--md-ai)' }} aria-hidden="true" />
      {PRIMARY.map((action) => (
        <button key={action} class="md-btn" onClick={() => onAction(action)}>{actionLabel(action)}</button>
      ))}
      <button class="md-btn" aria-label="More actions" aria-expanded={open} aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } }}>&#8943;</button>
      {open && (
        <div class="md-seltoolbar-menu" role="menu">
          {OVERFLOW.map((action) => (
            <button key={action} class="md-btn" role="menuitem" onClick={() => onAction(action)}>
              {actionLabel(action)}
            </button>
          ))}
          <button class="md-btn" role="menuitem" onClick={onDiagram}>Diagram</button>
        </div>
      )}
    </div>
  );
}
