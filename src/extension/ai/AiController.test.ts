import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HostToWebview } from '../../shared/messages';
import type { Page } from '../../shared/types';

const rec = vi.hoisted(() => ({
  calls: [] as { key: string; text: string; signal: AbortSignal }[],
  chunks: [] as unknown[],
  hold: { value: false },
}));

vi.mock('./providerRegistry', () => ({
  createProvider: (_cfg: unknown, key: string) => ({
    async *generate(req: { messages: { content: string }[] }, signal: AbortSignal) {
      rec.calls.push({ key, text: req.messages[0].content, signal });
      for (const c of rec.chunks) yield c;
      if (rec.hold.value) await new Promise<void>((r) => signal.addEventListener('abort', () => r()));
    },
    async testConnection() {
      return { ok: true, ms: 1 };
    },
  }),
}));

import { AiController } from './AiController';
import { AiConfigStore } from './AiConfigStore';

const SECRET = 'sk-abcdef0123456789abcdef';
const PAGE: Page = {
  id: 'p1', title: 'Retries', level: 2, startLine: 0, endLine: 2,
  content: `## Retries\n\nthe key is ${SECRET}`, wordCount: 5,
};

function fakeSecrets(key?: string) {
  const s: Record<string, string> = key ? { 'mdeepen.anthropic.apiKey': key } : {};
  return {
    get: (k: string) => Promise.resolve(s[k]),
    store: (k: string, v: string) => { s[k] = v; return Promise.resolve(); },
    delete: (k: string) => { delete s[k]; return Promise.resolve(); },
  };
}
function fakeMemento() {
  const s: Record<string, unknown> = {};
  return {
    get: <T>(k: string, d?: T) => (k in s ? (s[k] as T) : (d as T)),
    update: (k: string, v: unknown) => { s[k] = v; return Promise.resolve(); },
  };
}

function makeController(workspaceState = fakeMemento()) {
  const posted: HostToWebview[] = [];
  const store = new AiConfigStore(fakeSecrets('sk-live-key'), fakeMemento());
  const c = new AiController(store, workspaceState, (m) => posted.push(m), () => [PAGE], () => 'doc.md');
  return { c, posted, workspaceState };
}

beforeEach(() => {
  rec.calls.length = 0;
  rec.chunks.length = 0;
  rec.hold.value = false;
});

describe('AiController first-send gate', () => {
  it('asks for confirmation instead of sending on the first request in a workspace', async () => {
    const { c, posted } = makeController();
    await c.handle({ type: 'aiSummarizeSection', id: 'p1' });
    expect(rec.calls).toHaveLength(0);
    const confirm = posted.find((m) => m.type === 'aiConfirmNeeded');
    expect(confirm).toBeDefined();
    expect(confirm && confirm.type === 'aiConfirmNeeded' && confirm.secrets.count).toBe(1);
  });

  it('sends redacted text when the user confirms with masking on', async () => {
    const { c } = makeController();
    await c.handle({ type: 'aiSummarizeSection', id: 'p1' });
    await c.handle({ type: 'aiConfirmSend', dontAskAgain: false, masked: true });
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0].text).not.toContain(SECRET);
    expect(rec.calls[0].text).toContain('\u2039redacted\u203a');
  });

  it('sends the raw text when the user confirms with masking off', async () => {
    const { c } = makeController();
    await c.handle({ type: 'aiSummarizeSection', id: 'p1' });
    await c.handle({ type: 'aiConfirmSend', dontAskAgain: false, masked: false });
    expect(rec.calls[0].text).toContain(SECRET);
  });

  it('cancelling drops the pending send', async () => {
    const { c } = makeController();
    await c.handle({ type: 'aiSummarizeSection', id: 'p1' });
    await c.handle({ type: 'aiCancelSend' });
    await c.handle({ type: 'aiConfirmSend', dontAskAgain: false, masked: false });
    expect(rec.calls).toHaveLength(0);
  });

  it('skips the modal on later sends once "do not ask again" is stored', async () => {
    const ws = fakeMemento();
    const first = makeController(ws);
    await first.c.handle({ type: 'aiSummarizeSection', id: 'p1' });
    await first.c.handle({ type: 'aiConfirmSend', dontAskAgain: true, masked: false });
    expect(rec.calls).toHaveLength(1);

    const second = makeController(ws);
    await second.c.handle({ type: 'aiSummarizeSection', id: 'p1' });
    expect(rec.calls).toHaveLength(2);
    expect(second.posted.some((m) => m.type === 'aiConfirmNeeded')).toBe(false);
  });
});

describe('AiController key handling', () => {
  it('stores the key in SecretStorage and reports configured, without touching the config', async () => {
    const posted: HostToWebview[] = [];
    const secrets = fakeSecrets();
    const configMemento = fakeMemento();
    const store = new AiConfigStore(secrets, configMemento);
    const c = new AiController(store, fakeMemento(), (m) => posted.push(m), () => [PAGE], () => 'doc.md');

    await c.handle({ type: 'aiSaveKey', key: 'sk-secret' });

    expect(await store.getKey()).toBe('sk-secret');
    expect(JSON.stringify(configMemento.get('mdeepen.aiConfig', {}))).not.toContain('sk-secret');
    const state = posted.find((m) => m.type === 'aiConfigState');
    expect(state && state.type === 'aiConfigState' && state.configured).toBe(true);
  });
});

describe('AiController streaming', () => {
  it('forwards text chunks and usage to the webview', async () => {
    rec.chunks.push({ type: 'text', text: 'Hel' }, { type: 'text', text: 'lo' }, { type: 'done', usage: { inputTokens: 10, outputTokens: 3 } });
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', true);
    const { c, posted } = makeController(ws);
    await c.handle({ type: 'aiSummarizeSection', id: 'p1' });
    expect(posted.filter((m) => m.type === 'aiChunk').map((m) => (m as { text: string }).text)).toEqual(['Hel', 'lo']);
    expect(posted.some((m) => m.type === 'aiDone')).toBe(true);
  });

  it('aborts the in-flight request on stop', async () => {
    rec.hold.value = true;
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', true);
    const { c } = makeController(ws);
    const running = c.handle({ type: 'aiSummarizeSection', id: 'p1' });
    await Promise.resolve();
    await c.handle({ type: 'aiStop' });
    await running;
    expect(rec.calls[0].signal.aborted).toBe(true);
  });
});
