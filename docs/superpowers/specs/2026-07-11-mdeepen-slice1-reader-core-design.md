# MDeepen — Slice 1: Reader Core (sem IA) — Design

**Data:** 2026-07-11
**Produto:** MDeepen — Markdown Intelligence Reader (extensão VS Code)
**Fatia:** Slice 1 de N — leitor paginado por seção, sem qualquer funcionalidade de IA
**Status:** Aprovado para plano de implementação

---

## 1. Contexto e decisão de escopo

O MDeepen tem specs em três camadas já escritas em `docs/`:

- **V1 — MVP** (`01-especificacao-mvp.md`, 35 FRs): leitor paginado + IA (chat, resumo, seleção→ações, Mermaid, config de provedor).
- **V2 — Completo** (`02-especificacao-versao-completa.md`, ~44 FRs): bookmarks, glossário, busca semântica, personas, transformações, comparação, qualidade, estudo.
- **V3 — Avançado** (`03-especificacao-versao-avancada-diferenciais.md`, ~45 FRs): validação doc↔código, grafo de conhecimento, arquitetura, agentes.

Há também um **design handoff hifi** em `docs/design_handoff_mdeepen_reader/` com 18 telas (S1–S18), tokens do tema VS Code e tipografia serifada para leitura.

O conjunto é grande demais para um único ciclo spec→plano→implementação. Decisão (alinhada com a filosofia minimalista/incremental da fábrica Codartia): **construir em fatias verticais finas**, começando pelo **Reader Core sem IA**. O próprio handoff estabelece que o leitor deve funcionar sem IA — isso torna o Slice 1 uma extensão rodável e demonstrável desde cedo, e a base sobre a qual a IA (Slice 2) se apoia sem retrabalho.

### Escopo do Slice 1 (o que ENTRA)

Cobre o subconjunto "sem IA" do MVP:

