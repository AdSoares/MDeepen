# MDeepen — Markdown Intelligence Reader

Read Markdown, deeper. A paginated, section-based Markdown reader for VS Code.

## Reader (Slices 1 - 1.2)
- Open any `.md` in the reader (context menu, Command Palette, `Ctrl+Alt+M`).
- Outline tree with filter, read marks, and section navigation.
- Section pagination (default `##`, with fallback) + Previous/Next + `Alt+←/→`.
- Reading progress and estimated time; last position remembered per file.
- Full Markdown rendering (GFM tables, task lists, code blocks with copy, links) and Mermaid diagrams.
- Read marks: dwell-based (5s) and persisted per file; skip-ahead doesn't mark skipped sections; going back doesn't unmark.
- Column width: steps of 100px up to full width ("Cheia"); toggleable outline and AI panels.
- Draggable panel borders with layout persistence; UI preferences (width, spacing, theme) persisted across sessions.
- Reading and focus modes (`Ctrl+Shift+F11` toggles focus mode); adjustable font size, column width, line spacing, theme.
- Manual refresh button to reload Markdown; pagination-level picker to set section heading level (H1–H6).

## AI foundation (Slice 2.0, this build)
- **Bring your own key.** Configure a remote Anthropic provider from the AI panel or the
  `MDeepen: Configure AI...` command. The key is stored in the VS Code secret store - never in
  `settings.json`, never in a workspace file, never in the Markdown.
- **Nothing is sent without your say-so.** The first remote send in a workspace opens a confirmation
  dialog showing the file and section, the model, and a locally computed token and cost estimate
  (no network call is made to produce it). "Don't ask again" is per workspace.
- **Secret detection.** The section is scanned for API-key-shaped strings (`sk-...`, `AKIA...`,
  `ghp_...`, JWTs) before the dialog appears. If any are found, masking is pre-selected and the
  detected spans are replaced with a redaction marker before the text leaves your machine.
- **Summarize section**, streamed token by token, with Stop generating (a stopped answer keeps
  whatever arrived), a citation chip back to the source section, and Copy.
- All network access happens in the extension host. The webview makes no requests, and its CSP
  carries no `connect-src`.
- **Reading never depends on AI.** With no key configured, pagination, outline, read marks,
  progress and navigation all work exactly as before, and every AI error is recoverable.
- Still to come in later slices: chat with the document, selection-scoped actions and generated
  diagrams.

## Develop
- `npm install`
- `npm run build` / `npm run watch`
- `npm test` (Vitest)
- F5 to launch the Extension Development Host.
- `npm run package` to produce a `.vsix`.
- **Audit note:** `npm audit --omit=dev` is clean. All advisories are in dev-tool dependencies only; none are shipped in the `.vsix`.
