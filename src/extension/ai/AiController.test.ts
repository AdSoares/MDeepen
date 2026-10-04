import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HostToWebview } from '../../shared/messages';
import type { Page } from '../../shared/types';

const rec = vi.hoisted(() => ({
  calls: [] as { key: string; text: string; signal: AbortSignal }[],
  chunks: [] as unknown[],
  hold: { value: false },
  models: [] as string[],
  modelsError: { value: '' },
}));

vi.mock('./providerRegistry', () => ({
  createProvider: (_cfg: unknown, key: string) => ({
    async *generate(req: { messages: { content: string }[] }, signal: AbortSignal) {
      rec.calls.push({ key, text: req.messages[0].content, signal });
      for (const c of rec.chunks) yield c;
      if (rec.hold.value) await new Promise<void>((r) => signal.addEventListener('abort', () => r()));
    },
    async listModels() {
      if (rec.modelsError.value) throw new Error(rec.modelsError.value);
      return rec.models;
    },
    async testConnection() {
      return { ok: true, ms: 1 };
    },
  }),
}));

import { AiController } from './AiController';
import { AiConfigStore } from './AiConfigStore';
import { PROVIDERS } from './types';

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

function makeController(workspaceState = fakeMemento(), pages: Page[] = [PAGE]) {
  const posted: HostToWebview[] = [];
  const store = new AiConfigStore(fakeSecrets('sk-live-key'), fakeMemento());
  const c = new AiController(store, workspaceState, (m) => posted.push(m), () => pages, () => 'doc.md');
  return { c, posted, workspaceState };
}

beforeEach(() => {
  rec.calls.length = 0;
  rec.chunks.length = 0;
  rec.hold.value = false;
  rec.models.length = 0;
  rec.modelsError.value = '';
});

describe('AiController first-send gate', () => {
  it('asks for confirmation instead of sending on the first request in a workspace', async () => {
    const { c, posted } = makeController();
    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });
    expect(rec.calls).toHaveLength(0);
    const confirm = posted.find((m) => m.type === 'aiConfirmNeeded');
    expect(confirm).toBeDefined();
    expect(confirm && confirm.type === 'aiConfirmNeeded' && confirm.secrets.count).toBe(1);
  });

  it('sends redacted text when the user confirms with masking on', async () => {
    const { c } = makeController();
    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });
    await c.handle({ type: 'aiConfirmSend', dontAskAgain: false, masked: true });
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0].text).not.toContain(SECRET);
    expect(rec.calls[0].text).toContain('\u2039redacted\u203a');
  });

  it('sends the raw text when the user confirms with masking off', async () => {
    const { c } = makeController();
    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });
    await c.handle({ type: 'aiConfirmSend', dontAskAgain: false, masked: false });
    expect(rec.calls[0].text).toContain(SECRET);
  });

  it('cancelling drops the pending send', async () => {
    const { c } = makeController();
    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });
    await c.handle({ type: 'aiCancelSend' });
    await c.handle({ type: 'aiConfirmSend', dontAskAgain: false, masked: false });
    expect(rec.calls).toHaveLength(0);
  });

  it('skips the modal on later sends once "do not ask again" is stored', async () => {
    const ws = fakeMemento();
    const first = makeController(ws);
    await first.c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });
    await first.c.handle({ type: 'aiConfirmSend', dontAskAgain: true, masked: false });
    expect(rec.calls).toHaveLength(1);

    const second = makeController(ws);
    await second.c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });
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

describe('AiController disconnect', () => {
  it('clears the stored key and reports not configured', async () => {
    const posted: HostToWebview[] = [];
    const store = new AiConfigStore(fakeSecrets('sk-live-key'), fakeMemento());
    const c = new AiController(store, fakeMemento(), (m) => posted.push(m), () => [PAGE], () => 'doc.md');

    await c.handle({ type: 'aiClearKey' });

    expect(await store.getKey()).toBeUndefined();
    const state = posted.filter((m) => m.type === 'aiConfigState').at(-1);
    expect(state && state.type === 'aiConfigState' && state.configured).toBe(false);
  });

  it('disconnecting revokes the first-send consent, so reconnecting asks again', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', 'anthropic');
    const posted: HostToWebview[] = [];
    const store = new AiConfigStore(fakeSecrets('sk-live-key'), fakeMemento());
    const c = new AiController(store, ws, (m) => posted.push(m), () => [PAGE], () => 'doc.md');

    await c.handle({ type: 'aiClearKey' });
    await store.setKey('sk-new-key');
    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });

    expect(rec.calls).toHaveLength(0);
    expect(posted.some((m) => m.type === 'aiConfirmNeeded')).toBe(true);
  });

  it('aborts an in-flight request when the user disconnects', async () => {
    rec.hold.value = true;
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', 'anthropic');
    const { c } = makeController(ws);
    const running = c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });
    // Wait for the request to actually start, rather than for a fixed number of microtasks.
    await vi.waitFor(() => expect(rec.calls).toHaveLength(1));
    await c.handle({ type: 'aiClearKey' });
    await running;
    expect(rec.calls[0].signal.aborted).toBe(true);
  });
});

