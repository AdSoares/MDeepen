# Especificação do Produto — Markdown Intelligence Reader

## Versão 3 — Avançada e Diferenciais Competitivos

**Tipo de produto:** Extensão inteligente para Visual Studio Code  
**Objetivo principal:** Transformar documentação Markdown em uma camada viva de conhecimento, conectada ao código, ao Git, à arquitetura e aos processos de desenvolvimento.  
**Dependência:** Esta versão pressupõe as funcionalidades do MVP e da versão completa.  
**Versão do documento:** 1.0

---

## 1. Visão estratégica

A versão avançada deve posicionar o produto além de um leitor de Markdown com IA.

O plugin deverá funcionar como uma plataforma de inteligência documental capaz de:

- validar documentação contra código-fonte;
- medir desatualização;
- construir grafos de conhecimento;
- analisar Pull Requests;
- sugerir atualizações;
- criar trilhas de aprendizado;
- aplicar políticas corporativas;
- executar automações controladas;
- auxiliar equipes a manter a documentação confiável.

A proposta central passa a ser:

> Transformar documentação estática em conhecimento verificável, navegável, contextual e continuamente conectado ao software real.

---

## 2. Diferenciais principais

1. **Respostas com evidências navegáveis.**
2. **Validação entre documentação e código.**
3. **Índice de desatualização documental.**
4. **Grafo de conhecimento do workspace.**
5. **Diff semântico entre commits e documentos.**
6. **Trilhas de aprendizado adaptativas.**
7. **Agentes controlados para manutenção documental.**
8. **Políticas corporativas de IA e privacidade.**
9. **Mapeamento entre requisitos, código e testes.**
10. **Detecção automática de impacto documental em Pull Requests.**

---

## 3. Validação entre documentação e código

### FR-ADV-001 — Resolver referências de código

A extensão deve identificar menções a:

- arquivos;
- classes;
- interfaces;
- métodos;
- funções;
- namespaces;
- pacotes;
- endpoints;
- eventos;
- tabelas;
- variáveis de ambiente;
- scripts;
- comandos;
- componentes de infraestrutura.

### FR-ADV-002 — Verificar existência

Cada referência deve receber um status:

- encontrada;
- não encontrada;
- ambígua;
- renomeada;
- possivelmente obsoleta.

### FR-ADV-003 — Navegar para implementação

Referências encontradas devem abrir o arquivo ou símbolo correspondente.

### FR-ADV-004 — Detectar divergências

Exemplos:

- endpoint documentado diferente do código;
- parâmetro ausente;
- classe renomeada;
- variável de ambiente removida;
- processo descrito diferente da implementação;
- comando de instalação inválido;
- versão de dependência desatualizada.

### FR-ADV-005 — Exibir evidências

Toda divergência deve apresentar:

- trecho documental;
- trecho de código;
- localização;
- nível de confiança;
- explicação;
- sugestão de correção.

---

## 4. Índice de desatualização documental

### FR-ADV-006 — Calcular índice de atualização

A extensão deve calcular uma pontuação baseada em:

- tempo desde a última alteração;
- mudanças no código relacionado;
- referências quebradas;
- símbolos renomeados;
- divergências detectadas;
- mudanças de API;
- alterações em configurações;
- feedback de revisores.

### FR-ADV-007 — Classificar documento

Estados sugeridos:

- atualizado;
- atenção;
- provavelmente desatualizado;
- crítico;
- não verificado.

### FR-ADV-008 — Explicar pontuação

O painel deve mostrar os fatores que impactaram a nota.

### FR-ADV-009 — Priorizar correções

A extensão deve recomendar quais seções revisar primeiro.

---

## 5. Rastreabilidade

### FR-ADV-010 — Mapear requisitos

A extensão deve reconhecer requisitos identificados por:

- código explícito;
- títulos;
- listas;
- histórias;
- critérios de aceitação;
- regras de negócio.

### FR-ADV-011 — Relacionar requisito a código

O usuário deve poder relacionar requisitos a:

- arquivos;
- símbolos;
- commits;
- Pull Requests;
- testes;
- issues.

### FR-ADV-012 — Matriz de rastreabilidade

A matriz deve apresentar:

| Requisito | Implementação | Testes | Documentação | Status |
|---|---|---|---|---|

### FR-ADV-013 — Identificar requisitos sem cobertura

A extensão deve detectar:

- requisito sem implementação;
- implementação sem documentação;
- requisito sem teste;
- teste sem requisito associado;
- documentação sem evidência de implementação.

---

## 6. Integração avançada com Git

### FR-ADV-014 — Histórico semântico

