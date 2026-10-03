import type { Page } from '../../shared/types';
import type { HostToWebview, WebviewToHost } from '../../shared/messages';
import { AiConfigStore } from './AiConfigStore';
import type { MementoLike } from './AiConfigStore';
import { createProvider } from './providerRegistry';
import { buildActionRequest, isActionKind, CHAT_SYSTEM } from './prompts';
import { planChatTurn, type ChatTurn } from './chatContext';
import { planDocumentSummary, type DocumentPlan } from './documentPlan';
import { runDocumentSummary } from './documentRun';
import { CHAT_HISTORY_BUDGET_TOKENS, CHAT_SECTION_BUDGET_TOKENS, DEFAULT_AI_CONFIG, MAP_STEP_BUDGET_TOKENS, MAX_MAP_STEPS, PROVIDERS } from './types';
import type { AiActionKind, AiChunk, AiConfig } from './types';
import { detectSecrets, maskSecrets } from './secretDetection';
import { estimateTokens, estimateCost, isPricedModel } from './costEstimate';
import { describeDestination, destinationKey, isLocalConfig } from '../../shared/destination';

const FIRST_SEND_KEY = 'mdeepen.ai.firstSendConfirmed';
const CHAT_KEY = 'mdeepen.ai.chatConfirmed';
const MAX_TEXT_CHARS = 200_000;
const MAX_QUESTION_CHARS = 4_000;
const MAX_HISTORY_TURNS = 40;
const MAX_HISTORY_TURN_CHARS = 20_000;

export class AiController {
  private abort: AbortController | undefined;
  private pendingRun: ((masked: boolean) => Promise<void>) | undefined;
  /** Which consent a pending confirmation may record, if any. `auto` means pressing Send grants
   *  it — the chat dialog is itself the consent, so it offers no checkbox. A document run carries
   *  no descriptor at all and can never record consent. */
  private pendingConsent: { key: string; auto: boolean; destination: string } | undefined;

  constructor(
    private readonly store: AiConfigStore,
    private readonly workspaceState: MementoLike,
    private readonly post: (msg: HostToWebview) => void,
    private readonly getPages: () => Page[],
    private readonly getFileName: () => string,
    private readonly getActiveIndex: () => number = () => 0,
    /** The config and keys are shared by every panel; the others must hear when they change. */
    private readonly onConfigChanged: () => void = () => {},
  ) {}

  /** Consent is stored as the destination it was given for, not as a flag. The config is shared
   *  across windows while consent is per workspace, so a flag given for Anthropic here would
   *  otherwise cover a LAN host chosen in another window. A legacy `true` matches nothing. */
  private hasConsent(key: string, cfg: AiConfig): boolean {
    return this.workspaceState.get<unknown>(key, false) === destinationKey(cfg.provider, cfg.baseUrl);
  }

  async postConfigState(): Promise<void> {
    const cfg = this.store.getConfig();
    this.post({
      type: 'aiConfigState',
      configured: await this.store.isConfigured(),
      provider: cfg.provider,
      model: cfg.model,
      configuredProviders: await this.store.configuredProviders(),
      local: isLocalConfig(cfg.provider, cfg.baseUrl),
      baseUrl: cfg.baseUrl,
      keyedOrigins: this.store.keyedOrigins(),
    });
  }

