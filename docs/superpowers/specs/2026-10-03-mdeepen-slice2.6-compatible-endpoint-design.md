# MDeepen — Slice 2.6: An OpenAI-Compatible Endpoint, and the Local Provider — Design

**Status:** approved in conversation 2026-10-03, pending review of this document
**Depends on:** Slice 2.5 (the `PROVIDERS` table, per-provider keys, consent that follows the
destination, `OpenAiProvider` with its optional `baseUrl`).

**Closes MVP completion criterion 10** and FR-MVP-033. Criterion 10 asks for at least one remote
**and one local** provider; FR-MVP-033 asks that, with a local provider configured, the interface
says the data is not sent to a remote service. Both were deferred on 2026-08-25 and recorded in
`docs/BACKLOG.md`.

---

## 1. Scope decision

The local provider was planned as "expose `baseUrl` and point it at Ollama". The user asked for
more: any OpenAI-compatible endpoint — Ollama or LM Studio on this machine, a server on the LAN,
or a hosted service such as Groq or OpenRouter.

Those are one concept, not three. They speak the same protocol and run through the same
`OpenAiProvider`. What differs between them is not code; it is **where the content goes**. So this
slice adds **one** provider, `compatible`, with a free URL and an optional key, and derives every
privacy behaviour from the address rather than from a menu choice.

A separate "Local" provider was rejected: the same URL would then be reachable from two places
with two different rules.

In scope:

- A `compatible` provider with a user-supplied base URL and an optional key.
- A pure classification of the destination: loopback or not, TLS or not.
- Keys stored per origin.
- Consent keyed on the destination, so changing the URL is changing where content goes.
- The loopback rules: no consent gates, no secret masking, no cost, and a badge saying so.

Out of scope, with reasons, in §9.

---

## 2. The destination

Everything this slice promises rests on one pure function, in `src/shared/destination.ts` so the
host and the webview apply the same rule rather than two copies of it:

```ts
export type Destination =
  | { ok: true; origin: string; host: string; isLoopback: boolean; isTls: boolean }
  | { ok: false; error: string };

export function describeDestination(baseUrl: string): Destination;
```

- `origin` and `host` come from `new URL(baseUrl)`, which also normalises them.
- Only `http:` and `https:` are accepted. Anything else, an empty string or an unparseable URL is
  `ok: false`, and saving is refused.
- `isTls` is `protocol === 'https:'`.
- `isLoopback` is true for exactly: the hostname `localhost`, any IPv4 address in `127.0.0.0/8`,
  and `[::1]`.

**No DNS resolution.** A name that resolves to 127.0.0.1 is classified as remote. That is
deliberate: the classification may only err towards asking for consent it did not need, never
towards promising privacy it cannot keep. Resolving at send time would also open a rebinding race
for no real gain. For the same reason `0.0.0.0`, `localhost.` with a trailing dot,
`localhost.example.com`, `127.0.0.1.nip.io` and IPv4-mapped IPv6 addresses are all remote.

---

## 3. The provider

```ts
export type ProviderId = 'anthropic' | 'openai' | 'compatible';

compatible: {
  label: 'OpenAI-compatible endpoint',
  secretKey: 'mdeepen.compatible.apiKey',   // a prefix: the real name carries the origin, §4
  models: [],                               // no curated list: fetched from /models or typed
  defaultModel: '',
  inputPricePerM: {},
  defaultBaseUrl: 'http://localhost:11434/v1',  // Ollama, the commonest case
}
```

`createProvider` gains a `case 'compatible'` that builds an `OpenAiProvider` with the configured
`baseUrl` and throws if it is missing. No new provider class.

**The request field.** `toOpenAiRequest` sends `max_completion_tokens`, confirmed against OpenAI's
own models on 2026-08-23. Ollama and most compatible runtimes know only the older `max_tokens`.
For `compatible` the request carries `max_tokens`, the more widely supported field;
`toOpenAiRequest` takes the provider id to decide. This is a guess about runtimes this extension
has never been run against, and the smoke (§8) exists to confirm it on a real Ollama.

**Usage.** If a runtime does not return `usage` on the final chunk, the token counts stay zero.
On loopback that costs nothing, since the cost is zero anyway; remotely the cost is already
reported as unknown.

---

## 4. Keys and "configured"

### 4.1 One key per origin

