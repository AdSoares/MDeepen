# Especificação do Produto — Markdown Intelligence Reader

## Versão 2 — Produto Completo

**Tipo de produto:** Extensão para Visual Studio Code  
**Objetivo principal:** Oferecer um ambiente completo para leitura, estudo, análise e transformação de documentos Markdown com suporte de inteligência artificial.  
**Dependência:** Esta versão pressupõe a implementação das funcionalidades definidas na especificação do MVP.  
**Versão do documento:** 1.0

---

## 1. Visão da versão

A versão completa deve evoluir o leitor inteligente para uma plataforma de compreensão documental.

Além da leitura paginada e do chat com IA, o usuário deve poder:

- pesquisar semanticamente;
- gerar glossários;
- criar anotações;
- comparar documentos;
- transformar conteúdo em materiais de estudo;
- analisar a qualidade do documento;
- exportar conteúdo;
- utilizar diferentes perfis de explicação;
- conectar diferentes provedores de IA;
- trabalhar com documentos relacionados no mesmo workspace.

---

## 2. Objetivos

1. Tornar o plugin útil para documentação técnica, estudo, onboarding e revisão.
2. Permitir diferentes formas de explorar o mesmo conteúdo.
3. Ajudar o usuário a identificar lacunas, ambiguidades e inconsistências.
4. Permitir que a compreensão gerada pela IA seja reaproveitada.
5. Oferecer uma experiência segura com provedores locais ou remotos.
6. Apoiar leitura individual e processos de revisão de documentação.

---

## 3. Evoluções da experiência de leitura

## 3.1 Modos adicionais

### FR-FULL-001 — Rolagem contínua

Além da paginação, o usuário deve poder visualizar o documento inteiro em rolagem contínua.

### FR-FULL-002 — Modo apresentação

Cada seção deve poder ser exibida como uma apresentação.

Recursos:

- tela cheia;
- navegação por teclado;
- ocultação de elementos de edição;
- indicador de página;
- notas do apresentador opcionais.

### FR-FULL-003 — Modo revisão

O modo revisão deve destacar:

- comentários;
- trechos alterados;
- problemas de qualidade;
- sugestões da IA;
- pendências.

### FR-FULL-004 — Marcação de progresso

Cada seção deve poder receber um estado:

- não lida;
- lida;
- revisar;
- importante;
- concluída.

O status deve ser persistido por workspace.

---

## 4. Bookmarks e anotações

### FR-FULL-005 — Criar bookmark

O usuário deve poder marcar:

- seção;
- parágrafo;
- tabela;
- bloco de código.

### FR-FULL-006 — Criar anotação

Uma anotação deve conter:

- texto;
- tipo;
- data;
- trecho relacionado;
- posição no arquivo;
- tags opcionais.

### Tipos sugeridos

- Nota.
- Dúvida.
- Correção.
- Ideia.
- Pendência.
- Referência.
- Decisão.

### FR-FULL-007 — Persistir anotações

As anotações devem ser armazenadas em arquivo sidecar, por exemplo:

```text
arquitetura.md
arquitetura.mdnotes.json
```

### FR-FULL-008 — Exportar anotações

O usuário deve poder exportar anotações para:

- Markdown;
- JSON;
- seção adicionada ao documento;
- arquivo separado.

---

## 5. Glossário inteligente

### FR-FULL-009 — Extrair termos

A IA deve identificar:

- siglas;
- termos técnicos;
- conceitos de domínio;
- tecnologias;
- entidades;
- expressões potencialmente desconhecidas.

### FR-FULL-010 — Criar glossário

O glossário deve conter:

- termo;
- definição contextual;
- definição geral;
- primeira ocorrência;
- ocorrências relacionadas;
- termos relacionados;
- nível de complexidade.

### FR-FULL-011 — Exibir definição no hover

Termos reconhecidos devem poder mostrar definição ao passar o mouse.

### FR-FULL-012 — Salvar glossário

O glossário deve poder ser salvo como:

- Markdown;
- JSON;
- arquivo sidecar;
- seção no documento.

---

## 6. Busca avançada

### FR-FULL-013 — Busca textual

A busca textual deve localizar:

- palavras;
- frases;
- títulos;
- blocos de código;
- links.

### FR-FULL-014 — Busca semântica

O usuário deve poder pesquisar por significado.

Exemplos:

- “Onde fala sobre segurança?”
- “Quais trechos descrevem riscos?”
- “Onde são citadas responsabilidades do backend?”
- “Encontre regras relacionadas a autenticação.”

