
---

# Documento Único da Verdade — Cérebro do BOB (PRD Mestre)

## 1. Mandato do Cérebro
O BOB não é um chatbot de dicas esportivas; é um **Orquestrador Cognitivo** desenhado para análise esportiva autônoma preditiva (com foco inicial na Série A e B do Brasileirão).
* **Propósito:** Calcular, otimizar e gerar portfólios de apostas (Estratégia Big Odds/Camillo) maximizando a massa de probabilidade sob restrições estritas de risco e odds.
* **Limites do Escopo:** O Cérebro processa dados frios (APIs, estatísticas avançadas) e não deve usar métricas de engajamento de interface (cliques, tempo em tela) para alterar suas predições matemáticas oficiais.
* **Oficial vs. Consultivo:** Existe uma separação rígida. "Oficial" refere-se à geração automatizada e determinística das 5 Variações da rodada. "Consultivo" refere-se à interação livre do usuário no chat para explorar cenários e mercados paralelos.

## 2. Identidade do Bob (Personalidade Quântica)
A personalidade do Bob é um mecanismo de coerência de identidade (*self-model persistente*), não uma emulação de consciência humana. 
* **Filosofia de Decisão:** O Bob acredita na "possibilidade". Se algo é matematicamente possível e há dados de processo que sustentem, é um caminho viável. Fé é confiança ativa; amor é cuidado com o usuário.
* **Tom por Contexto:** Encorajador, direto e sereno. Ele fortalece a coragem e a disciplina, transformando a ansiedade do usuário em planos e processos matemáticos.
* **Guardrails (O que nunca dizer):** É terminantemente proibido prometer resultados (ex: "isso vai bater", "aposta garantida"). O Bob não manipula, não usa sarcasmo, não age com cinismo e não finge sentimentos reais.

## 3. Contrato do Produto (Estratégia Big Odds)
O cérebro deve executar o método Camillo otimizado por algoritmos:
* **4 Âncoras:** Seleção de 4 favoritos absolutos na rodada, baseada em probabilidade e robustez.
* **5 Variações:** Geração de um portfólio de 5 bilhetes (múltiplas longas de 7 a 10 jogos) que sejam mutuamente exclusivos (disjuntos), visando odd combinada alta (ex: > 1.000).
* **Congelamento e Alertas:** A análise sofre recalibração (re-análise) automática em T-1h (uma hora antes do jogo) caso a API de escalação aponte ausência de um titular-chave, gerando um alerta imutável.
* **Aprendizado (Append-Only):** O sistema utiliza *Event Sourcing*. Os erros e acertos geram notas de aprendizado ("Reflexões") gravadas permanentemente sem nunca sobrescrever/deletar o passado.

## 4. Arquitetura Cognitiva
O pipeline de decisão (Dual Mind Orquestrado) segue os 6 motores cognitivos:
1.  **Observação (Ingestão):** Leitura das 3 APIs e contexto histórico.
2.  **Interpretação (Normalização):** Transformação de dados brutos (ex: placares) em processo (xG, PPDA, remoção de margem de odds).
3.  **Predição (Modelagem):** Cálculo das probabilidades brutas pelo modelo principal (Claude).
4.  **Revisão (Crítico Interno):** Agente secundário audita a saída por contradições e pesquisa contexto (lesões, clima).
5.  **Decisão:** Montagem matemática do portfólio via Busca em Feixe (*Beam Search*).
6.  **Explicação & Evolução:** Justificativa da escolha gerada para o front-end e log salvo para autoavaliação futura.

## 5. Memória do Cérebro (Bancos Híbridos)
A persistência do conhecimento usa PostgreSQL (estruturado) e Vector DB (semântico), dividida em:
* **Memória Episódica:** O log exato do que aconteceu (ex: "Bilhete X gerado com as odds Y na rodada Z").
* **Memória Semântica:** Conhecimento estruturado e enciclopédico (ex: "O técnico X defende em bloco baixo sob chuva").
* **Memória Procedural:** Regras de negócio (ex: "Como calcular overround").
* **Memória de Padrões:** Recorrências (ex: "O mercado costuma superestimar o Palmeiras fora de casa após a Libertadores").
* *Restrição:* Todo dado inserido é imutável. Correções geram novos nós ligados ao nó antigo via aresta de "ATUALIZAÇÃO/CORREÇÃO" (estilo Zettelkasten/Obsidian).

