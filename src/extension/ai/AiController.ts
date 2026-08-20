import type { Page } from '../../shared/types';
import type { HostToWebview, WebviewToHost } from '../../shared/messages';
import { AiConfigStore } from './AiConfigStore';
import type { MementoLike } from './AiConfigStore';
import { createProvider } from './providerRegistry';
import { buildActionRequest, isActionKind } from './prompts';
import { planDocumentSummary, type DocumentPlan } from './documentPlan';
import { runDocumentSummary } from './documentRun';
import { MAP_STEP_BUDGET_TOKENS, MAX_MAP_STEPS } from './types';
import type { AiActionKind, AiChunk, AiConfig } from './types';
import { detectSecrets, maskSecrets } from './secretDetection';
import { estimateTokens, estimateCost } from './costEstimate';

const FIRST_SEND_KEY = 'mdeepen.ai.firstSendConfirmed';
const MAX_TEXT_CHARS = 200_000;

export class AiController {
  private abort: AbortController | undefined;
  private pendingRun: ((masked: boolean) => Promise<void>) | undefined;
  /** Whether the pending run is one whose confirmation may record workspace consent. A document
   *  run never may, and that is enforced here rather than by the dialog omitting the checkbox. */
  private pendingGrantsConsent = false;

  constructor(
    private readonly store: AiConfigStore,
    private readonly workspaceState: MementoLike,
    private readonly post: (msg: HostToWebview) => void,
    private readonly getPages: () => Page[],
    private readonly getFileName: () => string,
  ) {}

  async postConfigState(): Promise<void> {
    const cfg = this.store.getConfig();
    this.post({ type: 'aiConfigState', configured: await this.store.isConfigured(), provider: cfg.provider, model: cfg.model });
  }

  async handle(msg: WebviewToHost): Promise<void> {
    switch (msg.type) {
      case 'aiConfigRequest': await this.postConfigState(); break;
      case 'aiSaveConfig':
        await this.store.setConfig(msg.config);
        await this.postConfigState();
        break;
      case 'aiClearKey':
        // Disconnecting is a privacy action: drop anything in flight, forget the key, and
        // revoke the first-send consent so a future key has to be confirmed again.
        this.dispose();
        await this.store.clearKey();
        await this.workspaceState.update(FIRST_SEND_KEY, false);
        await this.postConfigState();
        break;
      case 'aiSaveKey':
        // Goes straight to SecretStorage — the key never enters the config object.
        await this.store.setKey(msg.key);
        await this.postConfigState();
        break;
      case 'aiTestConnection': {
        const key = await this.store.getKey();
        if (!key) { this.post({ type: 'aiConnectionResult', ok: false, ms: 0, error: 'No API key set' }); break; }
        const result = await createProvider(this.store.getConfig(), key).testConnection();
        this.post({ type: 'aiConnectionResult', ...result });
        break;
      }
      case 'aiAction': await this.startAction(msg); break;
      case 'aiStop': this.abort?.abort(); break;
      case 'aiConfirmSend': await this.onConfirm(msg.dontAskAgain, msg.masked); break;
      case 'aiCancelSend': this.pendingRun = undefined; this.pendingGrantsConsent = false; break;
    }
  }

  /** Aborts any in-flight request; called on panel dispose so a stream never outlives its reader. */
  dispose(): void {
    this.abort?.abort();
    this.abort = undefined;
  }

  /** One loop for every source. A single request and a twelve-part map-reduce are consumed the
   *  same way, so abort, error mapping and posting exist once. */
  private async pump(source: AsyncIterable<AiChunk>): Promise<void> {
    for await (const chunk of source) {
      if (chunk.type === 'text') this.post({ type: 'aiChunk', text: chunk.text });
      else if (chunk.type === 'progress') this.post({ type: 'aiProgress', done: chunk.done, total: chunk.total });
      else if (chunk.type === 'done') this.post({ type: 'aiDone', usage: chunk.usage });
      else this.post({ type: 'aiError', kind: chunk.kind, message: chunk.message });
    }
  }