### FR-FULL-015 — Filtros de busca

Filtros disponíveis:

- documento atual;
- seção atual;
- todos os arquivos Markdown do workspace;
- nível de título;
- tipo de conteúdo;
- status de leitura;
- bookmarks;
- anotações.

### FR-FULL-016 — Navegar nos resultados

Cada resultado deve apresentar:

- trecho;
- arquivo;
- seção;
- relevância;
- ação para abrir no leitor.

---

## 7. Personas e níveis de explicação

### FR-FULL-017 — Selecionar perfil de explicação

Perfis mínimos:

- iniciante;
- intermediário;
- especialista;
- desenvolvedor;
- arquiteto;
- Product Owner;
- gestor;
- usuário não técnico.

### FR-FULL-018 — Personalizar persona

O usuário deve poder criar uma persona informando:

- nome;
- nível técnico;
- objetivo;
- formato preferido;
- nível de detalhe;
- linguagem.

### FR-FULL-019 — Aplicar persona

A persona deve poder ser aplicada a:

- chat;
- resumo;
- explicação;
- exemplos;
- visualizações;
- perguntas de estudo.

---

## 8. Transformações de conteúdo

### FR-FULL-020 — Transformar em checklist

A IA deve converter conteúdo em uma lista verificável.

### FR-FULL-021 — Transformar em tabela

A IA deve reorganizar informações comparáveis em tabela.

### FR-FULL-022 — Transformar em requisitos

O usuário deve poder gerar:

- requisitos funcionais;
- requisitos não funcionais;
- regras de negócio;
- critérios de aceitação;
- casos de uso;
- histórias de usuário.

### FR-FULL-023 — Transformar em FAQ

A extensão deve gerar perguntas frequentes baseadas no documento.

### FR-FULL-024 — Transformar em material executivo

A extensão deve gerar:

- resumo executivo;
- briefing;
- one-page;
- lista de decisões;
- lista de riscos;
- plano de ação.

### FR-FULL-025 — Traduzir conteúdo

O usuário deve poder traduzir:

- trecho;
- seção;
- documento;
- resposta da IA.

---

## 9. Geração avançada de visualizações

### FR-FULL-026 — Detectar tipo de visualização

A IA deve sugerir uma visualização conforme o conteúdo.

| Conteúdo | Visualização |
|---|---|
| Etapas | Fluxograma |
| Interações | Diagrama de sequência |
| Componentes | Diagrama de arquitetura |
| Relações | Grafo |
| Estados | Diagrama de estados |
| Cronologia | Linha do tempo |
| Comparações | Tabela |
| Responsabilidades | Matriz RACI |
| Conceitos | Mapa mental |
| Dados | Gráfico |

### FR-FULL-027 — Suportar formatos

- Mermaid.
- PlantUML.
- Graphviz DOT.
- SVG.
- Tabelas Markdown.
- Estruturas JSON intermediárias.

### FR-FULL-028 — Editor visual

A visualização deve possuir:

- código editável;
- preview;
- histórico de revisões da visualização;
- regeneração;
- alteração do tipo;
- exportação.

### FR-FULL-029 — Exportar visualização

Formatos:

- SVG;
- PNG;
- código-fonte;
- Markdown;
- clipboard.

---

## 10. Comparação de documentos

### FR-FULL-030 — Comparar seções

O usuário deve poder selecionar duas seções para comparação.

### FR-FULL-031 — Comparar arquivos

O usuário deve poder comparar dois arquivos Markdown.

### FR-FULL-032 — Comparar versões Git

Quando o arquivo estiver versionado, deve ser possível comparar:

- versão atual e commit anterior;
- versão atual e branch selecionada;
- dois commits;
- conteúdo salvo e conteúdo não salvo.

### FR-FULL-033 — Diff semântico

A IA deve identificar:

- informações adicionadas;
- informações removidas;
- mudanças de significado;
- contradições;
- impactos;
- requisitos afetados;
- termos renomeados.

### FR-FULL-034 — Resumo de mudanças

O resultado deve poder ser exportado como:

- resumo de Pull Request;
- changelog;
- comentário de revisão;
- seção Markdown.

---

## 11. Análise de qualidade

### FR-FULL-035 — Avaliar estrutura

Verificações:

- hierarquia de títulos;
- seções grandes demais;
- seções vazias;
- repetição de títulos;
- ausência de introdução;
- ausência de conclusão.

### FR-FULL-036 — Avaliar clareza

Verificações:

- frases complexas;
- parágrafos longos;
- termos sem definição;
- siglas não explicadas;
- linguagem ambígua;
- instruções incompletas.

