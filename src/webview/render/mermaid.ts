let initialized = false;
let counter = 0;

function isDark(): boolean {
  const bg = getComputedStyle(document.body).backgroundColor;
  const m = bg.match(/\d+/g);
  if (!m) return true;
  const [r, g, b] = m.map(Number);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

function errorBox(src: string, message: string): HTMLElement {
  const err = document.createElement('div');
  err.className = 'mermaid-error';
  err.setAttribute('role', 'alert');
  err.style.border = '1px solid var(--md-warn)';
  err.style.borderRadius = '6px';
  err.style.padding = '10px';
  const msg = document.createElement('div');
  msg.textContent = message;
  const pre = document.createElement('pre');
  pre.style.fontFamily = 'var(--md-mono)';
  pre.textContent = src;
  err.append(msg, pre);
  return err;
}

/**
 * Renders one Mermaid source. Never rejects: a chunk that fails to load, an engine that fails to
 * initialize and a source that fails to parse all resolve to an error, so every caller can show
 * the source instead of losing it.
 */
export async function renderMermaidSource(src: string): Promise<{ svg: string } | { error: string }> {
  let mermaid: typeof import('mermaid').default;
  try {
    mermaid = (await import('mermaid')).default;
  } catch {
    return { error: '⚠ Diagram renderer failed to load. Source preserved below.' };
  }

  if (!initialized) {
    try {
      mermaid.initialize({ startOnLoad: false, theme: isDark() ? 'dark' : 'default', securityLevel: 'strict' });
      initialized = true;
    } catch {
      return { error: '⚠ Diagram renderer failed to initialize. Source preserved below.' };
    }
  }

  const id = `mmd-${counter++}`;
  try {
    const { svg } = await mermaid.render(id, src);
    return { svg };
  } catch {
    // mermaid.render can leave a temporary container in document.body on parse failure.
    document.getElementById(id)?.remove();
    document.getElementById(`d${id}`)?.remove();
    return { error: '⚠ Diagram could not be rendered. Source preserved below.' };
  }
}

export async function renderMermaidIn(root: HTMLElement): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-src'));
  for (const node of nodes) {
    const src = node.dataset.src ?? '';
    const result = await renderMermaidSource(src);
    if ('svg' in result) {
      const wrap = document.createElement('div');
      wrap.className = 'mermaid-rendered';
      wrap.innerHTML = result.svg;
      node.replaceWith(wrap);
    } else {
      node.replaceWith(errorBox(src, result.error));
    }
  }
}
