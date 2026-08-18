import { useEffect, useState } from 'preact/hooks';
import { createReaderState } from './store';
import { post, onMessage } from './vscodeApi';
import { READ_DWELL_MS } from './layout';
import { progressPercent, remainingMinutes, readingMinutes } from '../shared/progress';
import { Outline } from './panels/Outline';
import { Content } from './panels/Content';
import { AiPanel } from './panels/AiPanel';
import { AiConfig } from './panels/AiConfig';
import { AiConfirm } from './panels/AiConfirm';
import { ViewControls } from './panels/ViewControls';
import { Resizer } from './panels/Resizer';
import { findBySlug } from './anchors';

const store = createReaderState();

let persistTimer: number | undefined;
function schedulePersist() {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    const { config, panels } = store.get();
    const { focus: _focus, ...persistedPanels } = panels;
    post({ type: 'uiStateChanged', config, panels: persistedPanels });
  }, 500);
}

export function App() {
  const [, force] = useState(0);
  const [showConfig, setShowConfig] = useState(false);
  useEffect(() => {
    const unsub = store.subscribe(() => force((n) => n + 1));
    onMessage((m) => {
      if (m.type === 'init') store.applyInit(m);
      else if (m.type === 'sectionsUpdated') store.applyUpdate(m);
      else if (m.type === 'configChanged') store.setConfig(m.config);
      else if (m.type === 'aiConfigState') store.aiConfigState(m.configured, m.provider, m.model);
      else if (m.type === 'aiChunk') store.aiChunk(m.text);
      else if (m.type === 'aiDone') store.aiDone();
      else if (m.type === 'aiError') store.aiError(m.kind, m.message);
      else if (m.type === 'aiConnectionResult') store.aiConnection({ ok: m.ok, ms: m.ms, error: m.error });
      else if (m.type === 'aiShowConfig') { store.setPanels({ aiVisible: true }); setShowConfig(true); }
      else if (m.type === 'aiConfirmNeeded') {
        // The host is holding the request until the user answers, so stop showing a live stream.
        store.aiStopped();
        store.aiConfirm({ summary: m.summary, secrets: m.secrets });
      }
    });
    post({ type: 'ready' });
    post({ type: 'aiConfigRequest' });
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); setIndex(store.get().activeIndex + 1); }
      else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); setIndex(store.get().activeIndex - 1); }
      else if (e.key === 'F11' && e.shiftKey && e.ctrlKey) { e.preventDefault(); store.setPanels({ focus: !store.get().panels.focus }); schedulePersist(); }
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
    let timer: number | undefined;
    const arm = () => {
      timer = window.setTimeout(() => {
        if (store.get().pages[store.get().activeIndex]?.id !== id) return;
        if (store.get().readIds.has(id)) return;
        store.markRead(id);
        post({ type: 'sectionRead', id });
      }, READ_DWELL_MS);
    };
    const onVis = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === 'visible') arm();
    };
    document.addEventListener('visibilitychange', onVis);
    if (document.visibilityState === 'visible') arm();
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [page?.id]);
  const pct = progressPercent(s.activeIndex, s.pages.length);

  return (
    <div class="mdeepen-root" data-theme={s.config.theme} data-focus={String(s.panels.focus)} style={{ '--md-fs': `${s.config.fontSize}px`, '--md-lh': String(s.config.lineHeight), '--md-col': s.config.columnWidth === 0 ? '100%' : `${s.config.columnWidth}px`, '--md-outline-w': `${s.panels.outlineWidth}px`, '--md-ai-w': `${s.panels.aiWidth}px` }}>
      {s.panels.focus && (
        <div class="focus-progress" role="progressbar" aria-label="Reading progress"
          aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
          style={{ width: `${pct}%` }} />
      )}
      {!s.panels.focus && (
        <div style={{ height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', borderBottom: '1px solid var(--vscode-panel-border)' }}>
          <button class="md-btn" aria-label="Toggle outline panel" aria-pressed={s.panels.outlineVisible}
            onClick={() => { store.setPanels({ outlineVisible: !store.get().panels.outlineVisible }); schedulePersist(); }}>
            <span class="codicon codicon-layout-sidebar-left" aria-hidden="true" />
          </button>
          <button class="md-btn" aria-label="Toggle AI panel" aria-pressed={s.panels.aiVisible}
            onClick={() => { store.setPanels({ aiVisible: !store.get().panels.aiVisible }); schedulePersist(); }}>
            <span class="codicon codicon-layout-sidebar-right" aria-hidden="true" />
          </button>
          <button class="md-btn" aria-label="Refresh document" onClick={() => post({ type: 'refresh' })}>
            <span class="codicon codicon-refresh" aria-hidden="true" />
          </button>
          <select aria-label="Pagination level" value={String(s.effectiveLevel)}
            onChange={(e) => post({ type: 'setPaginationLevel', level: Number((e.target as HTMLSelectElement).value) })}>
            <option value="1">Heading 1</option>
            <option value="2">Heading 2</option>
            <option value="3">Heading 3</option>
            <option value="4">Heading 4</option>
            <option value="5">Heading 5</option>
            <option value="6">Heading 6</option>
          </select>
          <span style={{ flex: 1 }} />
          <ViewControls config={s.config} onChange={(c) => { store.setConfig(c); schedulePersist(); }} />
        </div>
      )}
      <div class="mdeepen-body">
        <div class={`mdeepen-outline ${s.panels.outlineVisible && !s.panels.focus ? '' : 'hidden'}`}>
          <Outline outline={s.outline} activeIndex={s.activeIndex} pages={s.pages} readIds={s.readIds} onSelect={setIndex} />
        </div>
        {s.panels.outlineVisible && !s.panels.focus && (
          <Resizer kind="outline" currentWidth={s.panels.outlineWidth} onResize={(w) => { store.setPanels({ outlineWidth: w }); schedulePersist(); }} />
        )}
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
        {s.panels.aiVisible && !s.panels.focus && (
          <Resizer kind="ai" currentWidth={s.panels.aiWidth} onResize={(w) => { store.setPanels({ aiWidth: w }); schedulePersist(); }} />
        )}
        <div class={`mdeepen-ai ${s.panels.aiVisible && !s.panels.focus ? '' : 'hidden'}`}>
          {showConfig && <AiConfig ai={s.ai} onClose={() => setShowConfig(false)} />}
          <AiPanel
            ai={s.ai}
            activePageId={page?.id}
            onConfigure={() => setShowConfig((v) => !v)}
            onCite={(pageIndex) => setIndex(pageIndex)}
            onSummarize={() => {
              const st = store.get();
              const target = st.pages[st.activeIndex];
              if (!target) return;
              store.aiStreamStart(target.title, st.activeIndex);
              post({ type: 'aiSummarizeSection', id: target.id });
            }}
            onStop={() => { store.aiStopped(); post({ type: 'aiStop' }); }}
          />
        </div>
      </div>
      {s.ai.confirm && (
        <AiConfirm
          confirm={s.ai.confirm}
          onCancel={() => { store.aiConfirm(undefined); post({ type: 'aiCancelSend' }); }}
          onSend={(opts) => {
            const { sectionTitle, pageIndex } = store.get().ai;
            store.aiConfirm(undefined);
            store.aiStreamStart(sectionTitle, pageIndex);
            post({ type: 'aiConfirmSend', ...opts });
          }}
        />
      )}
      <div class="mdeepen-status">
        <span>{pct}% read</span>
        <span>{page ? `${page.title}` : ''}</span>
        <span>{page ? `${readingMinutes(page.wordCount)} min` : ''}</span>
        <span style={{ marginLeft: 'auto' }}>{remainingMinutes(s.pages, s.activeIndex)} min left</span>
        <span style={{ cursor: 'pointer' }} onClick={() => { store.setPanels({ focus: !s.panels.focus }); schedulePersist(); }}>Focus</span>
      </div>
    </div>
  );
}