describe('AiController streaming', () => {
  it('forwards text chunks and usage to the webview', async () => {
    rec.chunks.push({ type: 'text', text: 'Hel' }, { type: 'text', text: 'lo' }, { type: 'done', usage: { inputTokens: 10, outputTokens: 3 } });
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', 'anthropic');
    const { c, posted } = makeController(ws);
    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });
    expect(posted.filter((m) => m.type === 'aiChunk').map((m) => (m as { text: string }).text)).toEqual(['Hel', 'lo']);
    expect(posted.some((m) => m.type === 'aiDone')).toBe(true);
  });

  it('aborts the in-flight request on stop', async () => {
    rec.hold.value = true;
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', 'anthropic');
    const { c } = makeController(ws);
    const running = c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });
    // Wait for the request to actually start, rather than for a fixed number of microtasks.
    await vi.waitFor(() => expect(rec.calls).toHaveLength(1));
    await c.handle({ type: 'aiStop' });
    await running;
    expect(rec.calls[0].signal.aborted).toBe(true);
  });
});

describe('AiController action payloads', () => {
  it('sends the selection, not the section, when the scope is a selection', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', 'anthropic');
    const { c } = makeController(ws);
    await c.handle({ type: 'aiAction', action: 'explain', scope: 'selection', id: 'p1', text: 'just this line' });
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0].text).toContain('just this line');
    expect(rec.calls[0].text).not.toContain('## Retries');
  });

  it('scans the selection for secrets, not the surrounding section', async () => {
    const { c, posted } = makeController();
    await c.handle({ type: 'aiAction', action: 'explain', scope: 'selection', id: 'p1', text: 'a clean sentence' });
    const confirm = posted.find((m) => m.type === 'aiConfirmNeeded');
    expect(confirm && confirm.type === 'aiConfirmNeeded' && confirm.secrets.count).toBe(0);
  });

  it('ignores an unknown action', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', 'anthropic');
    const { c } = makeController(ws);
    await c.handle({ type: 'aiAction', action: 'translate', scope: 'section', id: 'p1' } as never);
    expect(rec.calls).toHaveLength(0);
  });

  it('ignores an unknown scope', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', 'anthropic');
    const { c } = makeController(ws);
    await c.handle({ type: 'aiAction', action: 'explain', scope: 'document', id: 'p1' } as never);
    expect(rec.calls).toHaveLength(0);
  });

  it('ignores a selection action with blank or missing text', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', 'anthropic');
    const { c } = makeController(ws);
    await c.handle({ type: 'aiAction', action: 'explain', scope: 'selection', id: 'p1', text: '   ' });
    await c.handle({ type: 'aiAction', action: 'explain', scope: 'selection', id: 'p1' });
    expect(rec.calls).toHaveLength(0);
  });

  it('ignores an aiAction naming a page id that matches no page', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', 'anthropic');
    const { c, posted } = makeController(ws);
    await c.handle({ type: 'aiAction', action: 'explain', scope: 'section', id: 'no-such-page' });
    expect(rec.calls).toHaveLength(0);
    expect(posted).toHaveLength(0);
  });

  it('ignores a selection larger than the payload cap', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', 'anthropic');
    const { c } = makeController(ws);
    await c.handle({ type: 'aiAction', action: 'explain', scope: 'selection', id: 'p1', text: 'x'.repeat(200_001) });
    expect(rec.calls).toHaveLength(0);
  });
});

