# Contributing to MDeepen

Thanks for taking the time to contribute. This document explains how the project
is built, tested, and reviewed.

**Project language is English** — code, identifiers, comments, commit messages,
issues, and pull requests. (Some product specifications under `docs/` predate this
rule and are still in Portuguese; they are being translated.)

## Getting started

```bash
npm install
npm run build        # bundles the extension host and the webview with esbuild
npm run watch        # same, in watch mode
npm test             # Vitest
npx tsc --noEmit     # type check
npm run package      # produces a .vsix
```

Press <kbd>F5</kbd> in VS Code to launch the Extension Development Host with the
extension loaded, then open any `.md` file and run **MDeepen: Open in Markdown
Intelligence Reader**.

## Architecture in one paragraph

The extension has two halves that never share a runtime. `src/extension/` runs in
the **extension host** (Node): file reading, sectionizing, state persistence, and
every AI network call. `src/webview/` runs in the **webview** (Preact): rendering,
navigation, and the AI panel. They communicate only through the typed message
contract in `src/shared/messages.ts`, guarded at both ends by `isHostToWebview` and
`isWebviewToHost`. The webview has no network access and its Content Security
Policy carries no `connect-src` — if you find yourself wanting to `fetch` from the
webview, the logic belongs in the host instead.

## Non-negotiables

These are properties the project protects deliberately. A change that breaks one
of them needs a very good reason.

- **The reader never depends on AI.** With no API key configured, pagination,
  outline, read marks, progress, and navigation all work. Every AI error is
  recoverable and never blocks reading.
- **Nothing leaves the machine without consent.** The first remote send in a
  workspace is gated by a confirmation dialog. Content is scanned for
  secret-shaped strings first, and masking is pre-selected when any are found.
- **The API key lives only in VS Code `SecretStorage`.** Never in `settings.json`,
  never in a workspace file, never in the message contract's config object, never
  in a log line.
- **All network I/O happens in the extension host.**
- **Rendered Markdown is sanitized** and dangerous link schemes are blocked at the
  webview boundary.

## Tests

Pure logic is test-driven: write the failing test first, watch it fail for the
right reason, then implement. Anything that can be tested without the VS Code API
should be — prefer narrow interfaces (see `MementoLike` in
`src/extension/ai/AiConfigStore.ts`) over importing `vscode` into logic you want
to cover.

Code that genuinely needs the VS Code API is verified by hand in the Extension
Development Host. Say so in the pull request, and say what you actually exercised.

Tests live next to the code they cover, as `*.test.ts`. Run the whole suite before
opening a pull request; it must be green, and `npx tsc --noEmit` must be clean.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`,
`perf:`, `refactor:`, `docs:`, `test:`, `chore:`, `style:`. Write the subject in
the imperative mood and keep it under 72 characters. Explain *why* in the body
when the reason is not obvious from the diff.

## Pull requests

- One coherent change per pull request.
- Fill in the pull request template: what changed, why, and how you verified it.
- State plainly what you did **not** verify. An honest gap is more useful than an
  implied guarantee.
- Update `CHANGELOG.md` under `## [Unreleased]`.

## Reporting bugs and requesting features

Open an issue using the templates. For anything security-sensitive, follow
[SECURITY.md](SECURITY.md) instead of opening a public issue.

## Code of Conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