  async handle(msg: WebviewToHost): Promise<void> {
    switch (msg.type) {
      case 'aiConfigRequest': await this.postConfigState(); break;
      case 'aiSaveConfig': {
        // An endpoint the destination rule cannot classify is refused rather than stored: every
        // promise the interface makes about where content goes is derived from that rule.
        if (msg.config.provider === 'compatible' && !describeDestination(msg.config.baseUrl ?? '').ok) {
          await this.postConfigState();
          break;
        }
        // Consent is about where content goes. Changing the destination — the provider, or a
        // compatible endpoint's origin — revokes it; changing the model or the token cap does
        // not, because that would be friction with no privacy meaning.
        const previous = this.store.getConfig();
        await this.store.setConfig(msg.config);
        if (destinationKey(msg.config.provider, msg.config.baseUrl) !== destinationKey(previous.provider, previous.baseUrl)) {
          // A dialog still open was built for the old destination; it must not send anywhere.
          this.pendingRun = undefined;
          this.pendingConsent = undefined;
          await this.workspaceState.update(FIRST_SEND_KEY, false);
          await this.workspaceState.update(CHAT_KEY, false);
        }
        await this.postConfigState();
        this.onConfigChanged();
        break;
      }
      case 'aiClearKey':
        // Disconnecting is a privacy action: drop anything in flight, forget the key, and
        // revoke every consent, so a future key has to be confirmed again for each kind of
        // send. Leaving one standing would let a new key inherit permission it never had.
        this.dispose();
        await this.store.clearAllKeys();
        // A keyless endpoint would survive the clear and keep sending. Falling back to the
        // default provider, which now holds no key, keeps Disconnect meaning "nothing is sent".
        if (this.store.getConfig().provider === 'compatible') await this.store.setConfig(DEFAULT_AI_CONFIG);
        await this.workspaceState.update(FIRST_SEND_KEY, false);
        await this.workspaceState.update(CHAT_KEY, false);
        await this.postConfigState();
        this.onConfigChanged();
        break;
      case 'aiSaveKey':
        // Goes straight to SecretStorage — the key never enters the config object.
        await this.store.setKey(msg.key);
        await this.postConfigState();
        this.onConfigChanged();
        break;
      case 'aiTestConnection': {
        const key = await this.store.getCredential();
        if (key === undefined) { this.post({ type: 'aiConnectionResult', ok: false, ms: 0, error: 'No API key set' }); break; }
        const result = await createProvider(this.store.getConfig(), key).testConnection();
        this.post({ type: 'aiConnectionResult', ...result });
        break;
      }
      case 'aiListModels': {
        const cfg = this.store.getConfig();
        const key = await this.store.getCredential();
        if (key === undefined) {
          // Listing needs a key, or for a compatible endpoint a URL. Saying so beats an empty
          // list, which reads as 'none available'.
          const error = cfg.provider === 'compatible' ? 'Save a valid base URL first.' : 'Add an API key for this provider first.';
          this.post({ type: 'aiModelList', provider: cfg.provider, models: [], error });
          break;
        }
        try {
          const models = await createProvider(cfg, key).listModels();
          this.post({ type: 'aiModelList', provider: cfg.provider, models });
        } catch (err) {
          this.post({
            type: 'aiModelList', provider: cfg.provider, models: [],
            error: err instanceof Error ? err.message : 'Could not list models',
          });
        }
        break;
      }
      case 'aiAction': await this.startAction(msg); break;
      case 'aiChat': await this.startChat(msg); break;
      case 'aiStop': this.abort?.abort(); break;
      case 'aiConfirmSend': await this.onConfirm(msg.dontAskAgain, msg.masked); break;
      case 'aiCancelSend': this.pendingRun = undefined; this.pendingConsent = undefined; break;
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
      const key = await this.store.getCredential(cfg);
      if (key === undefined) { this.post({ type: 'aiError', kind: 'auth', message: 'No API key set' }); return; }
      // A second request must not interleave its chunks with a running one.
      this.abort?.abort();
      const abort = new AbortController();
      this.abort = abort;
      const finalReq = { ...req, messages: [{ role: 'user' as const, content: masked ? maskSecrets(rawText) : rawText }] };
      await this.pump(createProvider(cfg, key).generate(finalReq, abort.signal));
      if (this.abort === abort) this.abort = undefined;
    };

    // FR-MVP-032 asks for confirmation before sending to a remote provider. On loopback nothing
    // leaves the machine, so there is nothing to consent to, and nothing to mask.
    if (isLocalConfig(cfg.provider, cfg.baseUrl) || this.hasConsent(FIRST_SEND_KEY, cfg)) {
      await run(false);
      return;
    }
    this.pendingRun = run;
    this.pendingConsent = { key: FIRST_SEND_KEY, auto: false, destination: destinationKey(cfg.provider, cfg.baseUrl) };
    this.postConfirm(rawText, cfg, {
      sectionTitle: page.title, scope: msg.scope, sectionCount: 1, truncated: [], estTokens: estimateTokens(rawText),
    });
  }