describe('document scope', () => {
  const bigPage = (id: string): Page => ({
    id, title: id, level: 2, startLine: 0, endLine: 1,
    content: 'y'.repeat(16_004), wordCount: 1,
  });

  it('always confirms, even when the workspace already consented', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', 'anthropic');
    const { c, posted } = makeController(ws);
    rec.chunks.push({ type: 'text', text: 'x' }, { type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({ type: 'aiAction', action: 'summarizeShort', scope: 'document' });

    const confirm = posted.find((m) => m.type === 'aiConfirmNeeded');
    expect(confirm).toBeDefined();
    expect(rec.calls).toHaveLength(0);
  });

  it('describes the whole document in the confirmation', async () => {
    const { c, posted } = makeController(fakeMemento(), [PAGE, { ...PAGE, id: 'p2', title: 'Backoff' }]);
    await c.handle({ type: 'aiAction', action: 'summarizeShort', scope: 'document' });

    const confirm = posted.find((m) => m.type === 'aiConfirmNeeded') as Extract<HostToWebview, { type: 'aiConfirmNeeded' }>;
    expect(confirm.summary.scope).toBe('document');
    expect(confirm.summary.sectionCount).toBe(2);
    expect(confirm.summary.truncated).toEqual([]);
  });

  it('confirming a document does not grant section-scope consent', async () => {
    const ws = fakeMemento();
    const { c } = makeController(ws);
    rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({ type: 'aiAction', action: 'summarizeShort', scope: 'document' });
    await c.handle({ type: 'aiConfirmSend', dontAskAgain: true, masked: false });

    expect(ws.get('mdeepen.ai.firstSendConfirmed', false)).toBe(false);
  });

  it('masks secrets in every part that is sent', async () => {
    const { c } = makeController(fakeMemento(), [PAGE, { ...PAGE, id: 'p2', title: 'More' }]);
    rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({ type: 'aiAction', action: 'summarizeShort', scope: 'document' });
    await c.handle({ type: 'aiConfirmSend', dontAskAgain: false, masked: true });

    const mapCalls = rec.calls.slice(0, -1);
    expect(mapCalls.length).toBeGreaterThan(0);
    for (const call of mapCalls) expect(call.text).not.toContain(SECRET);
  });

  it('refuses a document over the step cap before any network call', async () => {
    const pages = Array.from({ length: 41 }, (_, i) => bigPage(`p${i}`));
    const { c, posted } = makeController(fakeMemento(), pages);

    await c.handle({ type: 'aiAction', action: 'summarizeShort', scope: 'document' });

    expect(rec.calls).toHaveLength(0);
    expect(posted.some((m) => m.type === 'aiConfirmNeeded')).toBe(false);
    expect(posted.find((m) => m.type === 'aiError')).toBeDefined();
  });

  it('ignores a section action with no id', async () => {
    const { c, posted } = makeController();
    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section' });
    expect(rec.calls).toHaveLength(0);
    expect(posted.some((m) => m.type === 'aiConfirmNeeded')).toBe(false);
  });
});

describe('chat', () => {
  const BACKOFF: Page = { id: 'p2', title: 'Backoff', level: 2, startLine: 3, endLine: 5, content: '## Backoff\n\ncapped at eight seconds', wordCount: 4 };
  const CLEAN: Page = { id: 'p0', title: 'Overview', level: 2, startLine: 0, endLine: 2, content: '## Overview\n\npayments end to end', wordCount: 4 };

  // PAGES carries no secret: the gate tests must not trip the secret interrupt, which is
  // exercised separately below with PAGE.
  const PAGES: Page[] = [CLEAN, BACKOFF];

  it('confirms the first question, then never again', async () => {
    const ws = fakeMemento();
    const { c, posted } = makeController(ws, PAGES);
    rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({ type: 'aiChat', question: 'how long is the backoff?', history: [] });
    expect(posted.filter((m) => m.type === 'aiConfirmNeeded')).toHaveLength(1);
    expect(rec.calls).toHaveLength(0);

    await c.handle({ type: 'aiConfirmSend', dontAskAgain: false, masked: false });
    expect(rec.calls).toHaveLength(1);

    posted.length = 0;
    await c.handle({ type: 'aiChat', question: 'and the cap?', history: [] });
    expect(posted.some((m) => m.type === 'aiConfirmNeeded')).toBe(false);
    expect(rec.calls).toHaveLength(2);
  });

  it('does not accept the section consent as chat consent', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', 'anthropic');
    const { c, posted } = makeController(ws, PAGES);
    rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({ type: 'aiChat', question: 'how long?', history: [] });

    expect(posted.some((m) => m.type === 'aiConfirmNeeded')).toBe(true);
    expect(rec.calls).toHaveLength(0);
  });

  it('does not let chat consent silence a section action', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.chatConfirmed', 'anthropic');
    const { c, posted } = makeController(ws, PAGES);
    rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p2' });

    expect(posted.some((m) => m.type === 'aiConfirmNeeded')).toBe(true);
    expect(rec.calls).toHaveLength(0);
  });

  it('posts the sections it used before the first chunk', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.chatConfirmed', 'anthropic');
    const { c, posted } = makeController(ws, PAGES);
    rec.chunks.push({ type: 'text', text: 'eight seconds' }, { type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({ type: 'aiChat', question: 'backoff cap?', history: [] });

    const sourcesAt = posted.findIndex((m) => m.type === 'aiSources');
    const chunkAt = posted.findIndex((m) => m.type === 'aiChunk');
    expect(sourcesAt).toBeGreaterThanOrEqual(0);
    expect(sourcesAt).toBeLessThan(chunkAt);
  });

  it('interrupts with the dialog when a turn carries a secret, even after the gate', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.chatConfirmed', 'anthropic');
    // PAGE is the active section here and contains SECRET, so it is pinned into the payload.
    const { c, posted } = makeController(ws, [PAGE, BACKOFF]);
    rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({ type: 'aiChat', question: 'what is configured?', history: [] });

    const confirm = posted.find((m) => m.type === 'aiConfirmNeeded') as Extract<HostToWebview, { type: 'aiConfirmNeeded' }>;
    expect(confirm).toBeDefined();
    expect(confirm.summary.scope).toBe('chat');
    expect(confirm.secrets.count).toBeGreaterThan(0);
    expect(rec.calls).toHaveLength(0);
  });

  it('scans history for secrets too', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.chatConfirmed', 'anthropic');
    const { c, posted } = makeController(ws, [BACKOFF]);
    rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({
      type: 'aiChat', question: 'is that safe?',
      history: [{ role: 'assistant', text: `earlier I said the key is ${SECRET}` }],
    });

    expect(posted.some((m) => m.type === 'aiConfirmNeeded')).toBe(true);
    expect(rec.calls).toHaveLength(0);
  });

  it('ignores an empty question and an oversized one', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.chatConfirmed', 'anthropic');
    const { c, posted } = makeController(ws, PAGES);

    await c.handle({ type: 'aiChat', question: '   ', history: [] });
    await c.handle({ type: 'aiChat', question: 'x'.repeat(4001), history: [] });

    expect(rec.calls).toHaveLength(0);
    expect(posted.some((m) => m.type === 'aiConfirmNeeded')).toBe(false);
  });

  it('ignores a history that is too long', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.chatConfirmed', 'anthropic');
    const { c } = makeController(ws, PAGES);
    const history = Array.from({ length: 41 }, () => ({ role: 'user' as const, text: 'hi' }));

    await c.handle({ type: 'aiChat', question: 'why?', history });

    expect(rec.calls).toHaveLength(0);
  });


  it('revokes the chat consent on disconnect, so a new key cannot inherit it', async () => {

    const ws = fakeMemento();

    await ws.update('mdeepen.ai.chatConfirmed', 'anthropic');

    await ws.update('mdeepen.ai.firstSendConfirmed', 'anthropic');

    const { c, posted } = makeController(ws, PAGES);



    await c.handle({ type: 'aiClearKey' });



    expect(ws.get('mdeepen.ai.chatConfirmed', false)).toBe(false);

    expect(ws.get('mdeepen.ai.firstSendConfirmed', false)).toBe(false);



    // And a question now asks again rather than sending.

    await c.handle({ type: 'aiChat', question: 'why?', history: [] });

    expect(posted.some((m) => m.type === 'aiConfirmNeeded')).toBe(true);

    expect(rec.calls).toHaveLength(0);

  });

});

