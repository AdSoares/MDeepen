import { useEffect, useRef } from 'preact/hooks';
import type { Page } from '../../shared/types';
import { renderMarkdown } from '../render/markdown';
import { post } from '../vscodeApi';
import { classifyLink } from '../../extension/linkAndReconcile';
import { renderMermaidIn } from '../render/mermaid';

interface Props {
  page?: Page;
  fileName: string;
  index: number;
  total: number;
  focus: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToggleFocus: () => void;
  onAnchor: (fragment: string) => void;
}

export function Content({ page, fileName, index, total, focus, onPrev, onNext, onToggleFocus, onAnchor }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const prevPageId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el || !page) return;
    el.innerHTML = renderMarkdown(page.content);
    if (prevPageId.current !== page.id) el.scrollTop = 0;
    prevPageId.current = page.id;

    // Lazy syntax highlight.
    if (el.querySelector('pre code')) {
      import('highlight.js').then(({ default: hljs }) => {
        el.querySelectorAll<HTMLElement>('pre code').forEach((c) => hljs.highlightElement(c));
      });
    }
    // Lazy mermaid render.
    if (el.querySelector('.mermaid-src')) {
      renderMermaidIn(el);
    }
    // Copy buttons.
    el.querySelectorAll<HTMLButtonElement>('.code-copy').forEach((b) => {
      b.onclick = () => navigator.clipboard.writeText(b.dataset.code ?? '');
    });
    // Link routing.
    el.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
      a.onclick = (e) => {
        e.preventDefault();
        const href = a.getAttribute('href')!;
        const kind = classifyLink(href);
        if (kind === 'anchor') { onAnchor(decodeURIComponent(href.slice(1))); return; } // in-page anchors navigate within the reader
        post({ type: 'openLink', href, kind });
      };
    });
  }, [page?.id, page?.content]);

  return (
    <div class="mdeepen-content">
      {!focus && (
        <div style={{ height: '34px', display: 'flex', alignItems: 'center', padding: '0 24px', fontSize: '12px', color: 'var(--vscode-descriptionForeground)', borderBottom: '1px solid var(--vscode-panel-border)' }}>
          {fileName} {page ? `› ${page.title}` : ''}
        </div>
      )}
      <div class="mdeepen-reading" ref={ref} />
      <div class="mdeepen-navfoot">
        <button class="md-btn" onClick={onPrev} disabled={index <= 0}>‹ Previous</button>
        <span>Section {total ? index + 1 : 0} of {total}</span>
        <button class="md-btn primary" onClick={onNext} disabled={index >= total - 1}>Next section ›</button>
      </div>
    </div>
  );
}
