## What changed

<!-- One or two sentences. What does this pull request do? -->

## Why

<!-- The reason the change is needed. Link the issue if there is one: Closes #123 -->

## How it was verified

<!-- Be specific and honest. "Tests pass" alone is not verification. -->

- [ ] `npm test` is green
- [ ] `npx tsc --noEmit` is clean
- [ ] `npm run build` succeeds
- [ ] Exercised by hand in the Extension Development Host (say what you did)

**Not verified:**

<!-- Say what you did NOT check. An honest gap is more useful than an implied
     guarantee. Write "nothing" only if that is true. -->

## Non-negotiables

Confirm the change preserves these, or explain why it does not (see CONTRIBUTING.md):

- [ ] The reader still works fully with no API key configured
- [ ] No content reaches the network before the user confirms the first send
- [ ] The API key stays in `SecretStorage` only — not in settings, files, logs, or the config object
- [ ] All network I/O stays in the extension host; the webview makes no requests

## Changelog

- [ ] `CHANGELOG.md` updated under `## [Unreleased]`, or this change does not need an entry
