# Security Policy

## Supported versions

MDeepen is pre-1.0. Only the latest release receives fixes.

| Version | Supported |
| ------- | --------- |
| 0.2.x   | yes       |
| < 0.2   | no        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through
[GitHub Security Advisories](https://github.com/AdSoares/MDeepen/security/advisories/new),
or by email to **adsoares100@gmail.com**.

Include what you found, how to reproduce it, and what an attacker could achieve.
You can expect an acknowledgement within 7 days and an assessment within 30 days.
Please give a reasonable window for a fix before disclosing publicly.

## What matters most in this project

MDeepen handles two things worth attacking: an Anthropic API key, and the content
of your documents. The areas below are where a bug would hurt most, and are the
most useful places to look.

- **API key exposure.** The key must exist only in VS Code `SecretStorage` under
  `mdeepen.anthropic.apiKey`. Any path that writes it to `settings.json`, a
  workspace file, `globalState`, a log line, an error message, or the webview is a
  vulnerability. The key is deliberately sent in its own `aiSaveKey` message so it
  never rides inside the config object that is persisted.
- **Unconsented data egress.** Document content must never reach the network
  before the user confirms the first send in a workspace. A path that skips or
  bypasses that gate is a vulnerability, even if the content looks harmless.
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