- FR-MVP-001 (abrir no leitor: comando + menu de contexto)
- FR-MVP-002/003 (identificar seções; nível de paginação configurável)
- FR-MVP-004/005/006/007 (outline, navegação, progresso, memória de posição)
- FR-MVP-008/009/010 (renderização, code blocks, links)
- FR-MVP-011/012/013 (modo leitura, modo foco, ajustes visuais)
- Render de blocos ` ```mermaid ` **já existentes** no arquivo (lazy-load da lib), sem IA.

### Fora do Slice 1 (vai para Slice 2+)

Toda a superfície de IA: seleção→ações (FR-MVP-014–016), resumo (017–019), chat (020–023), geração de Mermaid por IA (024–027), config de provedor (028–030), SecretStorage, privacidade/confirmação de envio (031–033), histórico de IA (034–035), telemetria. Modo apresentação (S6) e demais telas V2/V3 também ficam para depois.

---

## 2. Stack e decisões arquiteturais

- **Extension Host:** TypeScript sobre Node (API do VS Code).
- **Webview:** **Preact** (~3KB, API React) + CSS próprio lendo variáveis `--vscode-*` ao vivo. Sem Tailwind (atrito com as variáveis de tema). Build via **esbuild**.
- **Parsing:** decisão **Híbrida (C)** — o **Host** faz o parse de estrutura (árvore de títulos, divisão em seções, `startLine`/`endLine`), como fonte única de verdade; o **Webview** renderiza o Markdown da seção ativa. Isto espelha os componentes "Markdown Parser" e "Context Builder" da spec e evita retrabalho quando a IA precisar de line-mapping e citações no Slice 2.
- **Render Markdown:** `markdown-it` (+ plugins GFM: tabelas, task lists, strikethrough), `highlight.js` (lazy) para syntax highlight, `mermaid` (lazy) para diagramas.
- **Mermaid:** renderiza blocos existentes, mas a lib carrega sob demanda (só quando a seção contém um diagrama). Mantém o bundle base leve.

---

## 3. Arquitetura & estrutura de pastas

```
src/
├── extension/                    ← Extension Host (Node, TS)
│   ├── extension.ts              ← activate: registra comando + menu de contexto
│   ├── ReaderPanel.ts            ← cria/gerencia o WebviewPanel, message bus, watch de arquivo
│   ├── parser/
│   │   ├── sectionize.ts         ← markdown → DocumentSection[] (árvore + line map)
│   │   └── types.ts              ← DocumentSection e tipos de estrutura
│   └── state/positionStore.ts    ← memoriza última seção por arquivo (workspaceState)
├── webview/                      ← Preact
│   ├── main.tsx                  ← monta o app, conecta ao vscode.postMessage
│   ├── App.tsx                   ← layout 3 painéis (S1) + status bar
│   ├── panels/Outline.tsx        ← árvore de títulos, filtro, seção ativa, "lido"
│   ├── panels/Content.tsx        ← breadcrumb + coluna de leitura + nav footer
│   ├── panels/AiPanel.tsx        ← placeholder "AI off" (estado S3) — estrutura pronta p/ Slice 2
│   ├── render/markdown.ts        ← markdown-it + highlight.js (lazy) + mermaid (lazy)
│   ├── modes/                    ← reading (S1) + focus (S5)
│   └── styles/theme.css          ← tokens lendo --vscode-* + --md-*
└── shared/messages.ts           ← contrato de mensagens Host↔Webview (tipado)
```

### Componentes e responsabilidades

| Componente | O que faz | Depende de |
|---|---|---|
| `extension.ts` | Registra comando `mdeepen.openReader` e item de menu de contexto para `.md`; ativa a extensão. | API VS Code, `ReaderPanel` |
| `ReaderPanel` | Ciclo de vida do WebviewPanel; lê arquivo; chama `sectionize`; envia/recebe mensagens; observa mudanças do arquivo; abre links externos/locais. | `sectionize`, `positionStore`, `shared/messages` |
| `sectionize` | Função pura: `(markdown, paginationLevel) → DocumentSection[]`. Constrói árvore hierárquica e mapeia linhas. Testável sem VS Code. | markdown-it (só tokenização de headings) |
| `positionStore` | Persiste/recupera `activeSectionIndex` por URI em `workspaceState`. | API VS Code |
| Webview `App` | Layout de 3 painéis + status bar; detém `activeSectionIndex` (fonte única da UI). | painéis, `render/markdown` |
| `render/markdown` | Converte o conteúdo da seção em HTML sanitizado; aplica highlight e mermaid sob demanda. | markdown-it, highlight.js, mermaid |
| `shared/messages` | Tipos do protocolo Host↔Webview. Importado pelos dois lados. | — |

**Isolamento:** `sectionize` e `shared/messages` são lógica pura sem dependência do VS Code → testáveis por unidade. A UI do webview depende apenas do contrato de mensagens, não da implementação do host.

---

## 4. Contrato de mensagens (Host ↔ Webview)

Tipado em `shared/messages.ts`, importado pelos dois lados.

**Host → Webview:**
- `init` — `{ fileName, sections: DocumentSection[], paginationLevel, restoredIndex, config }`
- `sectionsUpdated` — `{ sections, paginationLevel }` (após mudança de arquivo ou refresh)
- `configChanged` — `{ config }` (ajustes visuais)

**Webview → Host:**
- `ready` — webview montou, pronto para receber `init`
- `activeSectionChanged` — `{ index }` (para persistir posição)
- `openLink` — `{ href, kind: 'external' | 'local' | 'anchor' }`
- `refresh` — pedido manual de reparse
- `setPaginationLevel` — `{ level }`

### Tipos-chave

```typescript
interface DocumentSection {
  id: string;
  title: string;
  level: number;       // 1..6
  startLine: number;
  endLine: number;
  content: string;     // markdown cru da seção
  children: DocumentSection[];
}
```

---

## 5. Fluxo de dados

1. Comando ou menu de contexto → `ReaderPanel.open(uri)` cria o WebviewPanel (nova aba; arquivo original nunca é modificado).
2. Webview envia `ready`. Host lê o `.md`, roda `sectionize()` com o nível de paginação (default `##`; se ausente, cai para o nível de título mais próximo encontrado; conteúdo antes do 1º título vira seção inicial).
3. Host envia `init` (sections + posição restaurada + config). Webview monta o outline e renderiza a seção ativa.
4. Navegação (clique no outline / Previous / Next / atalho / breadcrumb) muda `activeSectionIndex` **no webview** — fonte única da UI. Breadcrumb, progresso e status bar derivam dele. `progresso % = activeIndex / (total-1) * 100`. Ao mudar, webview envia `activeSectionChanged` → Host persiste em `workspaceState`.
5. Arquivo muda no disco (`onDidChangeTextDocument`/save) → Host reparseia e envia `sectionsUpdated`; webview reconcilia preservando a seção atual quando possível (por `id`/título; senão clamp ao índice válido). Botão "atualizar" força o mesmo caminho.

---

## 6. Renderização (FR-MVP-008/009/010)

markdown-it deve suportar, no mínimo: títulos, parágrafos, listas ordenadas/não ordenadas, links, imagens, tabelas (GFM), citações, code blocks, task lists, separadores, negrito/itálico/tachado.