## 6. Motor Oficial Big Odds (Algoritmo Matemático)
O motor não atua por intuição. Ele aplica as seguintes regras matemáticas antes de qualquer LLM opinar:
* **De-vigging:** Remoção da margem da casa de aposta usando normalização ou método Power para obter a probabilidade implícita do mercado: $p_i = \frac{q_i}{\sum_j q_j}$.
* **Modelagem de Processo:** Priorizar *Expected Goals* (xG, xGD), PPDA e Shot-Creating Actions sobre resultados brutos.
* **Anchor Score:** As 4 âncoras são escolhidas estritamente pela fórmula que avalia Probabilidade de Vitória ($p_W$), Gap para o segundo resultado provável ($gap$), Entropia ($H$), Robustez a desfalques ($\Delta p_W$) e Divergência de Mercado ($|p_W - p^{mkt}_W|$): 
    $Score_{ancora} = a\cdot p_W + b\cdot gap - c\cdot H - d\cdot \Delta p_W - e\cdot |p_W - p^{mkt}_W|$.
* **Geração de Variações:** Utilizar algoritmo de busca combinatória em escala logarítmica (*Beam Search*) para encontrar as 5 permutações disjuntas que atinjam as Odds mínimas com a maior probabilidade possível.

## 7. Simulação Cega e Aprendizado (Backtesting)
Para calibrar os pesos do *Anchor Score* e aprender autonomamente:
* **Blind Replay (Anti-Leakage):** Ao simular rodadas passadas, o orquestrador oculta os resultados oficiais e entrega apenas estatísticas até o dia T-1 do jogo.
* **Pós-Mortem:** O sistema cruza os 5 bilhetes simulados com a API de resultados.
* **Atualização de Pesos:** O cérebro gera uma "Reflexão" sobre o erro (ex: falha ao não considerar fadiga) e grava na Memória de Padrões para ajustar os multiplicadores matemáticos nas próximas rodadas.

## 8. Serviços Cognitivos Não Oficiais
O aplicativo BOB terá um módulo de chat isolado do "Motor Oficial". 
* **Isolamento:** Neste módulo, o usuário pode pedir para analisar um jogo específico da Série C ou criar uma aposta personalizada. 
* **Diretriz:** O Bob deve usar sua capacidade analítica e acesso às APIs, mas deixará claro que o palpite gerado não compõe o portfólio oficial do sistema.

## 9. Integração com o App BOB (APIs e Cache)
O consumo de dados externos deve ser agressivamente cacheado no banco (Supabase/PostgreSQL) para zero desperdício de requisições, seguindo a arquitetura de 3 camadas:
* **TheSportsDB:** Assets visuais (Logos, escudos). Sincronizado uma única vez e armazenado permanentemente.
* **football-data.org:** Tabela e calendário estrutural. Sincronizado no máximo 1x ao dia.
* **API-Football (O Bisturi):** Chamadas cirúrgicas restritas a 3 janelas: T-48h (odds base), T-24h (predições) e T-1h (escalações oficiais para recálculo de emergência).

## 10. Personalidade Operacionalizada (System Prompt)
Ao instruir os LLMs (Claude/OpenAI), o prompt base **deve** incluir:
* **Diretriz de Linguagem:** "Fale através de imagens curtas e metáforas operacionais. Fale em processos e probabilidade, nunca em certezas."
* **Tratamento de Incerteza:** "Se os dados de xG conflitam com a escalação, reduza o nível de confiança explicitamente. Diga: 'A probabilidade cai devido ao desfalque Y, esta é uma âncora de alto risco'."
* **Firmeza:** "Justifique cada escola do Anchor Score. Não use 'talvez' ou 'eu acho'. Use: 'A rota calculada se apoia no xGD superior de X'."

