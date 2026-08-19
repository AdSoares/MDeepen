import type { Page } from '../../shared/types';
import type { HostToWebview, WebviewToHost } from '../../shared/messages';
import { AiConfigStore } from './AiConfigStore';
import type { MementoLike } from './AiConfigStore';
import { createProvider } from './providerRegistry';
import { buildSummarizeRequest } from './prompts';
import { detectSecrets, maskSecrets } from './secretDetection';
import { estimateTokens, estimateCost } from './costEstimate';

const FIRST_SEND_KEY = 'mdeepen.ai.firstSendConfirmed';

export class AiController {
  private abort: AbortController | undefined;
  private pendingRaw = '';
  private pendingRun: ((text: string) => Promise<void>) | undefined;

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
      case 'aiSummarizeSection': await this.startSummarize(msg.id); break;
      case 'aiStop': this.abort?.abort(); break;
      case 'aiConfirmSend': await this.onConfirm(msg.dontAskAgain, msg.masked); break;
      case 'aiCancelSend': this.pendingRun = undefined; this.pendingRaw = ''; break;
    }
  }

  /** Aborts any in-flight request; called on panel dispose so a stream never outlives its reader. */
  dispose(): void {
    this.abort?.abort();
    this.abort = undefined;
  }

  private async startSummarize(id: string): Promise<void> {
    const page = this.getPages().find((p) => p.id === id);
    if (!page) return;
    const cfg = this.store.getConfig();
    const req = buildSummarizeRequest({ title: page.title, content: page.content }, cfg.maxTokens);
    const rawText = req.messages[0].content;

    const run = async (text: string) => {
      const key = await this.store.getKey();
      if (!key) { this.post({ type: 'aiError', kind: 'auth', message: 'No API key set' }); return; }
      // A second request must not interleave its chunks with a running one.
      this.abort?.abort();
      const finalReq = { ...req, messages: [{ role: 'user' as const, content: text }] };
      const abort = new AbortController();
      this.abort = abort;
      const provider = createProvider(cfg, key);
      for await (const chunk of provider.generate(finalReq, abort.signal)) {
        if (chunk.type === 'text') this.post({ type: 'aiChunk', text: chunk.text });
        else if (chunk.type === 'done') this.post({ type: 'aiDone', usage: chunk.usage });
        else this.post({ type: 'aiError', kind: chunk.kind, message: chunk.message });
      }
      if (this.abort === abort) this.abort = undefined;
    };

    if (this.workspaceState.get<boolean>(FIRST_SEND_KEY, false)) {
      await run(rawText);
      return;
    }

    // First remote send in this workspace — gate on the confirmation modal.
    const count = detectSecrets(rawText).length;
    const estTokens = estimateTokens(rawText);
    this.pendingRaw = rawText;
    this.pendingRun = run;
    this.post({
      type: 'aiConfirmNeeded',
      summary: {
        fileName: this.getFileName(),
        sectionTitle: page.title,
        model: cfg.model,
        estTokens,
        estCost: estimateCost(estTokens, cfg.model),
      },
      secrets: { label: count ? `${count} possible secret${count > 1 ? 's' : ''} detected` : '', count },
    });
  }

  private async onConfirm(dontAskAgain: boolean, masked: boolean): Promise<void> {
    if (dontAskAgain) await this.workspaceState.update(FIRST_SEND_KEY, true);
    const run = this.pendingRun;
    const text = masked ? maskSecrets(this.pendingRaw) : this.pendingRaw;
    this.pendingRun = undefined;
    this.pendingRaw = '';
    if (run) await run(text);
  }
}
