# MDeepen — Markdown Intelligence Reader

[![CI](https://github.com/AdSoares/MDeepen/actions/workflows/ci.yml/badge.svg)](https://github.com/AdSoares/MDeepen/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/AdSoares/MDeepen)](https://github.com/AdSoares/MDeepen/releases/latest)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**Read Markdown, deeper.** A paginated, section-based Markdown reader for VS Code, built for long
documents you have to work through rather than glance at, with an optional AI layer that never
sends anything you did not approve and can run entirely on your machine.

## Why

VS Code's preview renders a document as one endless scroll. That is fine for a README and painful
for a 40-page spec, a runbook or a design document. MDeepen splits the document into sections you
move through one at a time, keeps track of what you have read and how much is left, and, if you
want it to, summarizes, explains or answers questions about the document in front of you.

## Features

**Reading**

- One section at a time, split at the heading level you choose (H1–H6, `##` by default).
- An outline with a filter, read marks and one-click navigation, plus a breadcrumb of the headings
  above the current section.
- Reading progress, estimated time left, and your last position remembered per file.
- Read marks that mean something: a section counts as read after you stay on it for 5 seconds, so
  skipping ahead does not mark what you skipped.
- Full rendering: GFM tables, task lists, code with syntax highlighting and copy, links and Mermaid
  diagrams.
- Reading and focus modes, with adjustable font size, column width, line spacing and theme.

**AI (optional)**

- Explain, summarize, simplify, extract key terms or give an example, for a selection or a section.
- Summarize the whole document in four styles. Long files are read in parts, so the summary covers
  all of it.
- Ask questions about the document. The answer names the sections it used, each one a link.
- Turn a selection into a flowchart, sequence diagram, mind map or state diagram, edit the Mermaid
  source live and insert it into the file with a single undoable edit.
- Works with **Anthropic**, **OpenAI**, or **any OpenAI-compatible endpoint**: Ollama, LM Studio, a
  server on your network, OpenRouter, Groq.

## Privacy

Privacy is the design constraint the AI layer was built around, not a setting.

- **Off until you turn it on.** Reading, navigation and progress never depend on AI.
- **Run it locally.** Point MDeepen at Ollama or LM Studio on `localhost` and the panel says
  **Local · nothing leaves this machine**. No key needed, no dialogs, no cost.
- **Nothing is sent without your say-so.** The first send to a remote provider opens a dialog
  naming the destination, the file and section, the model, and a token and cost estimate computed
  locally. Consent is recorded for that destination only; pointing MDeepen somewhere else asks
  again.
- **Secrets are caught before they leave.** Text about to be sent is scanned for key-shaped
  strings (`sk-…`, `AKIA…`, `ghp_…`, JWTs), and masking is pre-selected when any are found. It is a
  safety net, not a guarantee; see [SECURITY.md](SECURITY.md).
- **Keys stay in the VS Code secret store.** Never in `settings.json`, a workspace file or your
  Markdown. A key is stored for the provider or endpoint it was pasted for and is never sent to
  another one.
- **No telemetry.** MDeepen collects nothing. All network access happens in the extension host,
  only to the provider you configured; the reader's webview cannot make network requests at all.

## Install

Requires VS Code **1.90** or later. MDeepen is not on the Marketplace yet.

1. Download the `.vsix` from the [latest release](https://github.com/AdSoares/MDeepen/releases/latest).
2. Install it:

   ```bash
   code --install-extension mdeepen-<version>.vsix
   ```

   or, in VS Code: **Extensions** view → **…** → **Install from VSIX…**

## Quick start

1. Open any `.md` file and press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>M</kbd>, or right-click it and
   choose **MDeepen: Open in Markdown Intelligence Reader**.
2. Move through sections with <kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>Alt</kbd>+<kbd>→</kbd>.
3. To enable AI, click **Configure AI** in the AI panel, or run **MDeepen: Configure AI…**.

### Running AI locally

| Runtime | Start it | Base URL |
| --- | --- | --- |
| [Ollama](https://ollama.com) | `ollama pull llama3.2`, then keep Ollama running | `http://localhost:11434/v1` |
| [LM Studio](https://lmstudio.ai) | Load a model, then **Developer → Start Server** | `http://localhost:1234/v1` |

In **Configure AI**, choose **OpenAI-compatible endpoint**, enter the base URL, **Save**, click
**Refresh models**, pick one and **Save** again. Leave the key empty.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>M</kbd> | Open the current Markdown file in the reader |
| <kbd>Alt</kbd>+<kbd>→</kbd> / <kbd>Alt</kbd>+<kbd>←</kbd> | Next / previous section |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>O</kbd> | Focus the outline filter |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>A</kbd> | Focus the question field |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>S</kbd> | Summarize the current section |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F11</kbd> | Toggle focus mode |

All of them can be remapped in **Keyboard Shortcuts**.

## Known limitations

- **Restricted Mode.** In a workspace VS Code does not trust, the extension is disabled. Trust the
  folder to use it. Making the reader available untrusted is on the [backlog](docs/BACKLOG.md).
- **Loopback is decided from the URL.** Only `localhost`, `127.x.x.x` and `[::1]` count as this
  machine. A hostname that resolves to your machine is treated as remote, so it asks for consent.
- **Product specifications are in Portuguese.** The three specs under `docs/` predate the
  project's English-only rule. Everything else, including code, design documents and this README,
  is in English.

## Status and roadmap

MDeepen **0.9** completes the MVP: every completion criterion of the
[product specification](docs/01-especificacao-mvp.md) is met. What is deferred, and why, is
recorded in [docs/BACKLOG.md](docs/BACKLOG.md). Next on the list: availability in Restricted Mode,
retry with backoff for long document summaries, and a Marketplace release.

## Develop

```bash
npm install
npm run build      # or: npm run watch
npm test           # Vitest
npx tsc --noEmit   # type check
npm run package    # produces a .vsix
```

Press <kbd>F5</kbd> for the Extension Development Host. See [CONTRIBUTING.md](CONTRIBUTING.md) for
the architecture, the project's non-negotiables and how changes are reviewed.

## Documentation

- [CHANGELOG.md](CHANGELOG.md): what shipped, by release
- [CONTRIBUTING.md](CONTRIBUTING.md): build, test and review conventions
- [SECURITY.md](SECURITY.md): reporting vulnerabilities, and where they would hurt
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): licenses of the software bundled in the `.vsix`
- `docs/`: product specifications, per-slice designs and implementation plans

## License

[Apache-2.0](LICENSE) © 2026 Ad Soares
