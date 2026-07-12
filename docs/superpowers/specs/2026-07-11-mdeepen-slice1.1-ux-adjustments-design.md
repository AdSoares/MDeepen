# MDeepen — Slice 1.1: Ajustes de UX do Reader — Design

**Data:** 2026-07-11
**Origem:** Feedback do smoke de aceitação do Slice 1 (Ad, 6 itens)
**Base:** branch `feature/slice1-reader-core` (Slice 1 completo, 48 testes verdes)
**Status:** Aprovado para plano de implementação

---

## 1. Contexto

Durante o smoke de aceitação do Slice 1, Ad levantou 6 ajustes. Dois deles (marcas de lido incorretas ao pular seções; desmarcação ao voltar) compartilham a mesma causa raiz: o estado "lido" é **derivado da posição** (`pageIndex < activeIndex`) em vez de rastrear seções realmente visitadas. Os demais são controles de layout ausentes (toggles, resize, largura útil da coluna).

Decisões tomadas com Ad em 2026-07-11:
- "Lido" = **visita + tempo mínimo** (dwell).
- Largura da coluna: **manter steppers, passo maior** + opção "Cheia".
- Painéis: **toggles + drag-resize**, ambos nesta rodada.
- Botões `›‹`/`‹›` do Slice 1: diagnóstico "mudou pouco/não sei" — consistente com passo de 40px imperceptível; sem bug separado a investigar. O redesenho da largura resolve; validar no smoke.

## 2. Escopo

### 2.1 Marcas de lido por visita com dwell (itens 1 e 6 do feedback)

- Ao ativar uma seção, o webview inicia um timer de **5 segundos** (`READ_DWELL_MS = 5000`, constante).
- Se o usuário permanecer na seção até o timer expirar, a página é adicionada a um **conjunto de lidas** (`readSet`) e o webview envia `sectionRead { id }` ao host.
- Navegar para outra seção antes de expirar cancela o timer (seção não marcada).
- Pular seções **não** marca as puladas. Navegar para trás **não** desmarca nada. Marcas nunca são removidas automaticamente (limpar tudo fica fora deste slice).
- Outline: marca de lido = `readSet` contém o id da página do nó (não mais comparação posicional). Rodapé conta `readSet.size`.
- **Persistência por arquivo** (workspaceState, junto da posição): fechar/reabrir mantém as lidas.
- **Remapeamento em edições:** ids de página derivam de `startLine` e deslocam quando o arquivo muda. No reparse, o host remapeia o conjunto: id ainda existente → mantém; id sumido → tenta casar por título (mesma filosofia de `reconcileIndex`); sem match → descarta. Limitação aceita: títulos duplicados podem colidir no fallback.

### 2.2 Largura da coluna de leitura (itens 3 e 5)

- Steppers mantidos com **passo de 100px**, faixa **480–1400px**.
- Um passo acima de 1400 → **"Cheia"** (sentinela `columnWidth = 0`): sem max-width, coluna usa todo o espaço disponível. Um passo abaixo de "Cheia" → 1400.
- Readout entre os botões mostrando o valor atual (`"700px"` ou `"Cheia"`).
- CSS: `--md-col` recebe `100%` quando 0, senão `<n>px`.

### 2.3 Toggles de painéis (item 4)

- Dois botões-ícone na barra superior: Codicons `layout-sidebar-left` (outline) e `layout-sidebar-right` (painel AI), com `aria-label` e `aria-pressed`.
- Alternam `panels.outlineVisible` / `panels.aiVisible` (estado já existente no store; falta só a UI).

### 2.4 Bordas arrastáveis (item 2)

- Alças verticais de **6px** entre outline|conteúdo e conteúdo|AI.
- Pointer events (`pointerdown`/`pointermove`/`pointerup` com `setPointerCapture`).
- Limites: outline **180–400px**; painel AI **260–480px**.
- Larguras aplicadas via CSS vars (`--md-outline-w`, `--md-ai-w`) substituindo os 252px/340px fixos.
- Cursor `col-resize`; alça com hover visível; sem drag em modo foco (painéis ocultos).

### 2.5 Persistência de estado de UI

- **Novas mensagens webview→host:**
  - `sectionRead { id: string }` — imediata.
  - `uiStateChanged { config: ReaderConfig, panels: PanelsState }` — debounced (~500ms) para não martelar o memento durante drag/steppers.
- **`PanelsState`** (novo tipo compartilhado): `{ outlineVisible: boolean; aiVisible: boolean; outlineWidth: number; aiWidth: number }` (o flag `focus` continua efêmero, não persiste).
- **Host persiste:**
  - `config` + `panels` → **globalState** (preferência do usuário, vale para todos os arquivos/workspaces).
  - posição + `readIds: string[]` → **workspaceState por URI** (evolução do `PositionStore` → armazena `{ index, readIds }`).
- **Mensagens host→webview atualizadas:** `init` ganha `readIds: string[]` e `panels: PanelsState`; `sectionsUpdated` ganha `readIds` (já remapeados pelo host).
- Isto fecha o follow-up "persistência de config (design §7)" da revisão final do Slice 1.

## 3. Fora do escopo desta rodada

Demais follow-ups do Slice 1 (debounce de reparse, allowlist de schemes, bundle a11y, slimming do highlight.js, headings indentados, npm audit, botão refresh/seletor de nível). Nenhuma funcionalidade de IA.

## 4. Critérios de conclusão

1. Abrir uma seção e permanecer ≥5s marca como lida; sair antes não marca; pular não marca; voltar não desmarca.
2. Lidas persistem ao fechar/reabrir o arquivo; sobrevivem a edições que deslocam seções (por id, fallback título).
3. Rodapé do outline conta as lidas reais.
4. Steppers de largura em passos de 100px até 1400px + estado "Cheia"; readout visível; mudança perceptível a cada clique.
5. Toggles exibem/escondem outline e painel AI individualmente.
6. Bordas arrastáveis redimensionam outline (180–400) e AI (260–480); larguras persistem entre sessões.
7. Config (fonte/coluna/espaçamento/tema) persiste entre sessões (globalState).
8. Lógica pura nova (remapeamento de readIds, clamps de largura/coluna) coberta por testes de unidade; suíte inteira verde.
9. `.vsix` reempacotado instala e passa no re-smoke dos itens do feedback.
