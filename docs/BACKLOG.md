# Backlog

Work that was consciously deferred, with the reason and where the groundwork already sits. Each
item was decided, not forgotten — that distinction is the point of this file. The reasoning lives
in the spec named beside each entry; this is the index.

## Deferred by decision

### Retry and backoff

Deferred twice, in Slice 2.3 and again in 2.4, each time in writing.

A chat turn and a section action are single requests: a 429 costs one retry the user can trigger
by asking again. The consumer that actually bleeds is the Slice 2.2 map-reduce, where a rate limit
on part seven of twelve discards the six parts already paid for. That is still one consumer, and
designing backoff against one consumer while claiming two is how it gets designed wrong.

See `docs/superpowers/specs/2026-08-21-mdeepen-slice2.3-chat-design.md`, the header note and §8.

### Caching the map-reduce condensations

Running two document-summary styles over an unchanged document pays for the map phase twice. A
cache keyed on the document text would fix it. No evidence yet that anyone runs two styles over
the same document, so the cost of a cache — invalidation on every edit — is not yet earned.

See `docs/superpowers/specs/2026-08-20-mdeepen-slice2.2-document-summary-design.md`, §9.

## Open loose ends

### OpenAI prices are not in the table

`PROVIDERS.openai.inputPricePerM` is empty: no prices were looked up. The consequence is visible
and correct — the confirmation dialog reads "not known for this model" instead of a figure, rather
than showing an invented one. Filling it in is one line per model, plus updating
`PRICE_TABLE_DATE`.

### Two smokes were never run

Slices 2.4 and 2.5 shipped with their integration behaviour unverified, at the user's direction.
`docs/smoke/README.md` says what that leaves untested, and each plan's Task 8 Step 6 has the
checklist.

The 0.7.1 patch is the argument for running them: a defect that broke the OpenAI provider on every
successful request passed spec, plan, review and CI, and was caught only by writing down what the
SDK actually returns.

### `private: true` and the Marketplace

`package.json` carries `"private": true`, which blocks `vsce publish`. If the Marketplace ever
becomes the target rather than a `.vsix` in the repo, that is a decision to take deliberately —
it is not an oversight.

### The extension is disabled in Restricted Mode

Found on 2026-10-03 while installing the Slice 2.6 smoke build: in a workspace that is not trusted,
VS Code disables MDeepen entirely and says nothing. The reason is that `package.json` declares no
`capabilities.untrustedWorkspaces`, and VS Code treats a missing declaration as "not supported". A
freshly cloned repository or a folder from a download is exactly where someone opens a README to
read it, and the reader is not there.

Reading Markdown runs nothing from the workspace, so declaring `supported: "limited"` is the likely
answer. The reader would work untrusted, and the two capabilities with consequences would need
trust: the AI features, which send content off the machine, and diagram insertion, which writes to
the file. That split still has to be designed: which UI says why AI is off, and whether
`isWorkspaceTrusted` is checked in the host, the webview, or both.

### Four minors from the Slice 2.6 review

The final review of 2.6 found these and graded them minor; none breaks the privacy promise on its
own, and each was left in writing rather than fixed:

- The OpenAI SDK still reads `OPENAI_ORG_ID`, `OPENAI_PROJECT_ID` and `OPENAI_CUSTOM_HEADERS` from
  the environment and sends them to any compatible host. The first two can be nulled in the
  constructor; custom headers need a `fetch` wrapper.
- HTTP redirects are followed. A loopback server answering 307/308 to a remote URL would resend
  the request body there (the `Authorization` header is stripped). `fetchOptions: { redirect:
  'error' }` for `compatible` would close it.
- The compatible provider button's title says "A key is stored for this provider" whenever any
  origin holds a key or a keyless endpoint is active.
- The host never checks `isConfigured` before sending. A forged message could drive a compatible
  endpoint with an empty model; it fails locally, but the guard belongs in the host.

## Out of the MVP by design

Not backlog so much as scope, recorded here so nobody re-proposes them as gaps: persisted AI
history between sessions (FR-MVP-035 excludes it), chat across several documents, embeddings or
any persisted index, stemming, and suggested follow-up questions.