A extensão deve resumir a evolução de cada seção ao longo do Git.

### FR-ADV-015 — Explicar alterações

Para cada mudança, a IA deve explicar:

- o que mudou;
- por que pode ter mudado;
- impacto;
- risco;
- partes relacionadas.

### FR-ADV-016 — Analisar Pull Request

Dado um conjunto de alterações, a extensão deve identificar:

- documentos que precisam ser atualizados;
- seções afetadas;
- diagramas possivelmente desatualizados;
- requisitos impactados;
- changelog necessário.

### FR-ADV-017 — Gerar atualização sugerida

A extensão deve gerar patch documental para revisão.

O patch nunca deve ser aplicado sem confirmação explícita.

### FR-ADV-018 — Gerar resumo documental de PR

Saídas:

- resumo para revisores;
- checklist de documentação;
- riscos;
- arquivos afetados;
- recomendações.

---

## 7. Grafo de conhecimento do workspace

### FR-ADV-019 — Extrair entidades

Entidades possíveis:

- pessoas;
- equipes;
- sistemas;
- serviços;
- APIs;
- bancos;
- eventos;
- requisitos;
- decisões;
- riscos;
- tecnologias;
- ambientes;
- conceitos de domínio.

### FR-ADV-020 — Extrair relações

Relações possíveis:

- depende de;
- comunica com;
- implementa;
- substitui;
- pertence a;
- produz;
- consome;
- protege;
- valida;
- documenta;
- testa.

### FR-ADV-021 — Visualizar grafo

A visualização deve permitir:

- zoom;
- filtros;
- pesquisa;
- expansão;
- agrupamento;
- navegação para origem;
- coloração por tipo;
- ocultação de entidades.

### FR-ADV-022 — Consultar grafo

Exemplos:

- “Quais serviços dependem do Redis?”
- “Onde o evento PedidoCriado é produzido?”
- “Quais requisitos não possuem testes?”
- “Quais documentos mencionam autenticação?”

### FR-ADV-023 — Atualizar incrementalmente

O grafo deve ser atualizado apenas para arquivos alterados.

---

## 8. Assistente de arquitetura

### FR-ADV-024 — Identificar arquitetura

A extensão deve reconhecer padrões como:

- monólito;
- microserviços;
- arquitetura em camadas;
- Clean Architecture;
- Event-Driven;
- CQRS;
- Hexagonal;
- Serverless.

### FR-ADV-025 — Gerar visão C4

A IA deve gerar:

- contexto;
- containers;
- componentes;
- relações principais.

### FR-ADV-026 — Validar coerência

A extensão deve comparar:

- arquitetura descrita;
- estrutura do workspace;
- dependências;
- comunicação entre componentes.

### FR-ADV-027 — Detectar riscos arquiteturais

Exemplos:

- acoplamento excessivo;
- dependência circular;
- componente sem documentação;
- integração sem contrato;
- fluxo crítico não documentado.

---

## 9. Trilhas de aprendizagem adaptativas

### FR-ADV-028 — Diagnosticar conhecimento

O usuário poderá responder a perguntas iniciais para indicar seu nível.

### FR-ADV-029 — Criar trilha

A trilha deve considerar:

- conhecimento atual;
- objetivo;
- documentos selecionados;
- tempo disponível;
- dificuldade.

### FR-ADV-030 — Acompanhar domínio

Conceitos devem receber estados:

- desconhecido;
- estudando;
- compreendido;
- revisar;
- dominado.

### FR-ADV-031 — Repetição espaçada

O plugin deve sugerir revisões conforme desempenho e tempo decorrido.

### FR-ADV-032 — Recomendar ordem de leitura

A IA deve ordenar seções conforme dependências conceituais.

---

## 10. Leitura adaptativa

### FR-ADV-033 — Detectar dificuldade

Sinais:

- perguntas repetidas;
- tempo elevado em uma seção;
- respostas incorretas;
- termos consultados;
- bookmarks;
- revisões frequentes.

### FR-ADV-034 — Adaptar explicação

A extensão pode:

- simplificar;
- acrescentar exemplos;
- gerar analogias;
- mostrar pré-requisitos;
- sugerir outra seção;
- gerar um diagrama.

### FR-ADV-035 — Perfil de aprendizagem

O perfil deve permanecer local e permitir exclusão.

---

## 11. Agentes de manutenção documental

### FR-ADV-036 — Agente de revisão

Responsabilidades:

- encontrar inconsistências;
- propor correções;
- gerar relatório;
- não aplicar alterações sem confirmação.

### FR-ADV-037 — Agente de atualização

Responsabilidades:

- analisar mudanças do Git;
- localizar documentos afetados;
- gerar patches;
- criar checklist de revisão.

### FR-ADV-038 — Agente de qualidade

Responsabilidades:

- executar regras configuradas;
- classificar problemas;
- gerar métricas;
- acompanhar evolução.

### FR-ADV-039 — Limites de atuação

Todo agente deve possuir:

- escopo explícito;
- arquivos permitidos;
- arquivos bloqueados;
- limite de custo;
- limite de alterações;
- modo somente leitura;
- log de ações;
- aprovação humana.

---

## 12. Automação de documentação

### FR-ADV-040 — Regras automatizadas

Exemplos:

- ao alterar uma API, revisar seção correspondente;
- ao adicionar variável de ambiente, verificar README;
- ao alterar arquitetura, revisar diagramas;
- ao criar serviço, sugerir documentação mínima;
- ao concluir PR, gerar changelog.

### FR-ADV-041 — Gatilhos

- comando manual;
- salvamento;
- commit;
- troca de branch;
- abertura de Pull Request;
- execução de pipeline;
- agenda local.

### FR-ADV-042 — Modo sugestão

O modo padrão deve apenas sugerir ações.

### FR-ADV-043 — Modo aplicação controlada

A aplicação automática somente pode ocorrer em arquivos e operações explicitamente autorizados.

---

## 13. Integrações corporativas

### FR-ADV-044 — Configuração central

Organizações devem poder distribuir:

- provedores permitidos;
- modelos permitidos;
- limites;
- políticas;
- prompts;
- arquivos excluídos;
- requisitos de auditoria.

### FR-ADV-045 — Provedores corporativos

Suporte a endpoints internos e gateways corporativos.

### FR-ADV-046 — Catálogo de prompts

A organização poderá publicar prompts aprovados para:

- segurança;
- arquitetura;
- revisão;
- requisitos;
- compliance;
- onboarding.

### FR-ADV-047 — Auditoria corporativa

Quando habilitada pela organização e informada ao usuário, registrar:

- ação;
- horário;
- provedor;
- modelo;
- projeto;
- volume;
- resultado operacional.

Conteúdo integral não deve ser armazenado sem política explícita.

---

## 14. Avaliação e confiança das respostas

### FR-ADV-048 — Nível de confiança

A resposta deve apresentar:

- confiança alta, média ou baixa;
- quantidade de fontes;
- cobertura do contexto;
- possíveis limitações.

### FR-ADV-049 — Verificação cruzada

A extensão deve poder comparar a resposta com:

- documento;
- código;
- outros documentos;
- testes;
- histórico Git.

### FR-ADV-050 — Detectar afirmações sem fonte

Trechos não sustentados pelo conteúdo devem ser marcados.

### FR-ADV-051 — Solicitar verificação

O usuário deve poder pedir que a IA revise e corrija uma resposta anterior.

---

## 15. Marketplace de extensões e templates

### FR-ADV-052 — Templates de análise

Exemplos:

- RFC.
- ADR.
- README.
- Runbook.
- Postmortem.
- Especificação funcional.
- Documentação de API.
- Manual de operação.

### FR-ADV-053 — Regras por tipo de documento

Cada template pode definir:

- estrutura esperada;
- seções obrigatórias;
- perguntas;
- métricas;
- verificações;
- visualizações.

### FR-ADV-054 — Pacotes locais

Templates e regras devem poder ser instalados por arquivo ou repositório.

---

## 16. APIs internas e extensibilidade

### FR-ADV-055 — API de extensão

Outras extensões devem poder:

- abrir documento no leitor;
- solicitar análise;
- registrar ação contextual;
- fornecer entidades;
- adicionar verificações;
- integrar provedores.

### FR-ADV-056 — Eventos

Eventos sugeridos:

- documento aberto;
- seção alterada;
- análise concluída;
- problema detectado;
- patch gerado;
- política bloqueada.

### FR-ADV-057 — CLI opcional

Uma CLI complementar poderá executar:

- análise de qualidade;
- verificação documentação-código;
- geração de relatório;
- validação em CI.

---

## 17. Uso em CI/CD

### FR-ADV-058 — Análise automatizada

A CLI deve poder analisar Markdown em pipeline.

### FR-ADV-059 — Regras de bloqueio

Exemplos:

- links quebrados;
- referências inexistentes;
- índice de qualidade abaixo do mínimo;
- requisito crítico sem teste;
- documentação afetada não atualizada.

### FR-ADV-060 — Relatório SARIF ou equivalente

Problemas devem poder ser publicados em ferramentas de revisão.

### FR-ADV-061 — Comentário em Pull Request

