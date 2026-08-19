# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-08-18

First AI slice. The reader itself is unchanged and still works with no API key.

### Added

- Remote Anthropic provider with token-by-token streaming, configured from the AI
  panel or the `MDeepen: Configure AI…` command. The API key is stored in VS Code
  `SecretStorage` and travels in its own message, so it never enters the persisted
  config object.
- **Summarize section**, streamed into the AI panel, with **Stop generating** (a
  stopped answer keeps whatever arrived), a citation chip back to the source
  section, and **Copy**.
- First-send confirmation dialog: shows file, section, model, and a locally
  computed token and cost estimate before any content leaves the machine. The
  estimate makes no network call. "Don't ask again" is scoped to the workspace.
- Secret detection over the section about to be sent (`sk-…`, `AKIA…`, `ghp_…`,
  JWT shapes). When anything is found, masking is pre-selected and the detected
  spans are replaced before sending.
- Connection test, model picker, and max-tokens setting in the config card.
- **Disconnect**, which deletes the stored key, aborts anything in flight, and revokes the
  first-send consent so a future key must be confirmed again.
- Typed error states for authentication, rate limit, and connection failures.

### Fixed

- Alt+Left and Alt+Right are contributed keybindings scoped to the reader panel. They used to be
  handled inside the webview, where VS Code resolved them as navigateBack/navigateForward first,
  so Alt+Left jumped to another document.
- Disabled buttons now look disabled.
- Saving the AI configuration no longer closes the card before the connection test becomes
  available.

### Security

- All AI network calls run in the extension host. The webview makes no requests
  and its Content Security Policy carries no `connect-src`.
- Closing the reader panel aborts an in-flight request.

## [0.1.2] - 2026-07-12

### Added

- Manual refresh button and a pagination-level picker (H1–H6).

### Changed

- Accessibility: progressbar role for reading progress, grouped outline tree,
  semantic headings, styled select.
- Reparse is debounced on rapid edits, and the syntax highlighter now loads only
  the common-languages build.

### Fixed

- Indented ATX headings are recognised, and column-width steps no longer skip.
- Dangerous link schemes are blocked at the webview boundary, and the pagination
  level payload is validated.

## [0.1.1] - 2026-07-11

### Added

- Dwell-based read marks persisted per file, surviving edits across sessions.
- Column width in perceptible steps up to full width, toggleable panels, and
  draggable panel borders with persisted layout.

### Fixed

- Pointer-cancel handling and visibility-gated dwell timing.
- Persisted UI state is sanitized on read.

## [0.1.0] - 2026-07-11

### Added

- Section-based pagination of Markdown with outline navigation, reading progress
  and estimated time, and last position remembered per file.
- Full Markdown rendering (GFM tables, task lists, code blocks with copy, links)
  with lazily loaded Mermaid diagrams and syntax highlighting.
- Reading and focus modes, adjustable font size, column width, line spacing, and
  theme.

[Unreleased]: https://github.com/AdSoares/MDeepen/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/AdSoares/MDeepen/releases/tag/v0.2.0
[0.1.2]: https://github.com/AdSoares/MDeepen/releases/tag/v0.1.2
[0.1.1]: https://github.com/AdSoares/MDeepen/releases/tag/v0.1.1
[0.1.0]: https://github.com/AdSoares/MDeepen/releases/tag/v0.1.0