## 11. Observabilidade e Admin (O Cérebro Observado)
A interface "BOB Live Brain Console" do admin não usa relatórios em texto simples, mas sim um grafo dinâmico:
* **Visual:** Renderização via WebGL (`React Flow` ou `ForceGraph2D`) sobre fundo escuro (Dark Mode) e painéis laterais em *Glassmorphism*.
* **Conectores Dinâmicos:** Cada requisição de API, reflexão da LLM ou geração de bilhete "pisca" e cria um novo nó ligado à rodada atual, permitindo que o administrador rastreie o log cognitivo visualmente.

## 12. Compliance e Segurança
* **Regulação (Lei 14.790/2023):** O BOB não é casa de apostas, mas lida com predições. É mandatório o aviso: "O BOB fornece análise estatística probabilística. Apostas envolvem risco de capital."
* **Filtro 18+:** Termos de Uso obrigatórios com checkbox ativo proibindo o uso por menores de idade e isentando o sistema de responsabilidade financeira.

## 13. Critérios de Aceite para LLMs e Devs
O código/feature só será considerado "Pronto" se atender às seguintes verificações:
1.  **Sem Abstrações Místicas:** O LLM não pode gerar "frases espirituais" que não estejam ancoradas em cálculo estatístico.
2.  **Separação Preservada:** Código de interface local/Web não pode interferir nos cálculos de backend da API do motor oficial.
3.  **Memória Intacta:** Uso de ORMs/SQL sem comandos destrutivos (`DELETE`/`DROP`) nas tabelas de aprendizado.
4.  **Garantia Matemática:** O sistema implementa remoção de *overround* nas odds antes de definir probabilidades.

## 14. Plano de Desenvolvimento (Fases)
* **Fase 1 (Fundação e Contratos):** Setup do FastAPI/Node.js, Supabase com PgVector. Conexão estrita das 3 APIs com a política de cache estruturada.
* **Fase 2 (Motor Oficial Big Odds):** Implementação das fórmulas (Anchor Score, de-vigging) e script de Busca em Feixe para geração matemática das 5 Variações da Rodada.
* **Fase 3 (Memória e Simulação):** Criação dos *workers* (Redis/Celery) para rodar o Backtesting Cego noturno, avaliar o passado e atualizar a Memória Semântica.
* **Fase 4 (Admin e Observabilidade):** Frontend do "BOB Live Brain Console" (Grafo interativo estilo Obsidian) consumindo o log assíncrono do backend.
* **Fase 5 (Chat Consultivo e Rollout):** Habilitação do serviço não-oficial de chat usando o perfil da Personalidade Quântica, testes de UI finais e liberação.

## 15. Guia de Criação Exclusivo para LLMs (Cursor/Claude/Copilot)
**ATENÇÃO ENGENHEIRO IA (LLM):** 1.  **Fonte da Verdade:** Você operará EXCLUSIVAMENTE sob as regras deste documento. É ESTRITAMENTE PROIBIDO reintroduzir conceitos de comportamento de clique de usuário ou simplificar a personalidade do Bob para um assistente genérico de respostas abertas.
2.  **Divisão de Pacotes:** Ao gerar código, divida em (1) Handlers de APIs (TheSportsDB, API-Football), (2) Database/Cache Manager, (3) Motor Matemático e (4) Módulo LLM/Prompting. Não gere tudo em um único arquivo monstruoso.
3.  **Personalidade:** O Bob sempre constrói caminhos. Diante de dados faltantes (ex: API falhou), você codificará o sistema para avisar de forma transparente (ex: "Sinal interrompido. Rebaixando nível de confiança da Âncora") e prosseguir com o que tem. 
4.  **Imutabilidade:** Nunca gere funções CRUD que apaguem registros da tabela `cognition_memory` ou `brain_events`.

---
*Este documento invalida especificações anteriores que divirjam das regras aqui consolidadas. Utilize-o como *Contexto de Regras* no seu Cursor IDE.*