A integração deve publicar resumo e recomendações, quando configurada.

---

## 18. Painel de saúde documental

### FR-ADV-062 — Visão do workspace

Indicadores:

- quantidade de documentos;
- documentos desatualizados;
- links quebrados;
- referências inválidas;
- requisitos sem cobertura;
- diagramas obsoletos;
- seções sem responsável;
- problemas por severidade.

### FR-ADV-063 — Tendência

O painel deve mostrar evolução ao longo do tempo.

### FR-ADV-064 — Priorização

A extensão deve recomendar uma fila de melhoria documental.

---

## 19. Segurança avançada

### FR-ADV-065 — Classificação de dados

Arquivos podem ser classificados como:

- público;
- interno;
- confidencial;
- restrito.

### FR-ADV-066 — Política por classificação

Exemplo:

- público: qualquer provedor aprovado;
- interno: provedores corporativos;
- confidencial: somente modelos locais;
- restrito: IA desabilitada.

### FR-ADV-067 — Redação automática

Dados sensíveis podem ser removidos ou substituídos antes do envio.

### FR-ADV-068 — Confirmação com preview

Antes do envio, o usuário deve poder visualizar exatamente o conteúdo que será transmitido.

---

## 20. Requisitos não funcionais avançados

### NFR-ADV-001 — Escala

- Workspaces com dezenas de milhares de arquivos.
- Indexação incremental e cancelável.
- Persistência local eficiente.
- Operações em background sem bloquear o editor.

### NFR-ADV-002 — Confiabilidade

- Resultados devem incluir evidências.
- Análises devem informar limitações.
- Patches devem ser reversíveis.
- Falhas parciais não devem invalidar toda a análise.

### NFR-ADV-003 — Segurança

- Princípio do menor privilégio.
- Consentimento por operação sensível.
- Segredos no SecretStorage.
- Sanitização de Webview.
- Política de conteúdo não confiável.
- Proteção contra prompt injection presente em documentos.

### NFR-ADV-004 — Governança

- Configurações versionáveis.
- Políticas organizacionais.
- Logs auditáveis.
- capacidade de desabilitar funcionalidades.

### NFR-ADV-005 — Explicabilidade

Toda recomendação deve apresentar:

- origem;
- regra aplicada;
- evidência;
- confiança;
- impacto;
- ação sugerida.

---

## 21. Métricas estratégicas

- Percentual de documentos atualizados após alertas.
- Redução de divergências documentação-código.
- Quantidade de PRs com documentação corretamente atualizada.
- Cobertura de requisitos.
- Cobertura de testes vinculados.
- Tempo de onboarding.
- Tempo para localizar informação.
- Quantidade de problemas prevenidos.
- Adoção de políticas corporativas.
- Custo médio de IA por análise.
- Uso de modelos locais.
- Precisão das referências resolvidas.

---

## 22. Riscos

### 22.1 Riscos técnicos

- Alto custo de indexação.
- Falsos positivos na relação documentação-código.
- Limites de contexto.
- Diferenças entre linguagens.
- APIs de IA instáveis.
- renderização complexa em Webview.

### 22.2 Riscos de produto

- Excesso de funcionalidades.
- Interface poluída.
- Confiança excessiva na IA.
- Curva de configuração.
- preocupações de privacidade.

### 22.3 Mitigações

- Funcionalidades modulares.
- Modos de interface.
- Evidências obrigatórias.
- Operação local.
- políticas claras.
- aprovação humana.
- nível de confiança.
- análise incremental.

---

## 23. Fora do escopo inicial da versão avançada

- Edição simultânea em tempo real.
- Substituição completa de plataformas de documentação.
- Treinamento de modelos proprietários dentro da extensão.
- Aplicação irrestrita de alterações por agentes.
- armazenamento central obrigatório.
- envio automático de código para serviços externos sem consentimento.

---

## 24. Critérios de conclusão

A versão avançada será considerada pronta quando:

1. Referências documentais puderem ser relacionadas a código.
2. Divergências relevantes forem detectadas com evidências.
3. O índice de desatualização puder ser calculado.
4. Pull Requests puderem ser analisados quanto a impacto documental.
5. Um grafo de conhecimento navegável puder ser gerado.
6. Requisitos, implementação e testes puderem ser relacionados.
7. Trilhas de aprendizagem adaptativas estiverem disponíveis.
8. Agentes operarem com escopo, limites e aprovação.
9. Políticas corporativas puderem ser aplicadas.
10. A CLI puder executar verificações em CI.
11. O painel de saúde documental mostrar indicadores do workspace.
12. Respostas e recomendações apresentarem nível de confiança e evidências.