describe('providers', () => {
  it('revokes both consents when the provider changes', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', 'anthropic');
    await ws.update('mdeepen.ai.chatConfirmed', 'anthropic');
    const { c } = makeController(ws);

    await c.handle({ type: 'aiSaveConfig', config: { provider: 'openai', model: PROVIDERS.openai.defaultModel, maxTokens: 4096 } });

    expect(ws.get('mdeepen.ai.firstSendConfirmed', false)).toBe(false);
    expect(ws.get('mdeepen.ai.chatConfirmed', false)).toBe(false);
  });

  it('keeps consent when only the model or the token cap changes', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', 'anthropic');
    const { c } = makeController(ws);

    await c.handle({ type: 'aiSaveConfig', config: { provider: 'anthropic', model: PROVIDERS.anthropic.defaultModel, maxTokens: 8192 } });

    expect(ws.get('mdeepen.ai.firstSendConfirmed', false)).toBe('anthropic');
  });

  it('reports which providers hold a key', async () => {
    const { c, posted } = makeController();
    await c.handle({ type: 'aiConfigRequest' });

    const state = posted.find((m) => m.type === 'aiConfigState') as Extract<HostToWebview, { type: 'aiConfigState' }>;
    expect(state.configuredProviders).toContain('anthropic');
  });

  it('names the destination provider in the confirmation', async () => {
    const { c, posted } = makeController();
    rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });

    const confirm = posted.find((m) => m.type === 'aiConfirmNeeded') as Extract<HostToWebview, { type: 'aiConfirmNeeded' }>;
    expect(confirm.summary.provider).toBe('Anthropic');
    expect(confirm.summary.pricedModel).toBe(true);
    expect(typeof confirm.summary.estCost).toBe('number');
  });

  it('omits the cost when the model has no price, rather than inventing one', async () => {
    const ws = fakeMemento();
    const { c, posted } = makeController(ws);
    // OpenAI ships with no prices looked up, so its models are the unpriced case.
    await c.handle({ type: 'aiSaveConfig', config: { provider: 'openai', model: PROVIDERS.openai.defaultModel, maxTokens: 4096 } });
    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });

    const confirm = posted.find((m) => m.type === 'aiConfirmNeeded') as Extract<HostToWebview, { type: 'aiConfirmNeeded' }>;
    expect(confirm.summary.provider).toBe('OpenAI');
    expect(confirm.summary.pricedModel).toBe(false);
    expect(confirm.summary.estCost).toBeUndefined();
  });
});

