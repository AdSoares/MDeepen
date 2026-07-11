import { useState } from 'preact/hooks';
import type { OutlineNode, Page } from '../../shared/types';
import { filterOutline } from './outlineFilter';

interface Props {
  outline: OutlineNode[];
  activeIndex: number;
  pages: Page[];
  onSelect: (pageIndex: number) => void;
}

function Row({ node, activeIndex, onSelect }: { node: OutlineNode; activeIndex: number; onSelect: (i: number) => void }) {
  const isActive = node.pageIndex === activeIndex;
  const isRead = node.pageIndex < activeIndex;
  return (
    <div>
      <div
        role="treeitem"
        aria-selected={isActive}
        tabIndex={0}
        onClick={() => onSelect(node.pageIndex)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSelect(node.pageIndex); }}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '3px 8px', cursor: 'pointer', paddingLeft: `${8 + (node.level - 1) * 12}px`,
          fontWeight: isActive ? 600 : 400,
          background: isActive ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
        }}
      >
        <span style={{ opacity: 0.6, fontFamily: 'var(--md-mono)', fontSize: '11px' }}>
          {String(node.pageIndex + 1).padStart(2, '0')}
        </span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.title}</span>
        {isRead && <span class="codicon codicon-check" style={{ color: 'var(--md-success)' }} aria-label="read" />}
      </div>
      {node.children.map((c) => <Row key={c.id} node={c} activeIndex={activeIndex} onSelect={onSelect} />)}
    </div>
  );
}

export function Outline({ outline, activeIndex, pages, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const filtered = filterOutline(outline, query);
  const readCount = Math.min(activeIndex, Math.max(0, pages.length - 1));
  return (
    <div>
      <div style={{ padding: '10px 12px', fontSize: '11px', letterSpacing: '.06em', color: 'var(--vscode-descriptionForeground)' }}>
        MDEEPEN · OUTLINE
      </div>
      <div style={{ padding: '0 8px 8px' }}>
        <input
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          placeholder="Filter sections"
          aria-label="Filter sections"
          style={{ width: '100%', padding: '4px 8px', background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', borderRadius: '5px' }}
        />
      </div>
      <div role="tree">
        {filtered.map((n) => <Row key={n.id} node={n} activeIndex={activeIndex} onSelect={onSelect} />)}
      </div>
      <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
        {pages.length} sections · {readCount} read
      </div>
    </div>
  );
}
