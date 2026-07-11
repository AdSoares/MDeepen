import { useEffect, useState } from 'preact/hooks';
import { createReaderState } from './store';
import { post, onMessage } from './vscodeApi';
import { READ_DWELL_MS } from './layout';
import { progressPercent, remainingMinutes, readingMinutes } from '../shared/progress';
import { Outline } from './panels/Outline';
import { Content } from './panels/Content';
import { AiPanel } from './panels/AiPanel';
import { ViewControls } from './panels/ViewControls';
import { findBySlug } from './anchors';

const store = createReaderState();

export function App() {
  const [, force] = useState(0);
  useEffect(() => {
    const unsub = store.subscribe(() => force((n) => n + 1));
    onMessage((m) => {
      if (m.type === 'init') store.applyInit(m);
      else if (m.type === 'sectionsUpdated') store.applyUpdate(m);
      else if (m.type === 'configChanged') store.setConfig(m.config);
    });
    post({ type: 'ready' });
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); setIndex(store.get().activeIndex + 1); }
      else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); setIndex(store.get().activeIndex - 1); }
      else if (e.key === 'F11' && e.shiftKey && e.ctrlKey) { e.preventDefault(); store.setPanels({ focus: !store.get().panels.focus }); }
    };
    window.addEventListener('keydown', onKey);
    return () => { unsub(); window.removeEventListener('keydown', onKey); };
  }, []);

  const s = store.get();
  const setIndex = (i: number) => { store.setActiveIndex(i); post({ type: 'activeSectionChanged', index: store.get().activeIndex }); };
  const page = s.pages[s.activeIndex];
  useEffect(() => {
    if (!page || store.get().readIds.has(page.id)) return;
    const id = page.id;
    const timer = window.setTimeout(() => {
      if (store.get().pages[store.get().activeIndex]?.id !== id) return;
      if (store.get().readIds.has(id)) return;
      store.markRead(id);
      post({ type: 'sectionRead', id });
    }, READ_DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [page?.id]);
  const pct = progressPercent(s.activeIndex, s.pages.length);

  return (
    <div class="mdeepen-root" data-theme={s.config.theme} data-focus={String(s.panels.focus)} style={{ '--md-fs': `${s.config.fontSize}px`, '--md-lh': String(s.config.lineHeight), '--md-col': `${s.config.columnWidth}px` }}>
      {s.panels.focus && <div class="focus-progress" style={{ width: `${pct}%` }} />}
      {!s.panels.focus && (
        <div style={{ height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', borderBottom: '1px solid var(--vscode-panel-border)' }}>
          <ViewControls config={s.config} onChange={(c) => store.setConfig(c)} />
        </div>
      )}
      <div class="mdeepen-body">
        <div class={`mdeepen-outline ${s.panels.outlineVisible && !s.panels.focus ? '' : 'hidden'}`}>
          <Outline outline={s.outline} activeIndex={s.activeIndex} pages={s.pages} readIds={s.readIds} onSelect={setIndex} />
        </div>
        <Content
          page={page}
          fileName={s.fileName}
          index={s.activeIndex}
          total={s.pages.length}
          focus={s.panels.focus}
          onPrev={() => setIndex(s.activeIndex - 1)}
          onNext={() => setIndex(s.activeIndex + 1)}
          onAnchor={(fragment: string) => { const t = findBySlug(store.get().outline, fragment); if (t) setIndex(t.pageIndex); }}
        />
        <div class={`mdeepen-ai ${s.panels.aiVisible && !s.panels.focus ? '' : 'hidden'}`}>
          <AiPanel />
        </div>
      </div>
      <div class="mdeepen-status">
        <span>{pct}% read</span>
        <span>{page ? `${page.title}` : ''}</span>
        <span>{page ? `${readingMinutes(page.wordCount)} min` : ''}</span>
        <span style={{ marginLeft: 'auto' }}>{remainingMinutes(s.pages, s.activeIndex)} min left</span>
        <span style={{ cursor: 'pointer' }} onClick={() => store.setPanels({ focus: !s.panels.focus })}>Focus</span>
      </div>
    </div>
  );
}
