# Handoff: MDeepen — Markdown Intelligence Reader (VS Code extension)

## Overview
MDeepen is a Visual Studio Code extension that turns Markdown files into an intelligent, paginated reading experience with an integrated AI assistant. The primary surface is a **Webview** with three panels: an outline/section tree, the rendered section content, and an AI assistant (chat + quick actions), plus a status bar with progress. This bundle documents 18 screens/states (S1–S18) covering the reader, AI flows, advanced views, configuration, and empty/error/loading states.

The design targets a **native VS Code look** in both light and dark themes, driven entirely by VS Code theme variables (`--vscode-*`). It prioritizes text legibility, controlled density, and progressive disclosure of AI features.

## About the Design Files
The files in this bundle are **design references created in HTML** — a live prototype showing the intended look and behavior. They are **not production code to copy directly**.

- `MDeepen Gallery.dc.html` is a "Design Component" (a streaming HTML component format). `support.js` is its runtime. Open the HTML file in a browser to explore all 18 screens and interact with the S1 reader.
- Your task is to **recreate these designs inside the real VS Code extension Webview**, using its established environment. The idiomatic target is a Webview built with the VS Code Webview UI Toolkit (or plain HTML/CSS/TS) that inherits the editor's theme via the injected `--vscode-*` CSS variables. If you build the panel with React/Preact, use the codebase's existing patterns.
- Do **not** ship the `.dc.html`/`support.js` files. They are documentation of intent only.

## Fidelity
**High-fidelity (hifi).** Colors, typography, spacing, layout, component states, and the core interaction (section pagination + streaming AI chat) are all final and intended to be recreated closely. The one caveat: icons in the prototype are hand-drawn inline SVGs standing in for VS Code **Codicons** — in the real extension, use the Codicon font (`@vscode/codicons`) for all icons. The diagram preview (S10) is a static SVG standing in for a real **Mermaid** render.

---

## Design language & platform rules
- **Theme-driven:** every color comes from a VS Code theme variable. Never hardcode chrome colors — read them from the Webview's injected CSS variables so the panel follows the user's active theme. The prototype ships explicit dark + light fallback values (below) for reference and for non-VS-Code preview only.
- Works in light and dark themes; usable on small monitors; panels resizable and hideable; keyboard-navigable; visible focus; no reliance on color alone for state; never mutate the source `.md` without explicit confirmation.
- Avoid: large decorative gradients, heavy shadows, over-rounded cards, saturated colors, mobile-app affordances.

## Design tokens

### VS Code theme variables used (recreate by reading them live from the Webview)
```
--vscode-editor-background            --vscode-editor-foreground
--vscode-sideBar-background           --vscode-descriptionForeground
--vscode-activityBar-background       --vscode-activityBar-foreground
--vscode-activityBar-inactiveForeground
--vscode-titleBar-activeBackground    --vscode-titleBar-activeForeground
--vscode-statusBar-background         --vscode-statusBar-foreground
--vscode-button-background            --vscode-button-foreground
--vscode-button-hoverBackground       --vscode-button-secondaryBackground
--vscode-focusBorder
--vscode-input-background             --vscode-input-foreground
--vscode-input-border                 --vscode-input-placeholderForeground
--vscode-list-hoverBackground         --vscode-list-activeSelectionBackground
--vscode-panel-border                 --vscode-widget-border
--vscode-editorWidget-background      --vscode-textLink-foreground
--vscode-errorForeground              --vscode-badge-background / -foreground
--vscode-textCodeBlock-background     --vscode-textBlockQuote-background
```