- **Code blocks (FR-MVP-009):** syntax highlight via highlight.js (carregado sob demanda), label da linguagem, botão copiar, scroll horizontal quando necessário.
- **Mermaid:** blocos ` ```mermaid ` renderizados como diagrama; a lib carrega apenas quando a seção ativa contém ao menos um. Falha de parse do diagrama preserva o código-fonte e exibe erro localizado (não quebra a leitura).
- **Links (FR-MVP-010):** externo → navegador (Host `openExternal`); arquivo local → abre no VS Code; âncora → navega para a seção correspondente dentro do leitor.
- **Segurança:** o `.md` é tratado como conteúdo não confiável; HTML potencialmente inseguro é sanitizado antes de inserir no DOM.

---

## 7. Navegação, progresso e modos

- **Outline (S1, FR-MVP-004):** árvore hierárquica de títulos, filtro textual simples, colapsar/expandir nós, seção ativa destacada (`list.activeSelectionBackground`, peso 600), marca de "lido" (check verde). Rodapé com contagem "N seções · M lidas".
- **Navegação (FR-MVP-005):** botões Previous/Next (clamped ao primeiro/último), clique no outline, atalhos, breadcrumb clicável.
- **Progresso (FR-MVP-006):** seção atual, total, %, tempo estimado por seção e restante (baseado em contagem de palavras / velocidade média de leitura).
- **Memória de posição (FR-MVP-007):** última seção por URI em `workspaceState`.
- **Modos:** leitura (S1, coluna serifada máx. 700px centrada) e foco (S5, chrome oculto, barra fina de progresso no topo, nav mínima). Modo apresentação (S6) fica para depois.
- **Ajustes visuais (FR-MVP-013):** tamanho de fonte, largura da coluna, espaçamento entre linhas, tema claro/escuro override. Persistidos na config.
- **Atalhos sugeridos:** abrir leitor (`Ctrl+Alt+M`), próxima/anterior seção (`Alt+Right`/`Alt+Left`), modo foco (`Ctrl+Shift+F11`), focar outline (`Ctrl+Alt+O`). Sobrescrevíveis pelo usuário.

---

## 8. Aparência (tema)

Todo o chrome lê variáveis `--vscode-*` ao vivo (nunca hardcode de cores de chrome), seguindo o handoff. Tipografia: UI em Inter/system-ui; corpo de leitura em Source Serif 4 (15.5px/1.72); código em JetBrains Mono. Tokens semânticos custom `--md-*` (warn/success/info/ai) sempre pareados com ícone/rótulo, nunca cor como único sinal. Ícones via Codicons (`@vscode/codicons`). Respeitar `prefers-reduced-motion`.

O painel de IA aparece no estado "AI off" (S3): explica que leitura/paginação/navegação funcionam sem IA e lista os recursos bloqueados. A estrutura do painel já fica no lugar para o Slice 2.

---

## 9. Requisitos não funcionais (Slice 1)

- **Desempenho:** arquivos até 2MB abrem em <2s em máquina de dev comum; navegação entre seções sem re-render do documento inteiro; parse local.
- **Compatibilidade:** VS Code em Windows/Linux/macOS, versões estáveis recentes; workspaces locais.
- **Acessibilidade:** navegação por teclado, foco visível (`focusBorder`), rótulos ARIA em botões só-ícone, ordem de foco consistente, sem depender de cor.
- **Confiabilidade:** erro de render indica a seção afetada; o leitor funciona integralmente sem IA configurada.

---

## 10. Build, testes e empacotamento

- **Build:** esbuild com dois alvos — bundle da extensão (Node/CJS) e bundle do webview (IIFE). Scripts npm (`build`, `watch`, `package`).
- **Testes:** Vitest para `sectionize()` (casos: sem títulos, nível ausente com fallback, conteúdo antes do 1º título, hierarquia aninhada, line-mapping) e para serialização do contrato de mensagens. Smoke manual do webview (abrir doc real, navegar, render, mermaid, foco).
- **Empacotamento:** `@vscode/vsce package` gera o `.vsix`. Sem publicar — ferramenta interna da fábrica por ora.

---

## 11. Critérios de conclusão do Slice 1

1. Um `.md` abre no leitor via comando e via menu de contexto, em nova aba, sem modificar o arquivo.
2. O documento é dividido em seções pelo nível de paginação escolhido (default `##`, com fallback).
3. O outline reflete corretamente a hierarquia de títulos, com filtro e marca de lido.
4. Navegação (outline/Previous/Next/atalhos/breadcrumb) funciona e é consistente com progresso e status bar.
5. Progresso (seção, %, tempo estimado) é exibido.
6. Memória de posição restaura a última seção por arquivo.
7. Render cobre todos os elementos de FR-MVP-008; code blocks com highlight/label/copiar; links roteados por tipo.
8. Blocos ` ```mermaid ` existentes renderizam via lazy-load; falha de diagrama não quebra a leitura.
9. Modo leitura e modo foco funcionam; ajustes visuais aplicáveis.
10. O leitor funciona 100% sem IA; painel de IA mostra estado "off".
11. `sectionize()` e o contrato de mensagens cobertos por testes de unidade.
12. `.vsix` empacota e instala localmente.