### FR-FULL-037 — Avaliar consistência

Verificações:

- nomes usados de formas diferentes;
- requisitos contraditórios;
- valores divergentes;
- conceitos duplicados;
- referências quebradas.

### FR-FULL-038 — Avaliar completude

A IA deve identificar:

- assuntos citados e não explicados;
- etapas ausentes;
- pré-requisitos não definidos;
- responsabilidades sem responsável;
- decisões sem justificativa;
- riscos sem mitigação.

### FR-FULL-039 — Índice de qualidade

O painel deve apresentar notas para:

- clareza;
- estrutura;
- completude;
- consistência;
- legibilidade;
- atualização.

### FR-FULL-040 — Gerar plano de melhoria

A extensão deve ordenar recomendações por:

- severidade;
- impacto;
- esforço;
- seção afetada.

---

## 12. Recursos de estudo

### FR-FULL-041 — Gerar quiz

Configurações:

- seção ou documento;
- quantidade de perguntas;
- dificuldade;
- múltipla escolha ou resposta aberta;
- exibição de justificativa.

### FR-FULL-042 — Gerar flashcards

Cada flashcard deve conter:

- pergunta;
- resposta;
- referência no documento;
- nível de dificuldade;
- status de domínio.

### FR-FULL-043 — Gerar perguntas de revisão

A extensão deve criar perguntas que cubram:

- conceitos;
- relações;
- decisões;
- exemplos;
- riscos;
- aplicação prática.

### FR-FULL-044 — Avaliar resposta

A IA deve avaliar a resposta do usuário e apontar:

- acertos;
- lacunas;
- referência correta;
- sugestão de revisão.

### FR-FULL-045 — Exportar estudo

Formatos:

- Markdown;
- JSON;
- CSV;
- formato compatível com Anki, quando possível.

---

## 13. Documentos relacionados

### FR-FULL-046 — Indexar Markdown do workspace

A extensão deve localizar arquivos `.md` dentro do workspace respeitando exclusões configuradas.

### FR-FULL-047 — Relacionar documentos

A IA deve identificar documentos relacionados por:

- links;
- termos;
- assunto;
- dependências;
- referências cruzadas.

### FR-FULL-048 — Chat com múltiplos documentos

O usuário deve poder selecionar um conjunto de arquivos para usar como base do chat.

### FR-FULL-049 — Exibir origem

Toda resposta deve indicar arquivo, seção e linhas quando disponíveis.

---

## 14. Histórico persistente de IA

### FR-FULL-050 — Persistir conversas

O usuário deve poder salvar conversas por:

- documento;
- workspace;
- assunto.

### FR-FULL-051 — Renomear conversa

Conversas devem possuir:

- título;
- data;
- documentos relacionados;
- provedor;
- modelo.

### FR-FULL-052 — Exportar conversa

Formatos:

- Markdown;
- JSON;
- texto simples.

### FR-FULL-053 — Excluir conversa

A exclusão deve remover os dados locais relacionados.

---

## 15. Múltiplos provedores de IA

### FR-FULL-054 — Provedores suportados

Arquitetura preparada para:

- OpenAI.
- Azure OpenAI.
- Anthropic.
- Google Gemini.
- Ollama.
- LM Studio.
- APIs compatíveis com OpenAI.
- provedores corporativos internos.

### FR-FULL-055 — Modelo por tarefa

O usuário deve poder selecionar modelos diferentes para:

- chat;
- resumo;
- geração de diagramas;
- análise de qualidade;
- embeddings;
- tradução.

### FR-FULL-056 — Estimativa de consumo

Antes da solicitação, a extensão deve poder apresentar:

- tokens estimados;
- custo estimado, quando disponível;
- quantidade de conteúdo enviada;
- provedor e modelo.

### FR-FULL-057 — Limites de uso

Configurações:

- limite diário;
- limite mensal;
- limite por requisição;
- aviso de consumo;
- bloqueio opcional.

---

## 16. Segurança e privacidade avançadas

### FR-FULL-058 — Detecção de dados sensíveis

Antes do envio, a extensão deve detectar possíveis:

- chaves;
- tokens;
- senhas;
- dados pessoais;
- URLs internas;
- segredos em blocos de código.

### FR-FULL-059 — Mascaramento

O usuário deve poder mascarar dados sensíveis antes do envio.

### FR-FULL-060 — Políticas por workspace

Exemplos:

