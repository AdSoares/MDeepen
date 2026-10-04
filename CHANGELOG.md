# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- The build now starts from an empty `dist`. Webview chunks are named by content hash, so every
  build that changed one left the old file behind, and the package shipped it: the 0.9.0 `.vsix`
  carries three such chunks, never loaded, that a clean build does not produce.

## [0.9.0] - 2026-10-03

### Added

- An **OpenAI-compatible endpoint** provider: Ollama or LM Studio on this machine, a server on
  the network, or a hosted service such as OpenRouter or Groq. The base URL is free and the key is
  optional.
- When the endpoint is on this machine — `localhost`, `127.x.x.x` or `[::1]` — the panel says
  **nothing leaves this machine**, sections and chat send without a consent dialog, nothing is
  masked, and the cost reads as none. A whole-document run still confirms, because it can take a
  while.

### Changed

- Consent is recorded against the destination it was given for: the provider, or a compatible
  endpoint's origin. Pointing the extension at a different host asks again, including when the
  change was made in another window. Consent stored by 0.8 is asked for once more.
- A remote compatible endpoint is named by its host in the confirmation dialog, which also warns
  when the connection has no TLS.
- Keys for compatible endpoints are stored per origin, so a key pasted for one host is never sent
  to another. A key typed but not yet saved is cleared when the provider or the origin changes.
- Disconnect also switches a compatible endpoint off, since without a key it would otherwise keep
  sending.
- Every open reader updates when the AI configuration changes in one of them.
- A compatible endpoint receives only the headers a request needs. The organization, project and
  `OPENAI_CUSTOM_HEADERS` the OpenAI SDK reads from the environment are meant for OpenAI and are
  no longer sent to other hosts, and a redirect is refused rather than followed to a host the user
  never chose.
- The extension host itself refuses to send to a compatible endpoint with no model, instead of
  trusting the panel to have checked.
- The compatible provider's button says whether keys are stored, or that none is needed, instead
  of always claiming a key.

### Fixed

- A confirmation dialog left open while the provider changed in another panel sent the new
  provider's key to the dialog's destination. A send now always uses the key of the destination it
  was built for.

### Note

- This closes MVP completion criterion 10 and FR-MVP-033. Every completion criterion of the MVP is
  now met.
- Loopback is decided from the URL alone, without DNS: a name that resolves to 127.0.0.1 is
  treated as remote. It can only err towards asking for consent it did not need.

## [0.8.0] - 2026-09-01

### Added

- **Ask about this** in the selection toolbar: the excerpt is captured, shown above the question
  field, and answered as a chat turn that keeps the quote. The excerpt claims its share of the
  context before the ranking spends any, because you pointed at it on purpose.
- A breadcrumb of the headings a section sits under, above the reading pane. Every level is
  clickable, and it disappears for a top-level section rather than showing an empty trail.

### Changed

- Focus mode is now a contributed keybinding rather than a listener inside the reader. Every
  shortcut the extension offers can therefore be remapped from Keyboard Shortcuts, and none of
  them can be outranked by the workbench.

### Note

- This closes every functional requirement of the MVP except completion criterion 10, the local
  provider, which was deferred by decision — see `docs/BACKLOG.md`.

## [0.7.1] - 2026-08-25

### Fixed

- The OpenAI provider failed on the last chunk of every successful request. The chunk that
  carries token usage has no `choices` array at all, and the code indexed it directly, so a
  request that had streamed perfectly ended as a `TypeError`. This broke the provider the 0.7.0
  release had just introduced.
- The Anthropic provider read `event.delta.type` without guarding a delta that may be absent. No
  failure was observed, but the same class of defect was there.

### Changed

- Both providers now depend on a narrow declaration of the part of each SDK this extension uses,
  and accept a fake of it in tests. That declaration is what found the defect above: writing down
  honestly that `choices` is optional turned a runtime error into a compile error.
- The diagram insertion decision moved into a pure function, so relocating a section, refusing an
  ambiguous one and choosing the line are covered by tests rather than by inspection.

## [0.7.0] - 2026-08-23

### Added

- A second provider: OpenAI, behind the same interface. Each provider stores its own key, so
  switching between them never means pasting a key again.
- The configuration card has a provider picker, marks which providers already hold a key, can
  refresh the model list from the provider itself, and accepts a model id typed by hand — so a
  model released today is usable today, without a release of this extension.

### Changed

- Switching provider revokes the send consents, and the confirmation dialogs name the destination
  instead of always saying Anthropic. Consent to send to one company is not consent to send to
  another. Changing only the model or the token cap leaves consent alone.
