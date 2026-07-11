let initialized = false;
let counter = 0;

function isDark(): boolean {
  const bg = getComputedStyle(document.body).backgroundColor;
  const m = bg.match(/\d+/g);
  if (!m) return true;
  const [r, g, b] = m.map(Number);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

export async function renderMermaidIn(root: HTMLElement): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-src'));
  if (nodes.length === 0) return;
  const { default: mermaid } = await import('mermaid');
  if (!initialized) {
    mermaid.initialize({ startOnLoad: false, theme: isDark() ? 'dark' : 'default', securityLevel: 'strict' });
    initialized = true;
  }
  for (const node of nodes) {
    const src = node.dataset.src ?? '';
    const id = `mmd-${counter++}`;
    try {
      const { svg } = await mermaid.render(id, src);
      const wrap = document.createElement('div');
      wrap.className = 'mermaid-rendered';
      wrap.innerHTML = svg;
      node.replaceWith(wrap);
    } catch {
      const err = document.createElement('div');
      err.className = 'mermaid-error';
      err.setAttribute('role', 'alert');
      err.style.border = '1px solid var(--md-warn)';
      err.style.borderRadius = '6px';
      err.style.padding = '10px';
      const msg = document.createElement('div');
      msg.textContent = '⚠ Diagram could not be rendered. Source preserved below.';
      const pre = document.createElement('pre');
      pre.style.fontFamily = 'var(--md-mono)';
      pre.textContent = src;
      err.append(msg, pre);
      node.replaceWith(err);
    }
  }
}
