# Smoke da Slice 2.3 — passo a passo

**Versão sob teste:** MDeepen 0.5.0 (`mdeepen-0.5.0.vsix`)
**Branch:** `feature/slice2.3-chat`
**Documento:** `smoke-2.2.md` — o mesmo da fatia anterior, que já serve: 24 seções,
credenciais falsas na seção 3, e termos com distribuição conhecida.

## Preparação

1. Instale o `mdeepen-0.5.0.vsix`, ou pressione **F5**.
2. **Recarregue a janela.** O `package.json` mudou; sem reload o `Ctrl+Alt+A` não existe.
3. Chave Anthropic real configurada. As checagens 1 a 11 fazem chamada de verdade.
4. Se você já usou o chat neste workspace antes, a porta de consentimento já está
   aberta e a checagem 1 não vai reproduzir. Use uma pasta nova, ou clique em
   **Disconnect** e reconfigure — desconectar revoga o consentimento.

## Numeração das seções

Os chips mostram `§NN` onde NN é a posição da página, contando a introdução como
`§01`. Então a seção **"3. Configuration and credentials"** aparece como **§04**, a
**"19. Runbook — clock skew on one node"** como **§20**, e a **"23. The decision that
governs everything else"** como **§24**.

## Distribuição de termos, medida neste documento

| Termo | Aparece em | Serve para |
| --- | --- | --- |
| `chrony` | 1 de 24 seções (§20) | Provar que o ranking encontra a seção certa |
| `idempotency` | poucas seções | Idem |
| `acquirer` | **16 de 24** (67%) | Provar que o IDF achata o termo ubíquo |
| `settlement` | **16 de 24** (67%) | Idem |

---

## As 16 checagens

### A porta de consentimento

**1.** Com o documento aberto, pergunte **"What is chrony used for?"**
→ O diálogo de confirmação aparece **antes** de qualquer envio, dizendo que responder
uma pergunta manda as seções que o MDeepen considerar relevantes, e que fará isso em
toda pergunta daqui em diante.

**2.** Leia o diálogo.
→ **Não existe** a caixa "Don't ask again". A linha Content diz
`smoke-2.2.md · N selected sections`.

**3.** Clique em Send.
→ A resposta streama, e abaixo dela aparecem chips **"Baseado em"**. O **§20** precisa
estar entre eles — é a única seção que menciona `chrony`.

**4.** Clique no chip §20.
→ O leitor navega para a seção "19. Runbook — clock skew on one node".

**5.** Pergunte outra coisa, por exemplo **"How does idempotency work?"**
→ **Nenhum diálogo.** A porta foi aberta ao enviar a primeira.

### O ranking

**6.** Navegue até uma seção que não tem nada a ver — digamos a **§23** ("22. Capacity
and cost") — e pergunte **"What is chrony used for?"** de novo.
→ A **§23 está entre os chips**, junto com a §20. A seção ativa entra sempre.

**7.** Pergunte **"What does the acquirer send?"**
→ `acquirer` aparece em 16 das 24 seções. Se os chips forem simplesmente §01, §02, §03…
na ordem do documento, o IDF **não** está fazendo o trabalho. O esperado é um punhado
de seções escolhidas pelo termo discriminante (`send`, `file`), não pelo ubíquo.

**8.** Pergunte **"How does MDeepen handle Kubernetes deployments?"** — o documento
nunca menciona Kubernetes.
→ A resposta diz que as seções fornecidas não contêm isso, em vez de inventar. Os chips
trazem só a seção ativa.

### Segredos

**9.** Navegue até a **§04** ("3. Configuration and credentials"), que tem quatro
credenciais falsas, e pergunte qualquer coisa.
→ O diálogo **volta**, mesmo com a porta já aberta, com o aviso de segredo e Mask
pré-marcado. É a única interrupção possível numa conversa.

**10.** Envie mascarado e confirme no breakpoint em
`src/extension/ai/AnthropicProvider.ts:12` (`generate`).
→ Inspecione `request.messages` — **todas** as mensagens redigidas, não só a última.
Se você já tiver histórico contendo o segredo, ele também precisa estar mascarado.

### Histórico

**11.** Faça seis ou sete perguntas seguidas, com respostas longas, e pergunte de novo.
→ Quando o histórico passar do orçamento, o turno traz **"Earlier turns trimmed to fit
(N)"**. Uma conversa que esquece o próprio começo em silêncio seria pior que uma que
avisa.

### Entrada e atalho

**12.** No campo de pergunta: digite e aperte **Enter**; depois digite e aperte
**Shift+Enter**.
→ Enter envia; Shift+Enter quebra linha sem enviar. Durante o streaming o campo fica
desabilitado.

**13.** Do painel de leitura, aperte **Ctrl+Alt+A**. Depois clique num editor normal
de Markdown e aperte de novo.
→ No leitor, foca o campo (e abre o painel se estiver fechado). Fora dele, **nada
acontece** — é o teste do escopo `activeWebviewPanelId`.

### Não regredir

**14.** Rode **Summarize section** e um resumo de documento pelo `⋯`.
→ Ambos funcionam como na 0.4.0, e as entradas aparecem na **mesma** linha do tempo das
perguntas, em ordem cronológica.

**15.** Clique em **Clear all**.
→ Some tudo: respostas de ação e conversa. É o "limpar conversa" do §6.4 da spec.

**16.** Clique em **Disconnect** e navegue pelo documento.
→ Paginação, sumário, marcas de leitura e progresso continuam. O painel oferece
Configure AI. Ao reconfigurar, a **porta do chat volta a perguntar** — desconectar
revoga os dois consentimentos.

---

## Se algo falhar

Anote a checagem, o que aconteceu e o que era esperado. O resultado vai no plano
(`docs/superpowers/plans/2026-08-21-mdeepen-slice2.3-chat.md`, Tarefa 8, Step 6) antes
de fechar a branch — inclusive quando tudo passa.