### Fallback palette (reference values baked into the prototype)
| Token | Dark | Light |
|---|---|---|
| editor.background | `#1f1f1f` | `#ffffff` |
| editor.foreground | `#cccccc` | `#3b3b3b` |
| sideBar / activityBar / titleBar / statusBar bg | `#181818` | `#f8f8f8` |
| descriptionForeground | `#9d9d9d` | `#767676` |
| button.background (accent) | `#0078d4` | `#005fb8` |
| focusBorder | `#0078d4` | `#005fb8` |
| input.background | `#313131` | `#ffffff` |
| input.border / widget.border | `#3c3c3c` / `#333` | `#cecece` / `#e5e5e5` |
| list.hoverBackground | `#2a2d2e` | `#f0f0f0` |
| list.activeSelectionBackground | `#04395e` | `#cfe4fb` |
| panel.border | `#2b2b2b` | `#e5e5e5` |
| editorWidget.background | `#202020` | `#f8f8f8` |
| textLink.foreground | `#4daafc` | `#005fb8` |
| errorForeground | `#f14c4c` | `#cd3131` |

### Semantic status colors (non-VS-Code custom tokens, `--md-*`)
| Purpose | Dark | Light |
|---|---|---|
| warning (`--md-warn`) | `#cca700` | `#bf8803` |
| success (`--md-success`) | `#89d185` | `#388a34` |
| info (`--md-info`) | `#3794ff` | `#1a85ff` |
| AI accent (`--md-ai`) | `#9d7cd8` | `#8250df` |

Status colors are always paired with an icon and/or text label — never used as the sole signal.

### Typography
- **UI text:** Inter / system-ui. Sizes 10.5–15px. Weights 400/500/600.
- **Reading body (rendered Markdown):** `Source Serif 4`, serif — body 15.5px / line-height 1.72; lead 17px; h1 27px/600; h2 18px/600 (Inter). This serif choice is deliberate: it makes long-form reading calmer than the default monospace-heavy preview.
- **Code / monospace:** `JetBrains Mono` (any monospace). Inline code 12–13px; code blocks 12.5px / line-height 1.6.
- Presentation mode (S6) uses larger serif: title 44px/600, list items 19px.

### Spacing, radius, elevation
- Spacing scale (px): 4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 22 / 38.
- Radius: inputs & list rows 5–7px; cards/panels 8–11px; pills/chips 20px (fully rounded); avatars/icon tiles 6–7px.
- Chrome bars: title bar 37px, activity bar 48px wide, breadcrumb 34px, section-nav footer 52px, status bar 25px.
- Elevation: cards use a single soft shadow (`0 12px 40px rgba(0,0,0,.30)` dark / `.16` light). Popovers/modals slightly stronger. Keep shadows minimal per the brief.
- Reading column max-width: **700px**, centered, ~38–40px padding.

---

## Screens / Views

Each screen has a stable ID (S1–S18) used as its anchor in the gallery.

### S1 — Reader (three-panel layout) · **the hero, fully interactive**
- **Purpose:** read a Markdown doc section-by-section with outline navigation and an AI assistant.
- **Layout (left→right):** Title bar (37px) → body row → Status bar (25px). Body row = Activity bar (48px) + Outline sidebar (252px) + Editor/content (flex, min-width 0) + AI panel (340px).
  - **Title bar:** mac traffic-light dots (12px, `#ff5f57/#febc2e/#28c840`), centered filename `order-service.md — MDeepen — Visual Studio Code`, right-side split-editor Codicons.
  - **Activity bar:** vertical Codicons (explorer, search, source-control, MDeepen book icon = active with 2px accent bar, at bottom account+settings). Active icon uses `activityBar.foreground`, others `activityBar.inactiveForeground`.
  - **Outline sidebar:** header `MDEEPEN · OUTLINE` (11px, .06em tracking) + filter input + tree rows. Each row: chevron, 2-digit section number (mono, muted), title, and a green check when read. Active row = `list.activeSelectionBackground`, weight 600. Footer: "6 sections · 2 read".
  - **Editor/content:** breadcrumb bar (`order-service.md › <Section>`), scrollable reading column (700px, serif), then a nav footer with `‹ Previous` (secondary button) / `Section N of 6` (centered) / `Next section ›` (primary accent button).
  - **AI panel:** header row (AI avatar tile `--md-ai`, "MDeepen AI", trash/clear icon) → persona pill ("Technical persona ▾") + provider badge ("● Local · Ollama" in success color) → 3 quick-action tiles (Summarize / Explain / Diagram) → scrollable chat history → optional "Stop generating" bar while streaming → suggestion chips + input row with accent send button.
