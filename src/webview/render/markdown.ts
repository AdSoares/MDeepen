import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';

const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: false })
  .use(taskLists, { enabled: true });

// Custom fence: label + copy button; mermaid blocks flagged for lazy render.
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const defaultFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const lang = token.info.trim().split(/\s+/)[0] || 'text';
  if (lang === 'mermaid') {
    return `<div class="mermaid-src" data-src="${escapeHtml(token.content)}"></div>`;
  }
  const rendered = defaultFence(tokens, idx, options, env, self);
  return `<figure class="code-block" data-lang="${escapeHtml(lang)}">
    <div class="code-toolbar" data-md-ui="true"><span class="code-lang">${escapeHtml(lang)}</span>
    <button class="md-btn code-copy" data-code="${escapeHtml(token.content)}" aria-label="Copy code">Copy</button></div>
    ${rendered}</figure>`;
};

export function renderMarkdown(source: string): string {
  return md.render(source);
}
