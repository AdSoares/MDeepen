# MDeepen — Slice 2.0: AI Foundation — Design

**Data:** 2026-07-13
**Produto:** MDeepen — Markdown Intelligence Reader (extensão VS Code)
**Fatia:** Slice 2.0 de N (primeira fatia da camada de IA — Slice 2)
**Base:** branch `feature/slice2.0-ai-foundation` a partir de `main` (Slices 1 + 1.1 + 1.2 mergeados; 78 testes)
**Status:** Aprovado para plano de implementação

---

## 1. Contexto e decisão de escopo

O Slice 1 entregou o leitor completo sem IA; o painel de IA mostra o estado "AI off" (S3). O Slice 2 é a camada de IA inteira (chat, ações de seleção, resumos, geração de Mermaid, config de provedor, privacidade, histórico) — grande demais para uma fatia. Decompomos em sub-slices por dependência:

> **2.0 Fundação** → **2.1 Chat** → **2.2 Ações de seleção** → **2.3 Mermaid**

A 2.0 vem primeiro porque tudo depende de conseguir chamar um LLM com segurança. Decisões tomadas com Ad (2026-07-13):
- Interface `AiProvider` abstrata + **um** provedor concreto: **Anthropic (Claude)** via Messages API com streaming.
- A 2.0 entrega **encanamento + uma ação real de streaming** (Resumir seção) para validar o cano inteiro provider→host→webview→render que o Chat (2.1) vai reusar.
- Anthropic remoto puxa o fluxo de privacidade inteiro (SecretStorage, confirmação de 1º envio S16, detecção de segredos) para dentro da 2.0.

Referência de SDK/modelo confirmada pela skill `claude-api`: SDK `@anthropic-ai/sdk` no Extension Host (Node); streaming via `client.messages.stream`; modelo default `claude-opus-4-8`; chave passada explicitamente; erros tipados (`AuthenticationError`/`RateLimitError`/`APIConnectionError`).

## 2. Arquitetura

Restrição dura: o **Webview tem CSP** (`default-src 'none'`) e não pode fazer fetch externo. Portanto **toda** chamada de rede e o SDK vivem no **Extension Host** (Node); o host faz streaming de tokens para o webview via mensagens. Isso espelha o Slice 1 (host dona I/O, webview renderiza).

Novo diretório `src/extension/ai/`:

```
src/extension/ai/
├── types.ts             ← AiProvider, AiRequest, AiChunk, ConnectionResult, AiConfig, AiErrorKind
├── AnthropicProvider.ts ← implementa AiProvider via @anthropic-ai/sdk (streaming + testConnection)
├── providerRegistry.ts  ← createProvider(config, apiKey): AiProvider (só Anthropic hoje)
├── secretDetection.ts   ← detectSecrets(text): Secret[] (pura, testável)
├── costEstimate.ts      ← estimateTokens(text), estimateCost(tokens, model) (pura, testável)
├── errorMap.ts          ← classifyError(err): AiErrorKind (pura, testável)
├── prompts.ts           ← buildSummarizeRequest(section): AiRequest (pura, testável)
└── AiController.ts       ← orquestra config, SecretStorage, gate de 1º-envio, stream→webview
```

### 2.1 Interface (da spec §9.2, refinada)

```typescript
export type AiErrorKind = 'auth' | 'rate_limit' | 'connection' | 'unknown';

export interface AiRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
}

export type AiChunk =
  | { type: 'text'; text: string }
  | { type: 'done'; usage: { inputTokens: number; outputTokens: number } }
  | { type: 'error'; kind: AiErrorKind; message: string };

export interface ConnectionResult { ok: boolean; ms: number; error?: string }

export interface AiProvider {
  generate(request: AiRequest, signal: AbortSignal): AsyncIterable<AiChunk>;
  testConnection(): Promise<ConnectionResult>;
}

export interface AiConfig {
  provider: 'anthropic';       // única opção nesta fatia
  model: string;               // default 'claude-opus-4-8'; opções: sonnet-5, haiku-4-5
  maxTokens: number;           // default 4096 p/ resumo
}
```

### 2.2 AnthropicProvider

Traduz `AiRequest` → `client.messages.stream({ model, max_tokens, system, messages })` (thinking omitido = sem thinking = rápido/barato no opus-4-8). Itera eventos: `content_block_delta`/`text_delta` → `AiChunk{text}`; ao final lê `finalMessage().usage` → `AiChunk{done, usage}`. Exceções tipadas mapeadas por `errorMap.classifyError` → `AiChunk{error, kind}`. Respeita o `AbortSignal` (passa ao SDK / interrompe o loop). `testConnection()` faz um `messages.create` mínimo (`max_tokens: 1`) medindo latência e classificando erro.

## 3. Config de provedor (S4)

Comando `mdeepen.configureAi` (`MDeepen: Configure AI…`) abre um webview de config (tela S4):
- Modo: segmentado Local/Remote com **Remote (Anthropic)** ativo; Local desabilitado com nota "Slice 2 futuro".
- Modelo: dropdown (Opus 4.8 / Sonnet 5 / Haiku 4.5).
- Max tokens (número), com default 4096.
- Chave da API: campo mascarado ("not shown"); salva no **SecretStorage** (chave `mdeepen.anthropic.apiKey`). Nunca em `settings.json`, arquivo de workspace, `.md` ou logs.
- "Test connection" → `testConnection()` → resultado ("Connected · 128 ms" / erro).
- Config não-secreta (`provider/model/maxTokens`) em `globalState` (`mdeepen.aiConfig`).

Estado configurado: o painel de IA deixa o estado "AI off" (S3) e mostra as ações; badge de provedor na status bar e no topo do painel ("● Anthropic · opus-4-8").