Under a free URL, one key slot per provider would mean that saving an OpenRouter key and then
changing the URL sends that key to the new host on the next request. Slice 2.5 settled the
principle — a credential is never moved between destinations silently — and this applies it.

The secret name becomes `mdeepen.compatible.apiKey:<origin>`. Switching between endpoints and back
never asks for the key again, which is how Anthropic and OpenAI already behave.

`SecretStorage` cannot enumerate its keys, so the store keeps the list of origins holding a key
in the memento, under `mdeepen.compatible.keyedOrigins`. `setKey` adds to it; `clearAllKeys`
walks it, deletes each secret, and empties it, alongside the Anthropic and OpenAI keys.

**Deleting keys is no longer enough for Disconnect.** A keyless endpoint stays configured after
every key is gone, so Disconnect would leave AI on. When the active provider is `compatible`,
Disconnect also resets the config to the default provider, which holds no key after the clear.
Disconnect therefore keeps its meaning: afterwards nothing can be sent anywhere. *(Amended
2026-10-03 while writing the plan.)*

### 4.1a Never an absent key

`OpenAI` falls back to the `OPENAI_API_KEY` environment variable when it is constructed without
a key, and refuses an empty one. A keyless endpoint built with an absent key would therefore
either fail, or — worse — send the user's real OpenAI key to whatever host the URL names.
`createProvider` passes a fixed placeholder, `no-key`, whenever the credential is empty, and a
test pins that the environment key is never picked up. *(Added 2026-10-03 while writing the
plan.)*

### 4.2 Configured no longer means "has a key"

Ollama and LM Studio take no key. For `compatible`, `isConfigured()` is true when the base URL is
valid (`describeDestination(...).ok`) and the model is non-empty. The key is optional.

That changes the controller. The three run paths — section, document and chat — each start with
`if (!key) → 'No API key set'`. They move to:

- `store.getCredential()`, which returns the active key, or `''` for a provider that does not
  require one;
- a guard on `isConfigured()` rather than on the key's presence.

A remote endpoint that does require a key and has none answers 401, which `classifyError` already
reports as `auth`.

`configuredProviders()` reports `compatible` when it is configured in the sense above, and the
card asks separately whether **the origin currently typed** holds a key.

---

## 5. Consent follows the destination

`aiSaveConfig` today revokes `firstSendConfirmed` and `chatConfirmed` when `provider` changes. It
now compares a destination key instead:

```ts
destinationKey(config) =
  config.provider === 'compatible' ? `compatible:${origin}` : config.provider;
```

For Anthropic and OpenAI nothing changes. For `compatible`, moving from `openrouter.ai` to
`192.168.0.50` revokes, and so does moving from Ollama's `localhost:11434` to LM Studio's
`localhost:1234` — harmless, because loopback asks for no consent. Changing the model or
`maxTokens` still revokes nothing.

---

## 6. Loopback

When `describeDestination(baseUrl).isLoopback`:

| Gate | Remote (unchanged) | Loopback |
| --- | --- | --- |
| First send of a section or selection (FR-MVP-032) | confirms | **skipped** |
| Chat gate | confirms | **skipped** |
| Secret warning and masking | shown | **suppressed** |
| Whole document | always confirms | **still confirms** |
| Cost estimate | the table, or "not known" | "local, no cost" |

The first two follow from FR-MVP-032 itself, which asks for confirmation on the first send *to a
remote provider*. Masking is suppressed because nothing leaves the machine, and masking would only
make the answer worse.

The document gate stays because it was never only about privacy. A document run is up to
`MAX_MAP_STEPS` requests, and on a local model that can take minutes. Its dialog changes wording:
instead of destination and cost it says the content stays on this machine, and keeps the number
of requests and the truncated sections.

---

## 7. Dialogs and interface

### 7.1 The dialog names the real destination

For a remote `compatible` endpoint, the provider label in the confirmation dialog is the **host**
(`openrouter.ai`, `192.168.0.50:11434`). "OpenAI-compatible endpoint" does not answer the question
the dialog exists to ask.

For an `http:` origin that is not loopback, the dialog adds a line: *no TLS — the content travels
over the network in clear text.*

### 7.2 The configuration card

When **OpenAI-compatible endpoint** is selected:

- A **Base URL** field appears, prefilled with `http://localhost:11434/v1`, with a hint naming the
  two common defaults: Ollama `:11434/v1`, LM Studio `:1234/v1`.