- **Interactions (all working in the prototype):**
  - Click any outline row → content, breadcrumb, status-bar section indicator, and read-progress update.
  - Previous / Next buttons paginate (clamped to first/last).
  - Quick actions (Summarize/Explain/Diagram) append a synthetic user message then **stream** an AI reply word-by-word (~55ms/2 words), ending with source-citation chips (`§NN Title`) and copy/regenerate/thumbs actions.
  - Typing a question + Enter appends the question and streams a reply.
  - "Stop generating" halts the stream and keeps the partial text (marked with an ellipsis).
  - Clear (trash) empties the chat.
- **Status bar:** left = progress mini-bar + "NN% read"; then current section · reading estimate; right = provider status ("● Ollama · llama3.1"), and clickable **Focus** / **Present** entries.

### S2 — Empty state (no document)
Full window (title bar + activity bar + empty editor). Centered welcome: 64px rounded icon tile (info-tinted), h1 "Read Markdown, deeper." (serif), one-line explanation, primary "Open Markdown file" + secondary "View example". Below: `RECENT` list (3 rows, first hovered) with file name + folder; a keyboard hint `⌘⇧M Open reader`; and a warning pill "⚠ AI not configured".

### S3 — No AI configured (reading still works)
A 384px AI-panel card. Heading "AI features are off", explanation that reading/pagination/navigation still work, a 3-item list of gated features (summaries, chat, diagrams), then two large choice buttons: "Run locally · Ollama" (success-tinted, "Private. Nothing leaves your machine.") and "Connect a remote provider" (info-tinted). Footer note about remote sends always being confirmed first.

### S4 — AI configuration
720px settings card. Segmented Local/Remote mode toggle; two-column Provider + Model selects; Endpoint URL (mono); API key (masked, "not required for local"); Max tokens + Temperature slider (0.3, shown at 30%); a "Test connection" secondary button with a success result ("Connected · 128 ms") and a cost pill ("Local · $0.00 / 1K tokens"); an info blockquote about local privacy.

### S5 — Focus mode
900px window, chrome removed. A thin 3px progress bar pinned to the top (62% filled, accent). Top-right: "3 / 6" + "✕ Exit focus" pill. Centered 600px serif reading column (title 27px, body 17px/1.75, a blockquote). Bottom-center: minimal ‹ › nav arrows.

### S6 — Presentation mode
1000px dark slide (`#0d0d0f`, light text regardless of theme). Section kicker ("03 · DATA FLOW", mono, tracked), large serif headline (44px), 3 numbered points (blue-tinted number badges). Bottom bar: filename, "03 / 06" counter, fullscreen icon, ‹ › arrows. Top-right keyboard hints (→ next · N notes · Esc exit).

### S7 — Text-selection menu (progressive disclosure)
660px content card with a highlighted text selection and a floating popover (230px) anchored near it. **Top row = 4 primary icon actions** (Explain [active/hovered], Summarize, Simplify, Ask), then a divider, then a **secondary list** (Create example, Create diagram, Turn into table, Identify terms). Keeps the menu small; less-common actions live in the list.

### S8 — Summary result
460px result card. Header: AI avatar, "Summary", "AI generated" outline badge (AI accent). A wrapping segmented control of lengths: **One line** (active) / Paragraph / Detailed / Key points / Executive / Technical. Serif summary paragraph. Footer: Copy, Regenerate, thumbs up/down. Switching length re-renders in place without re-asking.