describe('listing models', () => {
  it('returns what the provider offers', async () => {
    rec.models.push('model-a', 'model-b');
    const { c, posted } = makeController();

    await c.handle({ type: 'aiListModels' });

    const list = posted.find((m) => m.type === 'aiModelList') as Extract<HostToWebview, { type: 'aiModelList' }>;
    expect(list.models).toEqual(['model-a', 'model-b']);
    expect(list.error).toBeUndefined();
  });

  it('reports a failure instead of an empty list, so the card can tell them apart', async () => {
    rec.modelsError.value = 'nope';
    const { c, posted } = makeController();

    await c.handle({ type: 'aiListModels' });

    const list = posted.find((m) => m.type === 'aiModelList') as Extract<HostToWebview, { type: 'aiModelList' }>;
    expect(list.error).toBe('nope');
  });

  it('refuses without a key rather than calling the provider', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    const posted: HostToWebview[] = [];
    const c = new AiController(store, fakeMemento(), (m) => posted.push(m), () => [PAGE], () => 'doc.md');

    await c.handle({ type: 'aiListModels' });

    const list = posted.find((m) => m.type === 'aiModelList') as Extract<HostToWebview, { type: 'aiModelList' }>;
    expect(list.error).toBeTruthy();
    expect(list.models).toEqual([]);
    expect(rec.calls).toHaveLength(0);
  });
});

describe('asking about a selection', () => {
  const BACKOFF = { id: 'p2', title: 'Backoff', level: 2, startLine: 3, endLine: 5, content: '## Backoff', wordCount: 2 };

  it('sends the selected excerpt alongside the question', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.chatConfirmed', 'anthropic');
    const { c } = makeController(ws, [BACKOFF]);
    rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({ type: 'aiChat', question: 'why?', history: [], selection: 'capped at eight seconds' });

    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0].text).toContain('capped at eight seconds');
    expect(rec.calls[0].text).toContain('Selected excerpt');
  });

  it('behaves exactly as before when no excerpt is sent', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.chatConfirmed', 'anthropic');
    const { c } = makeController(ws, [BACKOFF]);
    rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({ type: 'aiChat', question: 'why?', history: [] });

    expect(rec.calls[0].text).not.toContain('Selected excerpt');
  });

  it('ignores an excerpt above the payload cap', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.chatConfirmed', 'anthropic');
    const { c } = makeController(ws, [BACKOFF]);

    await c.handle({ type: 'aiChat', question: 'why?', history: [], selection: 'x'.repeat(200_001) });

    expect(rec.calls).toHaveLength(0);
  });
});

