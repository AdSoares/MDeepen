# Smoke da Slice 2.4 — passo a passo

**Versão sob teste:** MDeepen 0.6.0 (`mdeepen-0.6.0.vsix`)
**Branch:** `feature/slice2.4-diagrams`
**Documento:** `smoke-2.4.md` — **descartável**. Esta é a primeira release que escreve
no arquivo, e o smoke vai inserir diagramas nele, renomear um título e duplicar outro.

## Preparação

1. Instale o `mdeepen-0.6.0.vsix`, ou pressione **F5**.
2. **Recarregue a janela.**
3. Chave Anthropic real configurada.
4. Abra o `smoke-2.4.md` no leitor. Cada seção foi escrita com um diagrama óbvio dentro:
   a §03 pede sequência, a §04 pede máquina de estados, a §05 pede fluxograma, a §07 pede
   mapa mental.

> A numeração `§NN` conta a introdução como `§01`, então "2. The happy path" aparece como
> **§03**.

---

## As 16 checagens

### Gerar

**1.** Selecione dois parágrafos da seção "2. The happy path" e escolha **Diagram** no
menu `⋯` da toolbar flutuante.
→ O painel abre mostrando quatro botões de tipo e a seleção fica guardada.

**2.** Clique em **Cancel**.
→ Os botões somem e **nada foi enviado** — nenhuma chamada, nenhum diálogo.

**3.** Selecione de novo, escolha **Diagram**, e agora **Sequence diagram**.
→ O diagrama renderiza no painel, com a fonte Mermaid num campo editável abaixo.

**4.** Repita na mesma seleção com os quatro tipos.
→ Quatro diagramas visivelmente diferentes; o cabeçalho de cada entrada nomeia o tipo.

### Editar

**5.** Edite a fonte no campo — troque `flowchart TD` por `flowchart LR`, por exemplo.
→ O preview **re-renderiza enquanto você digita**, sem nenhuma chamada de rede.

**6.** Quebre a sintaxe de propósito: apague a primeira linha.
→ Aparece a faixa de erro do renderizador e a fonte **continua editável**. Desfaça e ele
volta a renderizar.

**7.** Clique em **Copy**.
→ O que vai para a área de transferência é a fonte Mermaid **sem cerca** — sem
` ```mermaid `.

### Escrever

**8.** Gere um diagrama a partir da seção "4. Deployment pipeline" e clique em
**Insert at the end of §05 4. Deployment pipeline**.
→ O bloco aparece no arquivo no fim daquela seção, cercado corretamente, e a entrada
passa a dizer **"Inserted at line N"**.

**9.** Abra o `smoke-2.4.md` num editor e aperte **Ctrl+Z** uma vez.
→ O bloco inteiro some **num único desfazer**. Se sumir em pedaços, o `WorkspaceEdit`
não está único.

**10.** Refaça (Ctrl+Y) e olhe o leitor.
→ A seção agora renderiza o diagrama inline, como qualquer outro bloco Mermaid do
documento. É o mesmo motor de renderização dos dois lados.

### A propriedade de segurança — as três que importam

**11.** Gere um diagrama a partir da seção **"8. A section to push down"** mas **não
insira ainda**. Num editor, adicione um `## 0. Nova seção` **acima** dela. Volte ao
painel e clique em Insert.
→ **Sucesso**, e no lugar certo: no fim da seção "8. A section to push down", não na
linha que ela ocupava antes. Isto é o teste positivo da relocalização — ela sobrevive ao
documento se mexer.

**12.** Gere um diagrama a partir da seção **"9. A section to rename"**. Num editor,
renomeie o título para `## 9. Renamed`. Clique em Insert.
→ **Recusa**, dizendo que a seção não está mais no documento e que o leitor deve ser
atualizado. **Nada é escrito.**

**13.** Gere um diagrama a partir de **"7. A section to duplicate"**. Num editor, copie
esse título e cole-o mais abaixo no arquivo, criando dois idênticos. Clique em Insert.
→ **Recusa por ambiguidade.** Nada é escrito.

> As checagens 12 e 13 são a fatia inteira num teste cada. Se qualquer uma **inserir**
> em vez de recusar, ela inseriu no lugar errado — e num arquivo real isso é o pior
> defeito que este produto pode ter.

### Não regredir

**14.** Delete uma entrada de diagrama, depois clique em **Clear all**.
→ O rascunho some; a linha do tempo esvazia junto com respostas e conversa.

**15.** Selecione um trecho da seção **"5. Configuration"**, que tem as credenciais
falsas, e gere um diagrama.
→ O diálogo de segredo aparece normalmente. Uma ação de diagrama é uma ação de seleção —
mesma porta, mesma detecção, mesmo mascaramento.

**16.** Clique em **Disconnect** e navegue pelo documento.
→ Tudo continua funcionando; o painel oferece Configure AI.

---

## Se algo falhar

Anote a checagem, o que aconteceu e o que era esperado. O resultado vai no plano
(`docs/superpowers/plans/2026-08-21-mdeepen-slice2.4-diagrams.md`, Tarefa 8, Step 6)
antes de fechar a branch — inclusive quando tudo passa.