  private async startAction(msg: Extract<WebviewToHost, { type: 'aiAction' }>): Promise<void> {
    if (!isActionKind(msg.action)) return;
    if (msg.scope === 'document') return this.startDocumentAction(msg.action);
    if (msg.scope !== 'section' && msg.scope !== 'selection') return;
    if (typeof msg.id !== 'string') return;

    const page = this.getPages().find((p) => p.id === msg.id);
    if (!page) return;

    let content = page.content;
    if (msg.scope === 'selection') {
      const text = typeof msg.text === 'string' ? msg.text : '';
      if (!text.trim() || text.length > MAX_TEXT_CHARS) return;
      content = text;
    }

    const cfg = this.store.getConfig();
    const req = buildActionRequest(msg.action, msg.scope, { title: page.title, content }, cfg.maxTokens);
    const rawText = req.messages[0].content;

    const run = async (masked: boolean) => {
      const key = await this.store.getKey();
      if (!key) { this.post({ type: 'aiError', kind: 'auth', message: 'No API key set' }); return; }
      // A second request must not interleave its chunks with a running one.
      this.abort?.abort();
      const abort = new AbortController();
      this.abort = abort;
      const finalReq = { ...req, messages: [{ role: 'user' as const, content: masked ? maskSecrets(rawText) : rawText }] };
      await this.pump(createProvider(cfg, key).generate(finalReq, abort.signal));
      if (this.abort === abort) this.abort = undefined;
    };

    if (this.workspaceState.get<boolean>(FIRST_SEND_KEY, false)) {
      await run(false);
      return;
    }
    this.pendingRun = run;
    this.pendingGrantsConsent = true;
    this.postConfirm(rawText, cfg, {
      sectionTitle: page.title, scope: msg.scope, sectionCount: 1, truncated: [], estTokens: estimateTokens(rawText),
    });
  }

  /** Document scope always confirms: the consent recorded for one section was given in front of a
   *  different order of magnitude of data and money. */
  private async startDocumentAction(action: AiActionKind): Promise<void> {
    const pages = this.getPages();
    if (pages.length === 0) return;

    const cfg = this.store.getConfig();
    const plan = planDocumentSummary(pages, MAP_STEP_BUDGET_TOKENS);
    if (plan.steps.length > MAX_MAP_STEPS) {
      this.post({
        type: 'aiError', kind: 'unknown',
        message: `This document needs ${plan.steps.length} requests, over the limit of ${MAX_MAP_STEPS}. Summarize a section instead.`,
      });
      return;
    }

    const rawText = plan.steps.map((s) => s.content).join('\n\n');

    this.pendingRun = async (masked: boolean) => {
      const key = await this.store.getKey();
      if (!key) { this.post({ type: 'aiError', kind: 'auth', message: 'No API key set' }); return; }
      this.abort?.abort();
      const abort = new AbortController();
      this.abort = abort;
      const finalPlan: DocumentPlan = masked
        ? { ...plan, steps: plan.steps.map((s) => ({ ...s, content: maskSecrets(s.content) })) }
        : plan;
      await this.pump(runDocumentSummary(finalPlan, action, { fileName: this.getFileName() }, cfg, createProvider(cfg, key), abort.signal));
      if (this.abort === abort) this.abort = undefined;
    };

    this.pendingGrantsConsent = false;
    this.postConfirm(rawText, cfg, {
      sectionTitle: '', scope: 'document', sectionCount: plan.sectionCount,
      truncated: plan.truncated, estTokens: plan.estInputTokens,
    });
  }

  private postConfirm(
    rawText: string,
    cfg: AiConfig,
    facts: { sectionTitle: string; scope: 'section' | 'selection' | 'document'; sectionCount: number; truncated: string[]; estTokens: number },
  ): void {
    const count = detectSecrets(rawText).length;
    this.post({
      type: 'aiConfirmNeeded',
      summary: {
        fileName: this.getFileName(),
        sectionTitle: facts.sectionTitle,
        scope: facts.scope,
        sectionCount: facts.sectionCount,
        truncated: facts.truncated,
        model: cfg.model,
        estTokens: facts.estTokens,
        estCost: estimateCost(facts.estTokens, cfg.model),
      },
      secrets: { label: count ? `${count} possible secret${count > 1 ? 's' : ''} detected` : '', count },
    });
  }

  private async onConfirm(dontAskAgain: boolean, masked: boolean): Promise<void> {
    // A document run never records consent, whatever the message claims: the dialog omits the
    // checkbox, but the guarantee cannot rest on the UI alone.
    if (dontAskAgain && this.pendingGrantsConsent) await this.workspaceState.update(FIRST_SEND_KEY, true);
    const run = this.pendingRun;
    this.pendingRun = undefined;
    this.pendingGrantsConsent = false;
    if (run) await run(masked);
  }
}
