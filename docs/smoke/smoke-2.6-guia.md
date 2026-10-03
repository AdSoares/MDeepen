# Smoke — Slice 2.6: OpenAI-compatible endpoint and local mode

Seventeen checks against a **real Ollama**. Run them before releasing 0.9.0: the 0.7.1 defect broke
the OpenAI provider on every successful request and passed spec, plan, review and CI; it was caught
only by looking at what the SDK actually returned. This slice makes the same kind of bet — that
Ollama accepts `max_tokens` and tolerates `stream_options` — and only a real runtime settles it.

**Document under test:** `docs/smoke/smoke-2.2.md` (read-only).

## Prerequisites

- Ollama running: `ollama serve`, and at least one model pulled, e.g. `ollama pull llama3.2`.
- The `.vsix` built from this branch installed: `npm run build && npm run package`, then
  *Extensions → … → Install from VSIX*.
- For checks 10–12, Ollama must also listen on the LAN: stop it and start it with
  `OLLAMA_HOST=0.0.0.0 ollama serve` (PowerShell: `$env:OLLAMA_HOST='0.0.0.0'; ollama serve`).
  Note the machine's LAN address (`ipconfig`).
- For check 8, a scratch copy of any Markdown file with `sk-abcdef0123456789abcdef` pasted into a
  section.
- Ollama version: `ollama --version` → __________

## Checks

| # | Do | Expect | ✓/✗ |
| --- | --- | --- | --- |
| 1 | Open `smoke-2.2.md` in the reader. AI panel → gear → **OpenAI-compatible endpoint** | Base URL prefilled `http://localhost:11434/v1`; the line under it reads **Stays on this machine**; key labelled **API key (optional)**; Ollama/LM Studio hint shown | |
| 2 | Leave model empty, **Save** | Status: "Choose a model to turn AI on — Refresh models lists them." Panel still reads "AI features are off" | |
| 3 | **Refresh models** (no key) | The pulled models appear in the select | |
| 4 | Choose a model, **Save** | Panel shows `compatible · <model>` and **Local · nothing leaves this machine** | |
| 5 | **Test connection** | "Connected in N ms". *Confirms `max_tokens` on the ping* | |
| 6 | Summarize the current section | **No dialog**; the answer streams; the run ends with no error. *Confirms `max_tokens` on a stream* | |
| 7 | Ask a chat question about the document | No dialog; the answer lists its sources | |
| 8 | In the scratch copy, select the text with the planted key → **Explain** | No dialog, no masking: the answer may quote the key | |
| 9 | Document summary (short) | The dialog **does** appear, titled **Run on the local model?**; cost **local, no cost**; no secret strip | |
| 10 | Card: change the URL to `http://<LAN-IP>:11434/v1` | The line reads **Sends to &lt;LAN-IP&gt;:11434 — no TLS**. Save. The **Local** badge disappears | |
| 11 | Summarize a section | Dialog titled **Send content to &lt;LAN-IP&gt;:11434?**, with the **No TLS** line | |
| 12 | Type any key (e.g. `test-key`), Save. Change the URL back to localhost, Save. Change it to the LAN URL again | The key field reads **Saved for this URL - type to replace**. *Keys per origin, and save-then-key ordering in the real host* | |
| 12b | Type a key in the field without saving, then change the URL to another host | The key field empties: a key typed for one origin is never saved under another. Same when switching provider | |
| 13 | **Disconnect**, then **Confirm disconnect** | Panel reads "AI features are off"; reopening the card shows **Anthropic** selected | |
| 14 | Configure Anthropic or OpenAI with a real key; summarize a section | Unchanged behaviour: the dialog names the provider, cost estimate as before | |
| 14b | Open two documents in the reader, side by side. In one, switch to the localhost endpoint and Save | The other panel's badge also shows **Local** without reopening | |
| 15 | *Optional* — LM Studio's server on, URL `http://localhost:1234/v1`: repeat 3–6 | Same as 3–6 | |

## What Ollama returned

Fill in after checks 5 and 6:

- Did the run in check 6 finish with token usage, or with zero tokens? (Zero is harmless: the cost
  of a local run is zero anyway — but record it.) __________
- Any error text seen: __________
