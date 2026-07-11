# Especificação do Produto — Markdown Intelligence Reader

## Versão 1 — MVP

**Tipo de produto:** Extensão para Visual Studio Code  
**Objetivo principal:** Facilitar a leitura, a navegação e a compreensão de arquivos Markdown utilizando visualização estruturada e assistência de IA.  
**Nome provisório:** Markdown Intelligence Reader  
**Versão do documento:** 1.0

---

## 1. Visão do produto

O Markdown Intelligence Reader é uma extensão para Visual Studio Code destinada a transformar arquivos Markdown em documentos mais fáceis de navegar, compreender e explorar.

O MVP deve oferecer uma experiência superior ao preview tradicional do VS Code, permitindo:

- dividir o conteúdo em páginas baseadas nas seções do documento;
- navegar por títulos e subtítulos;
- acompanhar o progresso de leitura;
- selecionar trechos e solicitar explicações ou resumos;
- conversar com uma LLM sobre o conteúdo;
- gerar visualizações simples a partir do texto;
- manter as respostas da IA vinculadas às seções utilizadas como fonte.

O foco desta versão é validar o valor central do produto: **ajudar o usuário a compreender documentos Markdown longos ou complexos sem precisar consumi-los de forma estritamente linear**.

---

## 2. Público-alvo

### 2.1 Público primário

- Desenvolvedores de software.
- Arquitetos de software.
- Analistas de sistemas.
- Product Owners.
- Tech Leads.
- Profissionais de DevOps e SRE.
- Estudantes de tecnologia.
- Pessoas que trabalham com documentação técnica em Markdown.

### 2.2 Cenários principais

- Leitura de README extensos.
- Estudo de documentação técnica.
- Compreensão de RFCs, ADRs e propostas arquiteturais.
- Análise de especificações funcionais e técnicas.
- Onboarding em novos projetos.
- Consulta de manuais internos.
- Revisão de requisitos.
- Aprendizado a partir de materiais em Markdown.

---

## 3. Proposta de valor

> Permitir que o usuário navegue, compreenda e explore qualquer arquivo Markdown diretamente no Visual Studio Code, com uma leitura estruturada e auxílio contextual de inteligência artificial.

---

## 4. Objetivos do MVP

1. Tornar arquivos Markdown extensos mais fáceis de navegar.
2. Reduzir o esforço necessário para compreender textos técnicos.
3. Permitir perguntas sobre o conteúdo sem sair do VS Code.
4. Garantir que as respostas da IA tenham referências verificáveis.
5. Transformar trechos selecionados em resumos, explicações e diagramas.
6. Validar a aceitação de uma experiência de leitura paginada por seção.

---

## 5. Escopo funcional

## 5.1 Abertura do leitor inteligente

### FR-MVP-001 — Abrir arquivo no leitor inteligente

A extensão deve adicionar ao menu de contexto de arquivos `.md` a opção:

`Abrir no Markdown Intelligence Reader`

Também deve ser possível executar a abertura pela Command Palette.

### Critérios de aceitação

- A opção deve aparecer para arquivos Markdown.
- O leitor deve abrir em uma nova aba do VS Code.
- O arquivo original não deve ser modificado.
- Alterações no arquivo devem refletir no leitor após atualização automática ou manual.

---

## 5.2 Processamento da estrutura do documento

### FR-MVP-002 — Identificar seções

A extensão deve interpretar os títulos Markdown:

- `#`
- `##`
- `###`
- `####`
- `#####`
- `######`

A hierarquia deve ser utilizada para construir a estrutura de navegação.

### FR-MVP-003 — Configurar nível de paginação

O usuário deve poder selecionar qual nível de título será utilizado para dividir o documento em páginas.

Exemplos:

- Paginar por `#`.
- Paginar por `##`.
- Paginar por `###`.

### Regras

- O nível padrão deve ser `##`.
- Caso o documento não possua títulos no nível escolhido, a extensão deve utilizar o nível mais próximo encontrado.
- Conteúdo anterior ao primeiro título deve ser tratado como uma seção inicial.

---

## 5.3 Navegação por seções

### FR-MVP-004 — Exibir sumário lateral

O leitor deve exibir uma árvore hierárquica contendo os títulos do documento.

### FR-MVP-005 — Navegar entre páginas