```json
{
  "ai": {
    "allowRemoteProviders": false,
    "allowedProviders": ["ollama"],
    "excludedFiles": ["security.md", "secrets/**"],
    "requireConfirmation": true
  }
}
```

### FR-FULL-061 — Pastas excluídas

A indexação deve respeitar:

- `.gitignore`;
- configurações da extensão;
- arquivos sensíveis conhecidos;
- exclusões do VS Code.

### FR-FULL-062 — Auditoria local

A extensão deve registrar localmente, de forma opcional:

- data;
- provedor;
- modelo;
- arquivo;
- quantidade de tokens;
- ação executada.

O conteúdo enviado não deve ser registrado por padrão.

---

## 17. Exportação

### FR-FULL-063 — Exportar documento enriquecido

O usuário deve poder exportar:

- Markdown com resumos;
- HTML;
- documento para impressão;
- pacote contendo Markdown, diagramas e anotações.

### FR-FULL-064 — Exportar resumo

Formatos:

- Markdown;
- texto;
- HTML;
- clipboard.

### FR-FULL-065 — Gerar relatório de análise

O relatório deve reunir:

- resumo;
- conceitos;
- glossário;
- problemas;
- sugestões;
- visualizações;
- perguntas abertas.

---

## 18. Colaboração básica

### FR-FULL-066 — Comentários locais

Comentários devem poder ser registrados por seção.

### FR-FULL-067 — Menções

Quando o workspace estiver em repositório, comentários podem conter menções textuais.

### FR-FULL-068 — Estados de revisão

Estados:

- rascunho;
- em revisão;
- aprovado;
- obsoleto.

### FR-FULL-069 — Exportar pendências

Pendências podem ser exportadas como:

- checklist;
- arquivo Markdown;
- corpo de issue;
- comentário de Pull Request.

---

## 19. Requisitos não funcionais

### NFR-FULL-001 — Escalabilidade local

- Suportar documentos individuais de até 10 MB.
- Suportar workspaces com pelo menos 5.000 arquivos Markdown.
- Indexação incremental.
- Cache invalidado somente para arquivos alterados.

### NFR-FULL-002 — Extensibilidade

- Provedores de IA implementados por adapters.
- Estratégias de chunking substituíveis.
- Renderizadores de diagramas plugáveis.
- Comandos registrados de forma modular.

### NFR-FULL-003 — Privacidade

- Operação local disponível.
- Consentimento explícito para provedores remotos.
- Exclusão de dados persistidos.
- Política por workspace.

### NFR-FULL-004 — Usabilidade

- Todas as ações principais disponíveis em até dois cliques.
- Feedback visual para processamento.
- Streaming de respostas.
- Cancelamento de requisições.
- Mensagens de erro acionáveis.

### NFR-FULL-005 — Observabilidade

- Logs técnicos locais com níveis configuráveis.
- Nenhum conteúdo sensível em logs.
- diagnóstico exportável pelo usuário.
- métricas internas de desempenho.

---

## 20. Métricas de sucesso

- Retenção mensal.
- Número de documentos analisados por usuário.
- Uso da busca semântica.
- Uso do glossário.
- Uso de comparação.
- Quantidade de anotações.
- Frequência de exportação.
- Redução percebida no tempo de compreensão.
- Avaliação das respostas.
- Taxa de utilização de modelos locais.
- Percentual de problemas de qualidade corrigidos.

---

## 21. Fora do escopo desta versão

- Edição colaborativa em tempo real.
- Backend SaaS obrigatório.
- Sincronização entre dispositivos.
- Marketplace próprio de prompts.
- Validação profunda entre documentação e código.
- Grafo completo de conhecimento do repositório.
- Agentes autônomos alterando documentação.
- Integração corporativa com controle centralizado.
- Automação de Pull Requests.

Esses itens são tratados como diferenciais da versão avançada.

---

## 22. Critérios de conclusão

A versão completa será considerada pronta quando:

1. Todas as funcionalidades do MVP estiverem estáveis.
2. Busca semântica funcionar no documento e no workspace.
3. Glossários puderem ser criados e persistidos.
4. Anotações e bookmarks puderem ser gerenciados.
5. Documentos e versões Git puderem ser comparados semanticamente.
6. A qualidade do documento puder ser avaliada.
7. Quiz e flashcards puderem ser gerados.
8. Diferentes personas de explicação puderem ser configuradas.
9. Múltiplos provedores de IA puderem ser usados.
10. Políticas de segurança por workspace forem respeitadas.
11. Conversas puderem ser persistidas e exportadas.
12. O usuário puder gerar e exportar relatórios enriquecidos.