- Disconnect now clears every stored key, for every provider, along with every consent.
- A cost estimate is shown only when the model's price is actually known, and it names the date of
  the price table. An unknown price reads as unknown rather than as a number: a wrong figure is
  worse than none, because only one of the two is believed.

### Note

- MVP completion criterion 10 asks for a local provider, and this slice does not add one. The
  OpenAI provider accepts a base URL, which is what an OpenAI-compatible local runtime needs, but
  no interface exposes it yet.
- OpenAI prices are not in the table: none were looked up, so those estimates read as unknown.

## [0.6.0] - 2026-08-21

### Added

- Generated diagrams: select text, choose Diagram in the selection toolbar, and pick one of four
  Mermaid types. The result renders in the panel with its source editable — editing re-renders
  immediately, with no further calls.
- Insert the diagram into the document at the end of the section the selection came from, as one
  undoable edit. The button names its destination, and the entry reports the line it used.
- Before writing, MDeepen re-reads the document and relocates the section by title and level. If
  the section has moved, vanished or become ambiguous, nothing is written and the entry says why.

### Changed

- The reader and the panel now share one Mermaid rendering engine, so a diagram fails the same way
  in both places: an error with the source preserved, never a blank space.

## [0.5.0] - 2026-08-21

### Added

- Chat with the open document: a question field in the AI panel, answers streamed into the same
  timeline as the actions, and a chip per section the answer was based on, each navigating to that
  section.
- Relevance ranking that needs no index and no embeddings — BM25 over IDF computed from the
  document's own sections, which is also why it needs no stopword list and works the same in any
  language. The section you are reading is always included.
- `Ctrl+Alt+A` focuses the question field.
- Chat has its own consent gate. The first question explains that every turn sends the sections
  MDeepen picks; after that it stops asking, and the dialog returns only when a secret is found in
  what that turn would send — the conversation history included.

### Changed

- The AI panel is one timeline: quick actions and questions produce entries in the same list, and
  Clear all clears the conversation.

### Fixed

- Disconnect now revokes the chat consent as well as the first-send consent. It only cleared the
  latter, so a newly configured key would have inherited permission to send chat context that it
  was never granted.

## [0.4.0] - 2026-08-20

### Added

- Document summaries in four styles: short, executive, technical, and key points, from the AI
  panel's grouped action menu.
- Documents too large for one request are split into parts, each condensed neutrally, then
  combined into a single answer in the requested style. Progress shows which part is being read,
  and Stop works throughout.
- A section too large to send whole is truncated, and both the confirmation dialog and the
  finished answer name it.

### Changed

- Document scope always shows the confirmation dialog, even when "Don't ask again" is set, and
  that dialog does not offer the checkbox — the consent given for one section is not consent to
  send a whole file. The host enforces this, so a message claiming otherwise cannot record the
  workspace consent either.
- The estimate for a document is labelled as projected: the reduce input is not knowable until
  every part has been read.

### Removed

- `buildSummarizeRequest`, a shim left behind when the action registry landed in 0.3.0.

## [0.3.0] - 2026-08-20

### Added

- Selection actions: select text in the reader and apply summarize, explain, explain simply,
  key terms, or create an example from a floating toolbar. The same five actions run over the
  current section from the AI panel.
- Answers record which action produced them and what they were applied to, and show the selected
  excerpt when the action came from a selection.
- Delete a single answer, or clear them all.
- `Ctrl+Alt+S` summarizes the current section; `Ctrl+Alt+O` focuses the outline filter.

### Changed

- Secret detection, masking and the cost estimate now run over the text actually being sent, so a
  selection action reports on the selection rather than the whole section.
- The `aiSummarizeSection` message was replaced by a generic `aiAction`.

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

[Unreleased]: https://github.com/AdSoares/MDeepen/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/AdSoares/MDeepen/releases/tag/v0.8.0
[0.7.1]: https://github.com/AdSoares/MDeepen/releases/tag/v0.7.1
[0.7.0]: https://github.com/AdSoares/MDeepen/releases/tag/v0.7.0
[0.6.0]: https://github.com/AdSoares/MDeepen/releases/tag/v0.6.0
[0.5.0]: https://github.com/AdSoares/MDeepen/releases/tag/v0.5.0
[0.4.0]: https://github.com/AdSoares/MDeepen/releases/tag/v0.4.0
[0.3.0]: https://github.com/AdSoares/MDeepen/releases/tag/v0.3.0
[0.2.0]: https://github.com/AdSoares/MDeepen/releases/tag/v0.2.0
[0.1.2]: https://github.com/AdSoares/MDeepen/releases/tag/v0.1.2
[0.1.1]: https://github.com/AdSoares/MDeepen/releases/tag/v0.1.1
[0.1.0]: https://github.com/AdSoares/MDeepen/releases/tag/v0.1.0