O usuário deve poder navegar utilizando:

- botões “Anterior” e “Próxima”;
- clique no sumário lateral;
- atalhos de teclado;
- breadcrumb da seção atual.

### FR-MVP-006 — Exibir progresso de leitura

A interface deve mostrar:

- número da seção atual;
- quantidade total de seções;
- percentual de progresso;
- tempo estimado de leitura da seção;
- tempo estimado de leitura restante.

### FR-MVP-007 — Memorizar posição

A extensão deve memorizar a última seção acessada de cada arquivo.

---

## 5.4 Renderização do Markdown

### FR-MVP-008 — Renderizar conteúdo

O leitor deve suportar, no mínimo:

- títulos;
- parágrafos;
- listas ordenadas e não ordenadas;
- links;
- imagens;
- tabelas;
- citações;
- blocos de código;
- task lists;
- separadores;
- texto em negrito, itálico e tachado.

### FR-MVP-009 — Destacar blocos de código

Blocos de código devem ter:

- syntax highlighting;
- identificação da linguagem;
- botão para copiar;
- rolagem horizontal quando necessário.

### FR-MVP-010 — Abrir links

Links devem poder ser abertos conforme sua natureza:

- links externos no navegador;
- arquivos locais no VS Code;
- âncoras na própria documentação dentro do leitor.

---

## 5.5 Modos de visualização

### FR-MVP-011 — Modo leitura

O modo leitura deve priorizar o conteúdo, com menus reduzidos e largura confortável.

### FR-MVP-012 — Modo foco

O usuário deve poder ocultar:

- sumário lateral;
- painel de IA;
- barra de progresso;
- elementos secundários da interface.

### FR-MVP-013 — Ajustes visuais básicos

O usuário deve poder alterar:

- tamanho da fonte;
- largura da coluna;
- espaçamento entre linhas;
- tema claro ou escuro.

---

## 5.6 Seleção de texto e ações de IA

### FR-MVP-014 — Detectar seleção

Ao selecionar um trecho do documento, a extensão deve apresentar ações contextuais.

### Ações mínimas

- Resumir.
- Explicar.
- Explicar de forma simples.
- Identificar termos importantes.
- Criar exemplo.
- Gerar diagrama Mermaid.
- Fazer uma pergunta sobre a seleção.

### FR-MVP-015 — Exibir resultado sem alterar o arquivo

O resultado da IA deve ser exibido em painel próprio e não deve modificar automaticamente o Markdown original.

### FR-MVP-016 — Copiar resultado

O usuário deve poder copiar qualquer resposta gerada.

---

## 5.7 Resumo com IA

### FR-MVP-017 — Resumir documento

O usuário deve poder solicitar:

- resumo curto;
- resumo executivo;
- resumo técnico;
- lista dos principais pontos.

### FR-MVP-018 — Resumir seção

A extensão deve permitir a geração de resumo da seção atual.

### FR-MVP-019 — Resumir trecho

A extensão deve permitir a geração de resumo do texto selecionado.

---

## 5.8 Chat com o documento

### FR-MVP-020 — Abrir chat contextual

O painel lateral deve permitir que o usuário faça perguntas sobre o documento aberto.

### FR-MVP-021 — Responder com base no documento

A IA deve usar o conteúdo do documento como contexto principal.

### FR-MVP-022 — Exibir referências

Cada resposta deve informar as seções utilizadas.

As referências devem ser clicáveis e navegar para a seção correspondente.

### Exemplo

```text
O sistema utiliza autenticação baseada em JWT e refresh tokens.

Fontes:
- Segurança > Autenticação
- API > Renovação de token
```

### FR-MVP-023 — Limitar contexto

Quando o documento ultrapassar o limite do modelo, a extensão deve:

1. dividir o documento em segmentos;
2. selecionar segmentos relevantes;
3. enviar apenas o contexto necessário;
4. informar que a resposta foi baseada em partes selecionadas do documento.

---

## 5.9 Geração de visualizações

### FR-MVP-024 — Gerar Mermaid a partir de um trecho

O usuário deve poder selecionar um trecho e solicitar um diagrama Mermaid.

Tipos mínimos:

- fluxograma;
- diagrama de sequência;
- mapa mental;
- diagrama de estados.