describe('a compatible endpoint', () => {
  const LOCAL = 'http://localhost:11434/v1';
  const LAN = 'http://192.168.0.50:11434/v1';
  const compatible = (baseUrl: string, model = 'llama3') =>
    ({ provider: 'compatible' as const, model, maxTokens: 1024, baseUrl });

  async function makeCompatible(baseUrl: string, ws = fakeMemento()) {
    const posted: HostToWebview[] = [];
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig(compatible(baseUrl));
    const c = new AiController(store, ws, (m) => posted.push(m), () => [PAGE], () => 'doc.md');
    return { c, posted, ws, store };
  }
  const lastState = (posted: HostToWebview[]) =>
    posted.filter((m) => m.type === 'aiConfigState').at(-1) as Extract<HostToWebview, { type: 'aiConfigState' }>;

  it('revokes both consents when the origin changes', async () => {
    const ws = fakeMemento();
    const { c } = await makeCompatible('https://openrouter.ai/api/v1', ws);
    await ws.update('mdeepen.ai.firstSendConfirmed', 'anthropic');
    await ws.update('mdeepen.ai.chatConfirmed', 'anthropic');

    await c.handle({ type: 'aiSaveConfig', config: compatible(LAN) });

    expect(ws.get('mdeepen.ai.firstSendConfirmed', false)).toBe(false);
    expect(ws.get('mdeepen.ai.chatConfirmed', false)).toBe(false);
  });

  it('keeps consent when only the model changes on the same endpoint', async () => {
    const ws = fakeMemento();
    const { c } = await makeCompatible(LAN, ws);
    await ws.update('mdeepen.ai.firstSendConfirmed', 'compatible:http://192.168.0.50:11434');

    await c.handle({ type: 'aiSaveConfig', config: compatible(LAN, 'qwen3') });

    expect(ws.get('mdeepen.ai.firstSendConfirmed', false)).toBe('compatible:http://192.168.0.50:11434');
  });

  it('refuses to save an endpoint it cannot classify', async () => {
    const { c, store } = await makeCompatible(LOCAL);

    await c.handle({ type: 'aiSaveConfig', config: compatible('ftp://somewhere') });

    expect(store.getConfig().baseUrl).toBe(LOCAL);
  });

  it('reports local, the base URL and the keyed origins in the config state', async () => {
    const { c, posted } = await makeCompatible(LOCAL);
    await c.handle({ type: 'aiConfigRequest' });

    const state = lastState(posted);
    expect(state.local).toBe(true);
    expect(state.baseUrl).toBe(LOCAL);
    expect(state.keyedOrigins).toEqual([]);
    expect(state.configured).toBe(true);
  });

  it('reports a fixed provider as not local', async () => {
    const { c, posted } = makeController();
    await c.handle({ type: 'aiConfigRequest' });
    expect(lastState(posted).local).toBe(false);
  });

  it('lists models without a key', async () => {
    rec.models.push('llama3', 'qwen3');
    const { c, posted } = await makeCompatible(LOCAL);

    await c.handle({ type: 'aiListModels' });

    const list = posted.find((m) => m.type === 'aiModelList') as Extract<HostToWebview, { type: 'aiModelList' }>;
    expect(list.models).toEqual(['llama3', 'qwen3']);
    expect(list.error).toBeUndefined();
  });

  it('sends without a key, never stopping at "No API key set"', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', 'compatible:http://192.168.0.50:11434');
    const { c, posted } = await makeCompatible(LAN, ws);
    rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });

    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0].key).toBe('');
    expect(posted.some((m) => m.type === 'aiError')).toBe(false);
  });

  it('stores a key under the new origin even when the save and the key race', async () => {
    // The webview posts both, and the host does not await one before the other.
    const { c, store } = await makeCompatible(LOCAL);

    await Promise.all([
      c.handle({ type: 'aiSaveConfig', config: compatible('https://openrouter.ai/api/v1') }),
      c.handle({ type: 'aiSaveKey', key: 'sk-or-1' }),
    ]);

    expect(store.keyedOrigins()).toEqual(['https://openrouter.ai']);
    expect(await store.getKey()).toBe('sk-or-1');
  });

  it('disconnecting from a keyless endpoint turns AI off', async () => {
    const { c, posted, store } = await makeCompatible(LOCAL);

    await c.handle({ type: 'aiClearKey' });

    expect(lastState(posted).configured).toBe(false);
    expect(store.getConfig().provider).toBe('anthropic');
  });
});

