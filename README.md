# MDeepen — Markdown Intelligence Reader

Read Markdown, deeper. A paginated, section-based Markdown reader for VS Code.

## Slice 1.1 (this build)
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
- AI features are intentionally off in this slice.

## Develop
- `npm install`
- `npm run build` / `npm run watch`
- `npm test` (Vitest)
- F5 to launch the Extension Development Host.
- `npm run package` to produce a `.vsix`.
- **Audit note:** `npm audit --omit=dev` is clean. All advisories are in dev-tool dependencies only; none are shipped in the `.vsix`.
