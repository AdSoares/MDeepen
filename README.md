# MDeepen — Markdown Intelligence Reader

[![CI](https://github.com/AdSoares/MDeepen/actions/workflows/ci.yml/badge.svg)](https://github.com/AdSoares/MDeepen/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Read Markdown, deeper. A paginated, section-based Markdown reader for VS Code —
built for long documents you actually have to work through, not glance at.

VS Code's preview renders a document as one endless scroll. MDeepen turns it into
sections you move through one at a time, keeps track of what you have read, tells
you how much is left, and — if you give it an API key — can summarize the section
in front of you without ever sending anything you did not approve.

## Install

Not on the Marketplace yet. Grab the `.vsix` from
[Releases](https://github.com/AdSoares/MDeepen/releases), then:

```bash
code --install-extension mdeepen-0.2.0.vsix
```

Or from source: `npm install && npm run package`.

Open any `.md` file and run **MDeepen: Open in Markdown Intelligence Reader**
(<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>M</kbd>, or the editor and explorer context menus).

## Reading

- Section pagination (defaults to `##`, with fallback), Previous/Next, and
  <kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd>. A picker sets the heading level (H1–H6).
- Outline tree with filter, read marks, and section navigation.
  <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>O</kbd> focuses the filter.
- Reading progress and estimated time; last position remembered per file.
- Read marks are dwell-based (5s) and persisted per file. Skipping ahead does not
  mark what you skipped, and going back does not unmark.
- Full Markdown rendering: GFM tables, task lists, code blocks with copy, links,
  syntax highlighting, and Mermaid diagrams.
- Reading and focus modes (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F11</kbd>),
  adjustable font size, column width, line spacing, and theme.
- Toggleable outline and AI panels with draggable borders; layout and preferences
  persist across sessions.

## AI

Optional, off until you configure it, and designed so that you always know what
leaves your machine.

- **Bring your own key.** Configure a remote Anthropic provider from the AI panel
  or the `MDeepen: Configure AI…` command. The key is stored in the VS Code secret
  store — never in `settings.json`, never in a workspace file, never in your
  Markdown.
- **Nothing is sent without your say-so.** The first remote send in a workspace
  opens a confirmation dialog showing the file and section, the model, and a token
  and cost estimate computed locally — producing it makes no network call.
  "Don't ask again" is scoped to that workspace.
- **Secret detection.** The text about to be sent — the selection, or the whole
  section — is scanned for API-key-shaped strings
  (`sk-…`, `AKIA…`, `ghp_…`, JWTs) before the dialog appears. If any are found,
  masking is pre-selected and those spans are redacted before the text is sent.
  It is a safety net, not a guarantee — see [SECURITY.md](SECURITY.md).
- **Five actions, one click.** Select any text — or act on the whole section — and ask for a
  summary, an explanation, a plain-language explanation, the key terms, or a worked example.
  Answers stream in, cite the section they came from, and can be copied, deleted, or cleared.
  Stop generating keeps whatever arrived. <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>S</kbd>
  summarizes the current section without leaving the keyboard.
- **Summarize the whole document** in four styles — short, executive, technical, or key points.
  Long documents are read in parts and combined, so the summary covers the whole file rather than
  the beginning of it. Progress is visible while it runs, and a document always asks before it is
  sent, however you answered the dialog for a section.
- **Ask about the document.** Type a question and MDeepen answers from the file in front of you,
  choosing the relevant sections itself and naming them under the answer, each one a link back to
  that section. The ranking is local: no embeddings, no index, nothing to rebuild when you edit.
  <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>A</kbd> jumps to the question field.
- All network access happens in the extension host. The webview makes no requests,
  and its Content Security Policy carries no `connect-src`.
- **Reading never depends on AI.** With no key configured, everything above still
  works, and every AI error is recoverable.

Coming in later slices: chat with the document and generated diagrams.

## Develop

```bash
npm install
npm run build      # or: npm run watch
npm test           # Vitest
npx tsc --noEmit   # type check
npm run package    # produces a .vsix
```

Press <kbd>F5</kbd> for the Extension Development Host.

`npm audit --omit=dev` is clean; all advisories are in dev-tool dependencies and
none ship in the `.vsix`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture, the project's
non-negotiables, and how changes are reviewed.

## Documentation

- [CHANGELOG.md](CHANGELOG.md) — what shipped, by release
- [CONTRIBUTING.md](CONTRIBUTING.md) — build, test, and review conventions
- [SECURITY.md](SECURITY.md) — reporting vulnerabilities, and where they would hurt
- `docs/` — product specifications and per-slice design and implementation plans

Project language is English. Three product specifications under `docs/` predate
that rule and are still in Portuguese; they are being translated.

## License

[Apache-2.0](LICENSE) © 2026 Ad Soares