describe('loopback', () => {
  const at = (baseUrl: string) => ({ provider: 'compatible' as const, model: 'llama3', maxTokens: 1024, baseUrl });

  async function controllerAt(baseUrl: string, pages: Page[] = [PAGE]) {
    const posted: HostToWebview[] = [];
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig(at(baseUrl));
    const c = new AiController(store, fakeMemento(), (m) => posted.push(m), () => pages, () => 'doc.md');
    rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });
    return { c, posted };
  }
  const confirmOf = (posted: HostToWebview[]) =>
    posted.find((m) => m.type === 'aiConfirmNeeded') as Extract<HostToWebview, { type: 'aiConfirmNeeded' }> | undefined;

  it('sends a section with no dialog, and unmasked, even when it holds a secret', async () => {
    const { c, posted } = await controllerAt('http://localhost:11434/v1');

    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });

    expect(confirmOf(posted)).toBeUndefined();
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0].text).toContain(SECRET);
  });

  it('answers a chat turn with no dialog', async () => {
    const { c, posted } = await controllerAt('http://127.0.0.1:1234/v1');

    await c.handle({ type: 'aiChat', question: 'what is the key?', history: [] });

    expect(confirmOf(posted)).toBeUndefined();
    expect(rec.calls).toHaveLength(1);
  });

  it('still confirms a whole document, saying it stays here and costs nothing', async () => {
    const { c, posted } = await controllerAt('http://localhost:11434/v1');

    await c.handle({ type: 'aiAction', action: 'summarizeShort', scope: 'document' });

    const confirm = confirmOf(posted)!;
    expect(confirm).toBeDefined();
    expect(rec.calls).toHaveLength(0);
    expect(confirm.summary.local).toBe(true);
    expect(confirm.summary.estCost).toBe(0);
    expect(confirm.summary.pricedModel).toBe(true);
    expect(confirm.secrets.count).toBe(0);
  });

  it('names the host of a remote endpoint and flags plain http', async () => {
    const { c, posted } = await controllerAt('http://192.168.0.50:11434/v1');

    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });

    const confirm = confirmOf(posted)!;
    expect(confirm.summary.provider).toBe('192.168.0.50:11434');
    expect(confirm.summary.local).toBe(false);
    expect(confirm.summary.plainHttp).toBe(true);
    expect(confirm.summary.estCost).toBeUndefined();
    expect(confirm.secrets.count).toBe(1);
  });

  it('does not flag a remote https endpoint', async () => {
    const { c, posted } = await controllerAt('https://openrouter.ai/api/v1');
    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });
    expect(confirmOf(posted)!.summary.plainHttp).toBe(false);
    expect(confirmOf(posted)!.summary.provider).toBe('openrouter.ai');
  });

  it('leaves the fixed providers as they were', async () => {
    const { c, posted } = makeController();
    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });
    const confirm = confirmOf(posted)!;
    expect(confirm.summary.provider).toBe('Anthropic');
    expect(confirm.summary.local).toBe(false);
    expect(confirm.summary.plainHttp).toBe(false);
  });
});