- The key field is labelled **optional**. Its "a key is already stored" state is computed for the
  **origin typed**, not for the provider.
- **Refresh models** is enabled without a key: Ollama lists its models unauthenticated. The list
  comes from `/models`, and the existing free-text model id stays beside it.
- The URL is validated in the card with `describeDestination`, and a line under it states, as the
  user types, what the interface is about to promise: **"Stays on this machine"** or
  **"Sends to `host`"**.

### 7.3 The panel

The badge that shows provider and model gains **"Local · nothing leaves this machine"** when the
active destination is loopback. This badge is what satisfies FR-MVP-033.

### 7.4 Contract

```ts
// host → webview
| { type: 'aiConfigState'; configured: boolean; provider: string; model: string;
    configuredProviders: string[]; local: boolean; baseUrl?: string; keyedOrigins: string[] }
| { type: 'aiConfirmNeeded'; summary: { …; provider: string; local: boolean; plainHttp: boolean; … }; secrets: { … } }
```

`provider` in the summary is the host for a remote `compatible` endpoint, per §7.1. `aiSaveConfig`
and `aiSaveKey` keep their shapes: the base URL travels inside `AiConfig`, and the key is stored
against the origin of the config active when it is saved — the same rule 2.5 used for providers.
The card therefore saves the config before the key.

---

## 8. Testing

Pure, by TDD:

- **`describeDestination`** — the piece the promise rests on. Loopback: `localhost`,
  `localhost:1234`, `127.0.0.1`, `127.8.8.8`, `[::1]`. Remote: `0.0.0.0`, `192.168.0.50`,
  `localhost.`, `localhost.example.com`, `127.0.0.1.nip.io`, `[::ffff:127.0.0.1]`,
  `openrouter.ai`. Refused: `ftp://…`, an empty string, an unparseable URL. `isTls` for `http:`
  against `https:`.
- **The `PROVIDERS` table.** The consistency test requires each `defaultModel` to be in its own
  `models`. `compatible` gets an explicit exception — it has no curated list — and the rule keeps
  holding for the others.
- **`toOpenAiRequest`.** `compatible` carries `max_tokens`; `openai` keeps
  `max_completion_tokens`.
- **`AiConfigStore`.**
  - Keys of two origins do not mix.
  - Changing the URL does not carry the key along.
  - `clearAllKeys` deletes every listed origin as well as the Anthropic and OpenAI keys, and
    empties the list.
  - `isConfigured` for `compatible` without a key is true with a valid URL and a model, false
    with either missing.
  - `getCredential` returns `''`, not `undefined`, for a keyless `compatible`.
- **`estimateCost`.** Loopback reports no cost; a remote `compatible` reports unknown.

Controller, with the existing fake provider:

- Changing the origin revokes both flags; changing only the model does not.
- On loopback, a section send and a chat turn go out with **no** `aiConfirmNeeded`, even when the
  text contains a detected secret.
- A document run on loopback **still** confirms, with `local: true`.
- A remote `http:` origin produces `plainHttp: true`, and the summary's `provider` is the host.
- A keyless `compatible` never reaches "No API key set".

### 8.1 Smoke

`docs/smoke/smoke-2.6-guia.md`, against a **real Ollama**, run before the release rather than
deferred — the 0.7.1 defect is the argument. It checks:

- `max_tokens` is accepted and `usage` arrives while streaming;
- `/models` works without a key;
- on loopback, the badge shows and no dialog appears for a section or a chat turn;
- the same Ollama reached through the LAN IP is treated as remote: the dialog names the host and
  shows the no-TLS line;
- switching origin and back does not ask for the key again;
- Disconnect clears everything.

LM Studio is an optional item, if it is installed.

---

## 9. Out of scope

| Item | Why |
| --- | --- |
| DNS resolution to detect loopback | It only errs on the safe side; resolving at send time opens a rebinding race for no real gain |
| Prices for remote compatible endpoints | Each service has its own table; "not known" is honest |
| Several named `compatible` endpoints | Keys per origin already allow going back and forth; profile management is a different feature |
| Custom headers (e.g. OpenRouter's `HTTP-Referer`) | Optional for the known services; nothing asks for them |
| Azure OpenAI | Its own authentication and routing, as recorded in 2.5 |

---

## 10. Release

0.9.0. The CHANGELOG states that MVP criterion 10 is closed, and the local provider entry leaves
`docs/BACKLOG.md`.