## 4. Privacidade — primeiro envio (S16) + segredos

Antes do **primeiro** envio remoto por workspace (flag `mdeepen.ai.firstSendConfirmed` em `workspaceState`), o host emite `aiConfirmNeeded` e o webview mostra o modal S16:
- Resumo: Conteúdo (nome/seção), Modelo, **Tokens estimados** e **Custo estimado** — via `costEstimate` **local** (`estimateTokens ≈ chars/4`, `estimateCost` por tabela de preços dos modelos oferecidos, rotulado "estimado"). Nenhuma chamada de rede antes da confirmação.
- Se `detectSecrets` achar padrões (`sk-…`, `AKIA[0-9A-Z]{16}`, `ghp_…`, bearer/JWT-like), aviso "N possível segredo detectado" + ação **Mask** (substitui por `‹redacted›` no texto que será enviado).
- Checkbox "Não perguntar de novo" (persiste a flag), Cancel, **Mask & send / Send**.

Confirmado (`aiConfirmSend`), o host prossegue com o stream. O uso real volta em `aiDone.usage`.

## 5. Ação de prova — "Resumir seção" (streaming)

No painel de IA configurado, botão **Summarize section**:
1. Webview posta `aiSummarizeSection { id }` (o host já tem as `pages` do Slice 1 e recupera o conteúdo da seção pelo id).
2. Host: `buildSummarizeRequest(section)` (system: instrução de resumo conciso do documento; user: título + conteúdo da seção), passa pelo gate de 1º-envio, cria `AbortController`, chama `provider.generate`.
3. Streaming: cada `AiChunk{text}` → `aiChunk` → webview renderiza token-a-token com caret piscando (S18) e barra **Stop generating**.
4. `aiStop` → o host aborta o `AbortController` (mantém o parcial, marcado com reticências).
5. Fim: `aiDone` → o webview anexa um chip de citação `§NN Título` clicável (navega via `onSelect(pageIndex)` reusando o Slice 1.1) + botão **Copy**.
6. **Nada é escrito no `.md`.**

## 6. Contrato de mensagens (adições)

Novos tipos em `src/shared/messages.ts` (o guard já valida por `type`):

**Webview→Host:** `aiSummarizeSection {id}`, `aiStop`, `aiConfirmSend {dontAskAgain, masked}`, `aiCancelSend`, `aiTestConnection`, `aiSaveConfig {config}`, `aiConfigRequest` (pede o estado atual).

**Host→Webview:** `aiChunk {text}`, `aiDone {usage}`, `aiError {kind, message}`, `aiConfirmNeeded {summary, secrets}`, `aiConfigState {configured, provider, model}`, `aiConnectionResult {ok, ms, error}`.

O `AbortController` do stream vive no host. A validação de payload segue a disciplina do Slice 1.2 (guard + checagem de campos onde há risco).

## 7. Estados de erro/loading (subconjunto S17/S18)

- **S18:** skeleton (aguardando 1º token), streaming (caret piscando), stop.
- **S17 nesta fatia:** "Can't reach the model" (`connection` → Retry/Settings; leitura segue), "Invalid API key" (`auth` → Update key abre S4), "Rate limit reached" (`rate_limit` → mensagem/retry). Toda falha é recuperável; a leitura nunca trava; o leitor continua 100% funcional sem IA.

## 8. Segurança & privacidade (NFR)

- Chave só no SecretStorage; nunca logada. Respostas da IA tratadas como conteúdo não confiável (sanitizadas ao renderizar, reusando o pipeline do Slice 1).
- Conteúdo do documento só sai da máquina após confirmação explícita (S16) no primeiro envio.
- Sem telemetria de conteúdo. Estimativa de custo é local.

## 9. Build, testes & empacotamento

- **Build:** `@anthropic-ai/sdk` bundlado no `dist/extension.js` (esbuild `platform: node`, `external: ['vscode']`). `.vscodeignore` inalterado (SDK vai no bundle; `node_modules` continua excluído). Verificar que o `.vsix` não cresce de forma anômala.
- **Testes (Vitest, lógica pura):** `detectSecrets` (padrões + mask), `estimateTokens`/`estimateCost`, `classifyError` (cada tipo de exceção → kind), `buildSummarizeRequest` (formato do prompt), serialização das novas mensagens.
- **Smoke manual (chave real):** config S4 + test connection; primeiro envio → S16 (com e sem segredo); Summarize section streaming + Stop + citação + Copy; erros S17 (chave inválida, offline).
- Empacota `mdeepen-0.2.0.vsix`.

## 10. Fora do escopo desta fatia

Chat multi-turno (2.1), ações de seleção S7 (2.2), resumo de documento inteiro + segmentação FR-MVP-023 (2.1), geração de Mermaid por IA (2.3), provedor local/Ollama, histórico persistente, personas, múltiplos provedores concretos.

## 11. Critérios de conclusão

1. `AiProvider` definida; `AnthropicProvider` faz streaming real via SDK e mapeia erros tipados.
2. Config S4 salva modelo/tokens em globalState e a chave no SecretStorage (nunca em settings/log); "Test connection" funciona.
3. Painel sai do "AI off" quando configurado; badge de provedor exibido.
4. Primeiro envio remoto por workspace dispara o modal S16 com tokens/custo estimados localmente; detecção de segredos + mask funcionam; "não perguntar de novo" persiste.
5. "Summarize section" faz streaming token-a-token com caret; Stop mantém o parcial; citação navega; Copy funciona; o `.md` não é modificado.
6. Erros de IA (chave inválida, offline, rate limit) exibem estados recuperáveis; a leitura nunca trava.
7. Lógica pura nova coberta por testes; suíte inteira verde.
8. `mdeepen-0.2.0.vsix` empacota, instala e passa no smoke da chave real.