### FR-MVP-025 — Visualizar diagrama

A extensão deve renderizar o diagrama gerado.

### FR-MVP-026 — Exibir código Mermaid

O usuário deve poder:

- visualizar o código;
- copiar o código;
- editar o código;
- renderizar novamente.

### FR-MVP-027 — Inserir no Markdown mediante confirmação

O código Mermaid somente poderá ser inserido no documento após ação explícita do usuário.

---

## 5.10 Configuração de provedor de IA

### FR-MVP-028 — Configurar provedor

O MVP deve suportar ao menos um provedor remoto e um provedor local.

Sugestão inicial:

- OpenAI ou API compatível com OpenAI;
- Ollama.

### FR-MVP-029 — Configurar modelo

O usuário deve poder informar:

- provedor;
- URL da API;
- modelo;
- chave da API, quando aplicável;
- limite de tokens;
- temperatura.

### FR-MVP-030 — Armazenar credenciais com segurança

As credenciais devem ser armazenadas no `SecretStorage` do VS Code.

Elas não devem ser salvas em:

- arquivo Markdown;
- `settings.json`;
- arquivos do workspace;
- logs da extensão.

---

## 5.11 Privacidade

### FR-MVP-031 — Informar envio de dados

Antes da primeira solicitação para um provedor externo, a extensão deve informar que partes do documento poderão ser enviadas.

### FR-MVP-032 — Confirmar primeiro envio

O primeiro envio para um provedor remoto deve exigir confirmação.

### FR-MVP-033 — Modo local

Quando um provedor local estiver configurado, a interface deve indicar que os dados não serão enviados para um serviço remoto.

---

## 5.12 Histórico de IA

### FR-MVP-034 — Manter histórico da sessão

A extensão deve manter o histórico de perguntas e respostas durante a sessão atual.

### FR-MVP-035 — Limpar histórico

O usuário deve poder limpar o histórico.

O histórico persistente entre sessões não faz parte do MVP.

---

## 6. Interface proposta

A interface do leitor deve ser dividida em três áreas principais:

```text
┌──────────────────┬────────────────────────────────┬──────────────────┐
│ Estrutura        │ Conteúdo da seção              │ Assistente IA    │
│                  │                                │                  │
│ Sumário          │ Markdown renderizado           │ Chat             │
│ hierárquico      │                                │ Ações rápidas    │
│                  │                                │ Respostas        │
├──────────────────┴────────────────────────────────┴──────────────────┤
│ Seção 4 de 18 | 32% lido | 7 minutos restantes                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.1 Barra superior

Deve conter:

- nome do arquivo;
- alternância entre leitura e foco;
- seleção do nível de paginação;
- botão de atualizar;
- botão de configurações;
- indicador do provedor de IA.

### 6.2 Sumário lateral

Deve conter:

- árvore de títulos;
- indicação da seção atual;
- busca textual simples;
- opção de recolher e expandir nós.

### 6.3 Área de conteúdo

Deve conter:

- breadcrumb;
- título da seção;
- conteúdo renderizado;
- ações sobre seleção;
- navegação anterior/próxima.

### 6.4 Painel de IA

Deve conter:

- ações rápidas;
- campo de pergunta;
- respostas;
- referências;
- botão copiar;
- botão limpar conversa.

---

## 7. Atalhos sugeridos

| Ação | Atalho sugerido |
|---|---|
| Abrir leitor | `Ctrl+Alt+M` |
| Próxima seção | `Alt+Right` |
| Seção anterior | `Alt+Left` |
| Abrir chat | `Ctrl+Alt+A` |
| Resumir seção | `Ctrl+Alt+S` |
| Ativar modo foco | `Ctrl+Shift+F11` |
| Focar sumário | `Ctrl+Alt+O` |

Os atalhos devem poder ser sobrescritos pelo usuário.

---

## 8. Requisitos não funcionais

### NFR-MVP-001 — Desempenho

- Arquivos de até 2 MB devem abrir em até 2 segundos em uma máquina de desenvolvimento comum.
- A navegação entre seções deve ocorrer sem recarregar todo o documento.
- O processamento de estrutura deve ocorrer localmente.

### NFR-MVP-002 — Compatibilidade

- Visual Studio Code em Windows, Linux e macOS.
- Suporte às versões estáveis recentes do VS Code.
- Funcionamento em workspaces locais.

### NFR-MVP-003 — Segurança

- Nenhuma chave deve ser registrada em logs.
- Conteúdo não deve ser enviado sem ação do usuário.
- Respostas da IA devem ser tratadas como conteúdo não confiável.
- HTML potencialmente inseguro deve ser sanitizado.

### NFR-MVP-004 — Acessibilidade

- Navegação por teclado.
- Contraste compatível com o tema do VS Code.
- Elementos com rótulos acessíveis.
- Ordem de foco consistente.

### NFR-MVP-005 — Confiabilidade

- Falhas de IA não devem impedir a leitura do documento.
- O leitor deve funcionar sem IA configurada.
- Erros de renderização devem indicar a seção afetada.

---

## 9. Arquitetura sugerida

### 9.1 Componentes

1. **Extension Host**
   - comandos;
   - leitura de arquivos;
   - gerenciamento de configurações;
   - integração com SecretStorage;
   - comunicação com provedores de IA.

2. **Webview**
   - renderização do documento;
   - sumário;
   - paginação;
   - chat;
   - visualização de Mermaid.

3. **Markdown Parser**
   - geração da árvore de títulos;
   - divisão em seções;
   - extração de referências;
   - mapeamento de linhas.

4. **AI Provider Adapter**
   - interface comum para provedores;
   - suporte a streaming;
   - controle de contexto;
   - tratamento de erros.

5. **Context Builder**
   - seleção de seções relevantes;
   - montagem do prompt;
   - associação entre resposta e fonte.

### 9.2 Interfaces conceituais

```typescript
interface AiProvider {
  generate(request: AiRequest): AsyncIterable<AiChunk>;
  testConnection(): Promise<ConnectionResult>;
}