### S9 — Explanation result
460px card. Header with a 3-way level segmented control (Beginner / **Intermediate** / Expert). Serif explanation with an inline code span. `RELATED CONCEPTS` chip row (link-colored). Two follow-on buttons: "Generate example" / "Generate diagram". Footer feedback: "Was this helpful?" with Yes / No pills.

### S10 — Diagram generation (Mermaid)
820px card. Toolbar: diagram icon, "Diagram", a "Sequence ▾" type selector, and right-aligned regenerate / copy / export icons. Body split: **preview** (left, renders the Mermaid diagram — here a static sequence-diagram SVG placeholder) and **code editor** (right, 320px, mono, syntax-tinted `sequenceDiagram` source). Footer: a warning "Inserting writes to the source file" + primary "Insert into Markdown" button. Insertion must ask for confirmation before writing the `.md`.

### S11 — Semantic search
640px card. Focused search field ("how are retries handled", "3 results"). Filter chips: **Semantic** (active) / Exact text / This file / Workspace. Result rows show file › §section, a match-percentage badge (success ≥90%, info otherwise), and a snippet with the matched phrase highlighted. Clearly distinguishes semantic ranking from literal text matches.

### S12 — Glossary (+ inline tooltip)
Two cards. **Glossary panel (560px):** 190px term list (Saga active) + detail pane: term title with a complexity badge ("Advanced", warn), `IN THIS DOCUMENT` contextual definition, `GENERAL` definition, "N occurrences ›" link + related terms. **Tooltip demo (280px):** a sentence with a dotted-underline "saga" term and a floating tooltip card (title, complexity badge, short definition, "Open in glossary ›").