  /** Document scope always confirms: the consent recorded for one section was given in front of a
   *  different order of magnitude of data and money. On loopback it still confirms — not for
   *  privacy, but because a dozen requests to a local model can take minutes. */
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
      const key = await this.store.getCredential(cfg);
      if (key === undefined) { this.post({ type: 'aiError', kind: 'auth', message: 'No API key set' }); return; }
      this.abort?.abort();
      const abort = new AbortController();
      this.abort = abort;
      const finalPlan: DocumentPlan = masked
        ? { ...plan, steps: plan.steps.map((s) => ({ ...s, content: maskSecrets(s.content) })) }
        : plan;
      await this.pump(runDocumentSummary(finalPlan, action, { fileName: this.getFileName() }, cfg, createProvider(cfg, key), abort.signal));
      if (this.abort === abort) this.abort = undefined;
    };

    this.pendingConsent = undefined;
    this.postConfirm(rawText, cfg, {
      sectionTitle: '', scope: 'document', sectionCount: plan.sectionCount,
      truncated: plan.truncated, estTokens: plan.estInputTokens,
    });
  }


  /** Chat has its own gate: consent to send one section the user chose is not consent to send
   *  whatever a scoring function selects. After the gate, the dialog returns only for secrets. */
  private async startChat(msg: Extract<WebviewToHost, { type: 'aiChat' }>): Promise<void> {
    const question = typeof msg.question === 'string' ? msg.question : '';
    if (!question.trim() || question.length > MAX_QUESTION_CHARS) return;

    const history: ChatTurn[] = Array.isArray(msg.history) ? msg.history : [];
    if (history.length > MAX_HISTORY_TURNS) return;
    if (history.some((t) => typeof t.text !== 'string' || t.text.length > MAX_HISTORY_TURN_CHARS)) return;

    const selection = typeof msg.selection === 'string' ? msg.selection : undefined;
    if (selection !== undefined && selection.length > MAX_TEXT_CHARS) return;

    const pages = this.getPages();
    if (pages.length === 0) return;

    const cfg = this.store.getConfig();
    const plan = planChatTurn(
      question, history, pages, this.getActiveIndex(), { fileName: this.getFileName() },
      { sectionTokens: CHAT_SECTION_BUDGET_TOKENS, historyTokens: CHAT_HISTORY_BUDGET_TOKENS },
      selection,
    );

    // What is scanned and masked is what is sent: the chosen sections and the history alike.
    const rawText = plan.messages.map((m) => m.content).join('\n\n');

    const run = async (masked: boolean) => {
      const key = await this.store.getCredential(cfg);
      if (key === undefined) { this.post({ type: 'aiError', kind: 'auth', message: 'No API key set' }); return; }
      this.abort?.abort();
      const abort = new AbortController();
      this.abort = abort;
      this.post({ type: 'aiSources', sections: plan.usedSections, droppedTurns: plan.droppedTurns });
      const messages = plan.messages.map((m) => ({ role: m.role, content: masked ? maskSecrets(m.content) : m.content }));
      await this.pump(createProvider(cfg, key).generate({ system: CHAT_SYSTEM, messages, maxTokens: cfg.maxTokens }, abort.signal));
      if (this.abort === abort) this.abort = undefined;
    };

    const consented = this.hasConsent(CHAT_KEY, cfg);
    const secrets = detectSecrets(rawText).length;
    if (isLocalConfig(cfg.provider, cfg.baseUrl) || (consented && secrets === 0)) {
      await run(false);
      return;
    }

    this.pendingRun = run;
    // Before the gate, sending grants consent. After it, this dialog is only about masking.
    this.pendingConsent = consented ? undefined : { key: CHAT_KEY, auto: true, destination: destinationKey(cfg.provider, cfg.baseUrl) };
    this.postConfirm(rawText, cfg, {
      sectionTitle: '', scope: 'chat', sectionCount: plan.usedSections.length, truncated: [],
      estTokens: estimateTokens(rawText),
    });
  }

  private postConfirm(
    rawText: string,
    cfg: AiConfig,
    facts: { sectionTitle: string; scope: 'section' | 'selection' | 'document' | 'chat'; sectionCount: number; truncated: string[]; estTokens: number },
  ): void {
    const dest = cfg.provider === 'compatible' ? describeDestination(cfg.baseUrl ?? '') : undefined;
    const local = dest !== undefined && dest.ok && dest.isLoopback;
    // A remote compatible endpoint is named by its host: "OpenAI-compatible endpoint" does not
    // answer the one question this dialog asks, which is where the content is going.
    const provider = dest !== undefined && dest.ok && !local ? dest.host : (PROVIDERS[cfg.provider] ?? PROVIDERS.anthropic).label;
    // Nothing leaves the machine on loopback, so masking would only make the answer worse.
    const count = local ? 0 : detectSecrets(rawText).length;
    this.post({
      type: 'aiConfirmNeeded',
      summary: {
        fileName: this.getFileName(),
        provider,
        local,
        plainHttp: dest !== undefined && dest.ok && !dest.isLoopback && !dest.isTls,
        pricedModel: local || isPricedModel(cfg.provider, cfg.model),
        sectionTitle: facts.sectionTitle,
        scope: facts.scope,
        sectionCount: facts.sectionCount,
        truncated: facts.truncated,
        model: cfg.model,
        estTokens: facts.estTokens,
        estCost: local ? 0 : estimateCost(facts.estTokens, cfg.provider, cfg.model),
      },
      secrets: { label: count ? `${count} possible secret${count > 1 ? 's' : ''} detected` : '', count },
    });
  }

  private async onConfirm(dontAskAgain: boolean, masked: boolean): Promise<void> {
    const consent = this.pendingConsent;
    // `auto` grants on send (chat); otherwise only the checkbox grants. A document run carries no
    // descriptor, so it can never record consent whatever the message claims.
    // The destination recorded is the one the dialog showed, even if the config moved since.
    if (consent && (consent.auto || dontAskAgain)) await this.workspaceState.update(consent.key, consent.destination);
    const run = this.pendingRun;
    this.pendingRun = undefined;
    this.pendingConsent = undefined;
    if (run) await run(masked);
  }
}