interface DocumentSection {
  id: string;
  title: string;
  level: number;
  startLine: number;
  endLine: number;
  content: string;
  children: DocumentSection[];
}

interface Citation {
  sectionId: string;
  title: string;
  startLine?: number;
  endLine?: number;
}
```

---

## 10. Telemetria opcional

A telemetria deve ser desativada por padrão ou depender de consentimento explícito.

Quando habilitada, poderá coletar somente dados agregados, como:

- abertura do leitor;
- uso da paginação;
- uso de resumo;
- uso do chat;
- tipo de diagrama gerado;
- erros sem conteúdo do documento.

Não devem ser coletados:

- conteúdo do Markdown;
- perguntas;
- respostas;
- chaves;
- nomes de arquivos;
- caminhos locais.

---

## 11. Métricas de sucesso do MVP

- Percentual de usuários que utilizam a paginação.
- Percentual de usuários que utilizam pelo menos uma ação de IA.
- Número médio de perguntas por documento.
- Taxa de respostas com referências acessadas.
- Tempo médio de leitura por sessão.
- Retenção semanal.
- Percentual de usuários que configuram um provedor.
- Avaliação de utilidade dos resumos.
- Quantidade de diagramas gerados.

---

## 12. Fora do escopo do MVP

- Colaboração multiusuário.
- Integração profunda com GitHub.
- Comparação semântica entre versões.
- Validação entre documentação e código.
- Grafo de conhecimento do repositório.
- Busca semântica em múltiplos arquivos.
- Flashcards e quizzes.
- Anotações persistentes.
- Exportação para PDF.
- Suporte a múltiplos documentos simultâneos no chat.
- Índice de qualidade da documentação.
- Processamento vetorial persistente.

---

## 13. Critérios de conclusão do MVP

O MVP será considerado pronto quando:

1. Um arquivo Markdown puder ser aberto no leitor.
2. O documento puder ser dividido e navegado por seções.
3. O sumário refletir corretamente a hierarquia de títulos.
4. O progresso de leitura for exibido.
5. O usuário puder selecionar um trecho e solicitar explicação.
6. O usuário puder resumir documento, seção e seleção.
7. O chat responder com base no documento.
8. As respostas apresentarem referências navegáveis.
9. Um diagrama Mermaid puder ser gerado e visualizado.
10. Pelo menos um provedor remoto e um local puderem ser configurados.
11. As credenciais forem armazenadas com segurança.
12. O leitor continuar funcionando sem uma LLM configurada.