### S13 — Annotations & bookmarks
600px panel. Header "Notes · 3" + Export. Add-note form: focused textarea, a type chip (Question, warn-tinted), a tag chip (#backoff), "+ tag", and a Save button. Notes list: each row has a left color bar by type (Question=warn, Insight=info, Bookmark=success), a type label + §anchor + timestamp, the note text, tags, and hover actions (jump-to, edit, delete).

### S14 — Document comparison
840px card. Header: v1.2 → v1.5 with a summary "+6 added / −2 removed / 3 meaning changes". Body split: **Textual diff** (left, serif, added=green-tint, removed=red-tint strikethrough) and **Semantic changes** (right, 320px) — cards flagging meaning shifts ("Retry threshold changed 3→5", warn) and clarifications (info), each with an **Impact** note.

### S15 — Quality analysis
760px card. Header: a conic-gradient score ring ("76" overall) + label + a severity filter. Six metric bars (Clarity 82, Structure 91, Completeness 68, Consistency 77, Readability 85, Freshness 54) colored by band (success / warn / error). Issues list: severity tag (HIGH/MED/LOW), title, evidence + **Fix** recommendation + estimated effort, and a `§section →` jump link.

### S16 — Send-to-AI confirmation (modal)
720px frame with a dimmed backdrop and a 420px centered modal. Title "Send content to Anthropic?", explanation it's the first remote send. A summary box (Content / Model / Estimated tokens ~1,240 / Estimated cost ≈$0.006). A warning strip: "1 possible secret detected" (API-key-like string) with a **Mask** action. Footer: "Don't ask again" checkbox, **Cancel** (secondary), **Mask & send** (primary).

### S17 — Error states (grid of 6)
266px cards, each: icon + title + human-readable explanation + recovery action(s). Covered: **Can't reach the model** (Retry / Settings; reading still works), **Invalid API key** (401 → Update key), **Rate limit reached** (auto-retry countdown), **Document is large** (send section only), **Diagram won't render** (Mermaid parse error, source preserved, "Fix with AI"), **Not enough evidence** (low-confidence warning, "Search workspace"). Every error is recoverable and never blocks reading.

### S18 — Loading states (grid of 3)
266px cards: **Skeleton** (shimmer bars), **Streaming** (AI avatar + text with a blinking caret + Stop button), **Progress** (spinner + "Indexing for semantic search…" + determinate bar "18 of 41 sections" + Cancel + "You can keep reading while this runs" note).

---

## Interactions & Behavior (implementation notes)
- **Section pagination:** single source of truth is an `activeSectionIndex`. Outline click, Previous, Next all set it; content, breadcrumb, status indicator, and progress derive from it. Progress % = `activeIndex / (total-1) * 100`.
- **AI streaming:** simulate/stream token-by-token. In production, stream real tokens from the provider; render a blinking caret while streaming; expose a Stop control that keeps partial output; attach source citations after completion. Distinguish AI-generated content from source content (AI avatar, "AI generated" badge, AI-accent color).
- **Confidence:** when the document doesn't support an answer, surface the low-confidence warning (S17) rather than a normal answer.
- **Privacy:** first remote send always triggers S16; detect secrets/PII and offer masking; local (Ollama) never leaves the machine and shows the success badge.
- **Source edits:** inserting a diagram (S10) or any write to the `.md` requires explicit confirmation.
- **Animations:** blink caret ~1s; skeleton shimmer ~1.4s linear; spinner 1s linear; keep transitions subtle. Respect `prefers-reduced-motion`.
- **Keyboard & a11y:** full keyboard nav; visible focus (use `focusBorder`); ARIA labels on icon-only buttons; icons paired with text where meaning matters; readable error copy; do not rely on color alone.

## Responsive behavior
- **Wide:** all three panels visible (outline + content + AI).
- **Medium:** outline collapsible; AI becomes a toggleable side panel.
- **Narrow:** content is the focus; outline moves to a drawer; AI moves to a tab/bottom panel; actions compact into overflow.

## State management
Minimum state for the reader:
- `theme` ('dark' | 'light') — in the real extension this comes from VS Code, not a toggle.
- `activeSectionIndex` (number)
- `panels` — `{ outlineVisible, aiVisible }`
- `messages` — array of `{ role: 'user' | 'ai', text, sources?: [{ s, t }], stopped? }`
- `streaming` (bool) + `streamBuffer` (string) for the in-flight reply
- AI config — `{ mode: 'local'|'remote', provider, model, endpoint, apiKey, maxTokens, temperature }`
- annotations, glossary index, search index, quality report — as the corresponding views are built.

## Microcopy (from the prototype — English; the original brief is Portuguese, adapt as needed)
- Empty: "Read Markdown, deeper." / "AI not configured"
- No AI: "AI features are off" / "Private. Nothing leaves your machine."
- Send confirm: "Send content to Anthropic?" / "1 possible secret detected" / "Mask & send"
- Diagram insert: "Inserting writes to the source file"
- Connection error: "Can't reach the model … Reading works as usual."
- Low confidence: "Not enough evidence … This response may be unreliable — treat with care."
- Large doc: "This file exceeds the model's context. MDeepen will send the current section only."
- Progress: "You can keep reading while this runs in the background."

## Assets
- **Icons:** all inline SVGs in the prototype are placeholders for **VS Code Codicons** (`@vscode/codicons`). Replace them with the matching Codicon glyphs in the real extension.
- **Diagrams:** S10's SVG is a placeholder — integrate real **Mermaid** rendering.
- **Fonts:** Inter (UI), Source Serif 4 (reading body), JetBrains Mono (code). In a Webview, prefer bundling these or fall back to `system-ui` / VS Code's editor font. There are no image assets.
- No Anthropic brand assets are used (the "Anthropic" provider name in S16 is example copy).

## Files
- `MDeepen Gallery.dc.html` — the full design prototype (all 18 screens; S1 interactive). Open in a browser to explore.
- `support.js` — runtime required by the prototype (do not ship).
- The reader's placeholder content is a fictional "Order Service — Architecture Guide"; substitute real Markdown parsing/rendering in production.
