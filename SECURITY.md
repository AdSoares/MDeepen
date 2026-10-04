# Security Policy

## Supported versions

MDeepen is pre-1.0. Only the latest release receives fixes.

| Version | Supported |
| ------- | --------- |
| 0.9.x   | yes       |
| < 0.9   | no        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through
[GitHub Security Advisories](https://github.com/AdSoares/MDeepen/security/advisories/new),
or by email to **adsoares100@gmail.com**.

Include what you found, how to reproduce it, and what an attacker could achieve.
You can expect an acknowledgement within 7 days and an assessment within 30 days.
Please give a reasonable window for a fix before disclosing publicly.

## What matters most in this project

MDeepen handles two things worth attacking: provider API keys, and the content
of your documents. The areas below are where a bug would hurt most, and are the
most useful places to look.

- **API key exposure.** Keys must exist only in VS Code `SecretStorage`:
  `mdeepen.anthropic.apiKey`, `mdeepen.openai.apiKey`, and one
  `mdeepen.compatible.apiKey:<origin>` per OpenAI-compatible endpoint. Any path
  that writes a key to `settings.json`, a workspace file, `globalState`, a log
  line, an error message, or the webview is a vulnerability. A key is sent in its
  own `aiSaveKey` message so it never rides inside the config object that is
  persisted.
- **A key reaching the wrong host.** A key is stored for the provider, or the
  endpoint origin, it was pasted for. Any path that sends it to a different
  destination — another provider, another origin, or a host reached through a
  redirect — is a vulnerability. So is anything that makes the OpenAI SDK fall
  back to `OPENAI_API_KEY` from the environment for a compatible endpoint.
- **Unconsented data egress.** Document content must never reach a remote
  destination before the user confirms sending to that destination. Consent is
  recorded per destination; a path that skips or bypasses that gate, or reuses
  consent given for one destination to send to another, is a vulnerability, even
  if the content looks harmless.
- **The "local" claim.** On a loopback endpoint (`localhost`, `127.0.0.0/8`,
  `[::1]`, decided from the URL with no DNS) the consent dialog is skipped and the
  panel says nothing leaves the machine. Any URL that is classified as loopback
  but reaches another host is a vulnerability: the classifier lives in
  `src/shared/destination.ts`.
- **Secret leakage through masking.** `src/extension/ai/secretDetection.ts` is
  best-effort pattern matching, not a guarantee — it recognises common shapes
  (`sk-…`, `AKIA…`, `ghp_…`, JWTs) and will miss others. Reports of shapes it
  should catch are welcome. Treat masking as a safety net, not a control: do not
  send content you cannot afford to send.
- **Webview boundary.** Rendered Markdown is sanitized and dangerous link schemes
  are blocked before they reach the host. The webview's Content Security Policy
  is `default-src 'none'` with a script nonce and no `connect-src`. Anything that
  achieves script execution, breaks out of the webview, or gets it to make a
  network request is a vulnerability.
- **Message contract.** Both directions are validated (`isHostToWebview`,
  `isWebviewToHost`). A crafted message that reaches a privileged host action —
  file access outside the document, arbitrary command execution — is a
  vulnerability.

## Out of scope

- The content of AI responses, including hallucination or bad summaries.
- Cost incurred by your own API usage. The pre-send estimate is an approximation
  based on a local character count, and it covers input tokens only.
- Vulnerabilities in VS Code itself or in third-party dependencies, unless MDeepen
  makes them exploitable in a way the upstream project does not.
