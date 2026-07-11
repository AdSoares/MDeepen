# MDeepen — Markdown Intelligence Reader

Read Markdown, deeper. A paginated, section-based Markdown reader for VS Code.

## Slice 1 (this build)
- Open any `.md` in the reader (context menu, Command Palette, `Ctrl+Alt+M`).
- Outline tree with filter, read marks, and section navigation.
- Section pagination (default `##`, with fallback) + Previous/Next + `Alt+←/→`.
- Reading progress and estimated time; last position remembered per file.
- Full Markdown rendering (GFM tables, task lists, code blocks with copy, links) and Mermaid diagrams.
- Reading and focus modes (`Ctrl+Shift+F11` toggles focus mode); adjustable font size, column width, line spacing, theme.
- AI features are intentionally off in this slice.

## Develop
- `npm install`
- `npm run build` / `npm run watch`
- `npm test` (Vitest)
- F5 to launch the Extension Development Host.
- `npm run package` to produce a `.vsix`.
