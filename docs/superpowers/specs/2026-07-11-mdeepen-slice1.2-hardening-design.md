# MDeepen — Slice 1.2: Hardening & Small Features — Design

**Data:** 2026-07-11
**Origem:** Follow-ups acumulados nas revisões finais dos Slices 1 e 1.0/1.1
**Base:** branch `feature/slice1-reader-core` (Slice 1.1 completo, 71 testes verdes, vsix 0.1.1)
**Status:** Aprovado para plano de implementação (escopo A+B confirmado com Ad)

---

## 1. Contexto

As revisões de branch inteiro dos Slices 1 e 1.1 acumularam um backlog de follow-ups. Ad aprovou executar os grupos **A (hardening & qualidade)** e **B (nova superfície de feature usando mensagens já existentes no contrato)** agora, antes do merge. Grupo C (last-writer-wins multi-painel; harness de teste DOM para o dwell) fica fora — aceitável para ferramenta single-user / precisa de infra nova.

`npm audit --omit=dev` retorna **0 vulnerabilidades** — todas as 8 conhecidas estão em devDependencies (toolchain vitest/vite e a cópia interna de markdown-it do `@vscode/vsce`) e não são empacotadas no `.vsix`. Portanto o item "npm audit" é verificação documentada, não mudança de código; não faremos o bump breaking do vsce (2.x→3.x) por um aviso dev-only.

## 2. Escopo

### Grupo A — Hardening & qualidade

**A1. Paridade de headings indentados (correção de correção).** `extractHeadings` hoje só reconhece ATX na coluna 0; markdown-it renderiza ATX com 1–3 espaços de indentação como heading, então uma seção `  ## X` renderiza como título mas some do outline/paginação. Corrigir o regex ATX para aceitar 0–3 espaços iniciais (4+ espaços = bloco de código, NÃO pode casar). Fence-awareness inalterada.

**A2. Snap direcional no stepper de largura.** `stepColumnWidth` snapa um valor não-alinhado ao grid mais próximo e depois aplica o passo inteiro, o que pode pular um step (ex.: 660 subindo → snap 700 → 800, pulando 700). Valores não-alinhados só existem por persistência de larguras do stepper de ±40px do Slice 1. Corrigir: se o snap já move na direção do passo, o snap conta como o passo.

**A3. Allowlist de schemes de link (defense-in-depth).** `classifyLink` classifica qualquer href sem `http(s):`/`mailto:`/`#` como `local`, então `javascript:`, `vscode:`, `data:` etc. são encaminhados ao host. Não é explorável hoje (markdown-it `validateLink` bloqueia esses schemes antes de virar `<a>`), mas é frágil se a config do markdown mudar no Slice 2. Adicionar retorno `'blocked'` para hrefs com scheme não-permitido; o webview faz no-op em `'blocked'` (nunca posta). O tipo de mensagem `openLink.kind` permanece `external|local|anchor` (blocked nunca é enviado).

**A4. Bundle de acessibilidade.**
- `.focus-progress`: `role="progressbar"` + `aria-valuenow/min/max`.
- Outline: envolver os filhos de cada nó em `role="group"` (padrão ARIA tree correto).
- AiPanel: título vira heading semântico real (`<h2>` ou `role="heading" aria-level=2`) em vez de `<strong>`.
- ViewControls: `<select>` de tema estilizado com variáveis `--vscode-*` (hoje usa chrome do SO).

**A5. Slimming do highlight.js.** Trocar `import('highlight.js')` por `import('highlight.js/lib/common')` (subset das ~35 linguagens comuns) para reduzir o chunk lazy. Aceita: linguagens fora do common caem para sem-highlight (degradação suave, já suportada).

**A6. Dedup de defaults.** As constantes de painel/config default (`252/340`, config `15.5/700/1.72/auto`) estão duplicadas entre `store.ts`, `positionStore.ts` (`DEFAULT_UI_STATE`). Extrair para um único módulo compartilhado (`src/shared/defaults.ts`) consumido pelos dois lados.

**A7. Verificação de audit.** Documentar no report/README de dev que produção = 0 vulnerabilidades; sem mudança de dependência.

### Grupo B — Nova superfície de feature (mensagens já existem no contrato)

**B1. Botão de atualizar manual.** Botão-ícone (Codicon `refresh`) na barra superior que posta `{ type: 'refresh' }`. O host já reparseia e envia `sectionsUpdated`. Cobre o caso de arquivo alterado fora do VS Code (sem evento `onDidChangeTextDocument`), citado no design do Slice 1 §5.

**B2. Seletor de nível de paginação.** `<select>` na barra superior (Título 1…6) que posta `{ type: 'setPaginationLevel', level }`. O host já reparseia no nível escolhido e envia `sectionsUpdated`. O nível efetivo atual vem em `init`/`sectionsUpdated` (`effectiveLevel`) — o store guarda e o select reflete. Nota: a paginação re-divide o documento; o host reconcilia o índice ativo (`reconcileIndex`) e remapeia as marcas de lido (`remapReadIds`), já implementados.

## 3. Fora do escopo

Grupo C; qualquer funcionalidade de IA; mudança de dependências de produção; migração/limpeza do memento legado (só leitura de fallback permanece).

## 4. Critérios de conclusão

1. Heading ATX com 1–3 espaços aparece no outline e pagina; com 4+ espaços é tratado como código (não vira seção).
2. `stepColumnWidth` a partir de valor não-alinhado não pula step em nenhuma direção.
3. Links com scheme não-permitido (`javascript:`/`vscode:`/`data:`) são no-op no webview (não postam), sem erro; `http(s)`/`mailto`/relativos/âncora inalterados.
4. `role="progressbar"`, `role="group"` no outline, heading semântico no AiPanel, select de tema estilizado — todos presentes.
5. Chunk do highlight.js menor (comparar antes/depois) sem quebrar highlight de linguagens comuns.
6. Defaults definidos uma única vez e consumidos pelos dois lados.
7. Botão de atualizar reparseia (posta `refresh`); reflete mudanças de arquivo feitas fora do editor.
8. Seletor de nível re-pagina; índice ativo e marcas de lido preservados coerentemente; select reflete o nível efetivo.
9. Nova lógica pura (regex de heading, snap de largura, allowlist) coberta por testes; suíte inteira verde.
10. `mdeepen-0.1.2.vsix` empacota, sem `.map`/`.superpowers`.