describe('shared state across panels and windows', () => {
  const LAN = { provider: 'compatible' as const, model: 'llama3', maxTokens: 1024, baseUrl: 'http://192.168.0.50:11434/v1' };
  const done = () => rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

  function controllerOn(store: AiConfigStore, ws = fakeMemento(), onConfigChanged?: () => void, pages: Page[] = [PAGE]) {
    const posted: HostToWebview[] = [];
    const c = new AiController(store, ws, (m) => posted.push(m), () => pages, () => 'doc.md', () => 0, onConfigChanged);
    return { c, posted, ws };
  }

  it('a dialog built for one endpoint never sends a key saved later for another provider', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig(LAN);
    const { c } = controllerOn(store);
    done();
    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });

    // Meanwhile another panel switches to OpenAI and saves its key in the shared store.
    await store.setConfig({ provider: 'openai', model: PROVIDERS.openai.defaultModel, maxTokens: 4096 });
    await store.setKey('sk-openai-real');
    await c.handle({ type: 'aiConfirmSend', dontAskAgain: false, masked: false });

    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0].key).toBe('');
  });

  it('section consent given to Anthropic does not cover an endpoint chosen in another window', async () => {
    const store = new AiConfigStore(fakeSecrets('sk-ant'), fakeMemento());
    const { c, posted } = controllerOn(store);
    done();
    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });
    await c.handle({ type: 'aiConfirmSend', dontAskAgain: true, masked: false });
    expect(rec.calls).toHaveLength(1);

    // Another window points the shared config at a LAN host; this controller never sees the save.
    await store.setConfig(LAN);
    posted.length = 0;
    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });

    expect(posted.some((m) => m.type === 'aiConfirmNeeded')).toBe(true);
    expect(rec.calls).toHaveLength(1);
  });

  it('chat consent given to Anthropic does not cover an endpoint chosen in another window', async () => {
    const store = new AiConfigStore(fakeSecrets('sk-ant'), fakeMemento());
    // No secret on this page, so only the consent gate can bring the dialog back.
    const clean: Page = { ...PAGE, content: '## Retries\n\nback off and retry' };
    const { c, posted } = controllerOn(store, fakeMemento(), undefined, [clean]);
    done();
    await c.handle({ type: 'aiChat', question: 'why?', history: [] });
    await c.handle({ type: 'aiConfirmSend', dontAskAgain: false, masked: false });
    expect(rec.calls).toHaveLength(1);

    await store.setConfig(LAN);
    posted.length = 0;
    await c.handle({ type: 'aiChat', question: 'and then?', history: [] });

    expect(posted.some((m) => m.type === 'aiConfirmNeeded')).toBe(true);
    expect(rec.calls).toHaveLength(1);
  });

  it('a stale dialog records consent for the destination it showed, not the current one', async () => {
    const store = new AiConfigStore(fakeSecrets('sk-ant'), fakeMemento());
    const { c, posted } = controllerOn(store);
    done();
    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });
    await store.setConfig(LAN);
    await c.handle({ type: 'aiConfirmSend', dontAskAgain: true, masked: false });

    posted.length = 0;
    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });
    expect(posted.some((m) => m.type === 'aiConfirmNeeded')).toBe(true);
  });

  it('tells the other panels when the config or the keys change', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    const onConfigChanged = vi.fn();
    const { c } = controllerOn(store, fakeMemento(), onConfigChanged);

    await c.handle({ type: 'aiSaveConfig', config: LAN });
    await c.handle({ type: 'aiSaveKey', key: 'k' });
    await c.handle({ type: 'aiClearKey' });

    expect(onConfigChanged).toHaveBeenCalledTimes(3);
  });
});

describe('the host checks the endpoint is usable', () => {
  const NO_MODEL = { provider: 'compatible' as const, model: '', maxTokens: 1024, baseUrl: 'http://192.168.0.50:11434/v1' };

  async function controllerWithoutModel() {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', 'compatible:http://192.168.0.50:11434');
    await ws.update('mdeepen.ai.chatConfirmed', 'compatible:http://192.168.0.50:11434');
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig(NO_MODEL);
    const posted: HostToWebview[] = [];
    const clean: Page = { ...PAGE, content: '## Retries\n\nback off and retry' };
    const c = new AiController(store, ws, (m) => posted.push(m), () => [clean], () => 'doc.md');
    return { c, posted };
  }

  it('refuses a section send to an endpoint with no model, instead of calling it', async () => {
    const { c, posted } = await controllerWithoutModel();

    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });

    expect(rec.calls).toHaveLength(0);
    expect(posted.some((m) => m.type === 'aiError')).toBe(true);
  });

  it('refuses a chat turn to an endpoint with no model', async () => {
    const { c, posted } = await controllerWithoutModel();

    await c.handle({ type: 'aiChat', question: 'why?', history: [] });

    expect(rec.calls).toHaveLength(0);
    expect(posted.some((m) => m.type === 'aiError')).toBe(true);
  });
});
