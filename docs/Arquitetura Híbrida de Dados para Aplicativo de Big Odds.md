# Arquitetura Híbrida de Dados para Aplicativo de Big Odds

Este documento técnico detalha uma **Arquitetura Híbrida de Dados** projetada para um aplicativo de apostas focado em "Big Odds" no Campeonato Brasileiro. A estratégia visa maximizar a cobertura de dados, integrar informações históricas e em tempo real, e otimizar o uso de APIs gratuitas para garantir robustez e escalabilidade.

## 1. Princípios da Arquitetura Híbrida

A arquitetura proposta combina múltiplas fontes de dados (APIs gratuitas) com um sistema de persistência local. Isso permite:
*   **Cobertura Abrangente:** Utilizar o melhor de cada API para diferentes tipos de dados.
*   **Redução de Custos:** Minimizar a dependência de planos pagos, gerenciando limites de requisição de forma inteligente.
*   **Desempenho Otimizado:** Acessar dados históricos localmente, reduzindo latência e carga nas APIs externas.
*   **Robustez:** Mitigar falhas de uma única API, tendo fontes alternativas para dados críticos.

## 2. Integração de APIs: Fontes de Dados

Utilizaremos as seguintes APIs gratuitas, cada uma com um papel específico na coleta de dados:

### A. football-data.org: Dados Históricos e Estruturais

Esta API será a principal fonte para dados históricos e estruturais devido ao seu limite de **10 requisições por minuto**, mais adequado para extração em massa e menos propenso a esgotar rapidamente durante o desenvolvimento e manutenção.

| Tipo de Dado | Uso na Estratégia | Justificativa |
| :--- | :--- | :--- |
| **Fixtures e Resultados** | Construção de histórico de confrontos, análise de desempenho de times ao longo das temporadas. | Essencial para o cálculo de xG e xP históricos, e para identificar padrões de "âncoras". |
| **Tabelas de Liga** | Acompanhamento da classificação, forma dos times e motivação (zona de rebaixamento, G4). | Ajuda a refinar a seleção de "âncoras" e a aplicar filtros de motivação. |
| **Estatísticas Básicas** | Análise de desempenho geral de times e jogadores (gols marcados/sofridos). | Complementa a análise de xG e xP, fornecendo uma visão macro. |

**Estratégia de Uso:**
*   **Coleta Inicial:** Realizar uma coleta massiva de dados históricos de temporadas passadas do Brasileirão (Série A) e outras ligas relevantes.
*   **Atualização Diária/Semanal:** Agendar requisições para atualizar fixtures e resultados de jogos já ocorridos, mantendo o banco de dados local sempre atualizado.
*   **Cache:** Implementar um sistema de cache robusto para evitar requisições repetidas para os mesmos dados.

### B. API-Football (api-sports.io): Odds e Dados em Tempo Real

Esta API será crucial para obter **Odds (pré-jogo e in-play)** e **dados em tempo real**, apesar do limite de **100 requisições por dia**. Sua riqueza de dados em tempo real e a inclusão de Odds no plano gratuito a tornam indispensável.

| Tipo de Dado | Uso na Estratégia | Justificativa |
| :--- | :--- | :--- |
| **Odds (Pré-jogo)** | Identificação de "Big Odds", cálculo de valor (Value Bet) e comparação com probabilidades algorítmicas. | O coração da estratégia de "Big Odds", permitindo a criação de bilhetes com base em cotações reais. |
| **Odds (In-play)** | Potencial para cash-out estratégico e ajustes de bilhetes em tempo real (futura funcionalidade). | Oferece flexibilidade para gerenciar apostas ativas. |
| **Livescore e Eventos** | Monitoramento de jogos em andamento, atualizações de placar, cartões, substituições. | Essencial para a experiência do usuário e para o cash-out estratégico. |
| **Estatísticas Avançadas** | Dados de xG, chutes, posse de bola, etc., para análise pré-jogo e in-play. | Permite refinar os modelos algorítmicos de previsão e validação de "âncoras". |
| **Previsões (Predictions)** | Utilizar como um ponto de dados adicional para validar ou questionar as próprias análises algorítmicas. | Serve como um "segundo algoritmo" para comparação e ajuste de confiança.

**Estratégia de Uso:**
*   **Requisições Pontuais:** Focar as requisições nas Odds dos jogos da próxima rodada do Brasileirão, idealmente uma vez por dia ou poucas horas antes dos jogos.
*   **Webhooks/Polling Otimizado:** Para dados em tempo real (livescore, in-play odds), utilizar um mecanismo de polling com intervalos maiores ou, se disponível, webhooks para receber atualizações sem gastar requisições desnecessárias.
*   **Priorização:** Priorizar a coleta de Odds e Livescore, que são os dados mais voláteis e críticos para a estratégia.

### C. TheSportsDB: Assets Visuais e Dados Complementares

Esta API será utilizada para enriquecer a experiência do usuário com dados visuais e informações complementares.

| Tipo de Dado | Uso na Estratégia | Justificativa |
| :--- | :--- | :--- |
| **Logos de Times/Ligas** | Interface do usuário (UI) mais rica e profissional. | Melhora a usabilidade e a estética do aplicativo. |
| **Banners/Imagens** | Conteúdo visual para perfis de times ou ligas. | Adiciona contexto e engajamento visual.

**Estratégia de Uso:**
*   **Coleta Única:** A maioria dos assets visuais pode ser coletada uma única vez e armazenada localmente, pois não mudam com frequência.
*   **Fallback:** Utilizar como fonte secundária para dados básicos de fixtures e resultados, caso as outras APIs falhem.

## 3. Diagrama da Arquitetura Híbrida

![Diagrama da Arquitetura Híbrida](https://private-us-east-1.manuscdn.com/sessionFile/cbKG5iNGPeYauSjj6CjDaY/sandbox/K0XkHrKyUxI7zNqRJXaZJ3-images_1775449116551_na1fn_L2hvbWUvdWJ1bnR1L2FycXVpdGV0dXJhX2hpYnJpZGFfZGFkb3M.png?Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvY2JLRzVpTkdQZVlhdVNqajZDakRhWS9zYW5kYm94L0swWGtIckt5VXhJN3pOcVJKWGFaSjMtaW1hZ2VzXzE3NzU0NDkxMTY1NTFfbmExZm5fTDJodmJXVXZkV0oxYm5SMUwyRnljWFZwZEdWMGRYSmhYMmhwWW5KcFpHRmZaR0ZrYjNNLnBuZyIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=lHzUDjg-cRjfNx9IlfJ3CTwFnwLM~9p1bT6CnJ1kWqt6mnnqztBQ2fUP8lbODXQaFmRHK4vHGps~XiU~E~hGCQbZwnk0mReZt8fu5rtNJCsMolfeyPC0JKOU4vP-K50DRIMeO86250OGwdC6BivvQnTz7kB4ZZE~rjqpX56Dam5DqOpas4kWhPsSiOtTGhOKyG5OB2h5jb7Nuzp~sRaCDZ7uI3omZ7tChvobpjO3TfAv~75Us-QwbIdUdTfdvePDrDC3AkiXWXB3LJOyXKid9xzvnmnY6cxu0tGF2uZ3C~dhADvSegg1lTQlS1SbGegjCejtCFxEiZIqsudhvIF6PA__)

```d2
data_sources: { 
  shape: cloud
  football_data_org: { label: "football-data.org\n(Histórico/Estrutural)" }
  api_football: { label: "API-Football\n(Odds/Tempo Real)" }
  the_sports_db: { label: "TheSportsDB\n(Assets Visuais)" }
}

app_backend: { 
  shape: cylinder
  label: "Backend do Aplicativo\n(Servidor/Funções Serverless)"
  db: { label: "Banco de Dados Local\n(PostgreSQL/MongoDB)" }
  cache: { label: "Sistema de Cache\n(Redis)" }
}

app_frontend: { 
  shape: rectangle
  label: "Frontend do Aplicativo\n(Web/Mobile)"
}

data_sources.football_data_org -> app_backend.db: { label: "Dados Históricos\n(Atualização Diária)" }
data_sources.api_football -> app_backend.db: { label: "Odds/Eventos\n(Polling Otimizado)" }
data_sources.the_sports_db -> app_backend.db: { label: "Assets Visuais\n(Coleta Única)" }

app_backend.db -> app_backend.cache: { label: "Dados Consultados" }
app_backend.cache -> app_frontend: { label: "Dados Rápidos" }
app_backend -> app_frontend: { label: "Lógica de Negócio\n(Criação de Bilhetes, Validação)" }

app_frontend -> app_backend: { label: "Requisições do Usuário" }
```

## 4. Próximos Passos

Com a arquitetura de integração de APIs definida, o próximo passo é detalhar a **Estratégia de Persistência e Dados Históricos** no banco de dados local, garantindo que os dados sejam armazenados de forma eficiente para consultas rápidas e análises complexas.

---

### Referências

[1] football-data.org. (n.d.). *Football Coverage*. Retrieved from [https://www.football-data.org/coverage](https://www.football-data.org/coverage)
[2] API-Football. (n.d.). *Our Coverage list*. Retrieved from [https://www.api-football.com/coverage](https://www.api-football.com/coverage)
[3] API-Football. (n.d.). *All our pricing plans*. Retrieved from [https://www.api-football.com/pricing](https://www.api-football.com/pricing)
[4] TheSportsDB. (n.d.). *TheSportsDB*. Retrieved from [https://www.thesportsdb.com](https://www.thesportsdb.com)

## 5. Estratégia de Persistência e Dados Históricos

Para garantir a robustez e a capacidade analítica do aplicativo, é fundamental uma estratégia eficiente de persistência de dados. A escolha de um banco de dados relacional como **PostgreSQL** é recomendada devido à sua capacidade de lidar com dados estruturados, suporte a transações ACID e ferramentas avançadas para consultas analíticas. Alternativamente, para maior flexibilidade com esquemas de dados variáveis, um banco de dados NoSQL como **MongoDB** pode ser considerado, especialmente para dados de eventos e estatísticas mais dinâmicas.

### A. Modelo de Dados Simplificado

O banco de dados local armazenará as seguintes entidades principais:

| Entidade | Atributos Chave | Origem Principal | Uso na Estratégia |
| :--- | :--- | :--- | :--- |
| **Ligas** | `id`, `nome`, `pais` | football-data.org | Estrutura básica para organização de competições. |
| **Times** | `id`, `nome`, `logo_url`, `liga_id` | football-data.org, TheSportsDB | Identificação e visualização dos times. |
| **Jogos** | `id`, `data_hora`, `mandante_id`, `visitante_id`, `liga_id`, `placar_mandante`, `placar_visitante`, `status` | football-data.org, API-Football | Base para análise de resultados, fixtures e eventos. |
| **Odds** | `jogo_id`, `casa_aposta`, `odd_mandante`, `odd_empate`, `odd_visitante`, `timestamp` | API-Football | Identificação de "Big Odds" e cálculo de valor. |
| **Estatísticas de Jogo** | `jogo_id`, `tipo_estatistica`, `valor` (ex: `xG_mandante`, `chutes_mandante`) | API-Football | Alimentar modelos algorítmicos de previsão. |
| **Eventos de Jogo** | `jogo_id`, `tipo_evento` (gol, cartão), `minuto`, `jogador_id` | API-Football | Análise de desempenho em tempo real e histórico.

### B. Gerenciamento de Dados Históricos

O acesso a dados históricos é crucial para a inteligência algorítmica. A estratégia de gerenciamento inclui:

1.  **Coleta Inicial Massiva:** Ao configurar o aplicativo, realizar uma coleta abrangente de dados históricos de temporadas anteriores do Brasileirão (e outras ligas relevantes) usando a `football-data.org`. Esta coleta pode ser feita em lotes para respeitar os limites da API.
2.  **Atualização Incremental:** Manter os dados históricos atualizados com os resultados de jogos recém-concluídos. Isso pode ser feito através de um job agendado que consulta a `football-data.org` diariamente ou semanalmente.
3.  **Indexação Otimizada:** Criar índices apropriados no banco de dados para acelerar consultas complexas, como buscar todos os jogos entre dois times em um período específico ou calcular a média de xG de um time nos últimos 5 jogos.
4.  **Agregação de Dados:** Para análises de longo prazo, dados brutos podem ser agregados (ex: média de gols por rodada, desempenho de times em casa/fora por temporada) e armazenados em tabelas sumarizadas para otimizar o desempenho das consultas analíticas.

### C. Estratégia de Cache

Um sistema de cache (como **Redis**) será implementado entre o backend e o banco de dados para armazenar resultados de consultas frequentes e dados de Odds em tempo real. Isso reduzirá a carga no banco de dados e acelerará a entrega de informações ao frontend, além de ajudar a gerenciar o limite de requisições da `API-Football`.

| Tipo de Dado em Cache | Duração do Cache | Justificativa |
| :--- | :--- | :--- |
| **Odds Pré-jogo** | Curta (ex: 15-30 minutos) | Volatilidade das Odds exige atualização frequente. |
| **Livescore** | Muito Curta (ex: 1-5 minutos) | Necessidade de dados quase em tempo real. |
| **Estatísticas de Jogo (em andamento)** | Curta (ex: 5-10 minutos) | Atualizações constantes durante o jogo. |
| **Dados de Times/Ligas (estáticos)** | Longa (ex: 24 horas ou mais) | Informações que não mudam com frequência. |

Esta estratégia de persistência e cache garante que o aplicativo tenha acesso rápido e eficiente a uma vasta quantidade de dados, tanto históricos quanto em tempo real, fundamental para a execução da estratégia de "Big Odds" e para a experiência do usuário.

## 6. Fluxo de Criação de Bilhetes e Validação de Odds

O fluxo de criação de bilhetes é o cerne da interação do usuário com a estratégia de "Big Odds". Ele deve ser intuitivo e, ao mesmo tempo, incorporar a inteligência algorítmica para sugerir e validar as apostas.

### A. Seleção de Jogos e Times Âncoras

1.  **Seleção da Rodada:** O usuário seleciona a rodada do Campeonato Brasileiro (ou outra liga) para a qual deseja criar bilhetes.
2.  **Visualização de Jogos:** O aplicativo exibe todos os jogos da rodada, com informações básicas como times, data e hora.
3.  **Sugestão de Âncoras (Algorítmica):** Com base nos dados históricos e estatísticas (xG, xP, forma recente) armazenados localmente, o sistema sugere os "Times Âncoras" com maior probabilidade de vitória. Esta sugestão pode ser acompanhada de um "índice de confiança" algorítmico.
4.  **Seleção Manual de Âncoras:** O usuário pode aceitar as sugestões ou selecionar manualmente seus próprios times âncoras, que serão a base para as variações.

### B. Geração de Variações e Validação de Odds

1.  **Geração Algorítmica de Variações:** Com base nos times âncoras selecionados e nos dados históricos de desempenho dos outros jogos da rodada, o sistema gera as 5 variações de bilhetes, seguindo a lógica de "cercamento" e otimização proposta na análise algorítmica.
    *   **Variação Lógica:** Todos os âncoras para vencer.
    *   **Variações de Equilíbrio:** Distribuição de empates e vitórias de não-favoritos em jogos com maior incerteza, baseada em probabilidades calculadas.
    *   **Filtros de Exclusão:** O algoritmo aplica os filtros de volatilidade, motivação e clima para remover jogos de alto risco ou com baixa previsibilidade das múltiplas, ou para sugerir alternativas.
2.  **Coleta de Odds em Tempo Real:** Para cada variação gerada, o sistema consulta a `API-Football` para obter as Odds pré-jogo mais recentes para todos os jogos incluídos no bilhete. Esta consulta é otimizada para respeitar o limite de 100 requisições/dia, buscando as Odds de todos os jogos da rodada de uma só vez e armazenando-as em cache.
3.  **Cálculo da Odd Total e Valor:** Para cada bilhete, o aplicativo calcula a Odd total combinada e, utilizando as probabilidades algorítmicas internas, determina se o bilhete representa um "Value Bet" (aposta de valor) em relação à Odd oferecida pela casa de apostas.
4.  **Exibição e Ajuste:** As 5 variações são apresentadas ao usuário, com a Odd total, o potencial de retorno e o "índice de valor" para cada uma. O usuário pode ajustar manualmente os resultados de jogos específicos em cada variação, e o sistema recalcula as Odds e o valor em tempo real.

### C. Criação e Monitoramento do Bilhete

1.  **Confirmação do Bilhete:** Após a revisão e ajustes, o usuário confirma a criação dos bilhetes. O aplicativo armazena os bilhetes selecionados no banco de dados local.
2.  **Integração com Casa de Apostas (Opcional/Manual):** Inicialmente, a criação do bilhete na casa de apostas será um processo manual, onde o usuário copia as seleções do aplicativo para a plataforma de apostas. Futuramente, pode-se explorar integrações via automação de navegador (com consentimento do usuário) ou APIs de casas de apostas (se disponíveis e viáveis).
3.  **Monitoramento em Tempo Real:** Uma vez que os jogos começam, o aplicativo utiliza a `API-Football` para monitorar os livescores e eventos em tempo real. Isso permite ao usuário acompanhar o progresso de seus bilhetes e, se aplicável, considerar opções de cash-out estratégico com base em alertas gerados pelo sistema.

### D. Diagrama de Fluxo de Criação de Bilhetes

![Fluxo de Criação de Bilhetes](https://private-us-east-1.manuscdn.com/sessionFile/cbKG5iNGPeYauSjj6CjDaY/sandbox/K0XkHrKyUxI7zNqRJXaZJ3-images_1775449116551_na1fn_L2hvbWUvdWJ1bnR1L2ZsdXhvX2NyaWFjYW9fYmlsaGV0ZXM.png?Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvY2JLRzVpTkdQZVlhdVNqajZDakRhWS9zYW5kYm94L0swWGtIckt5VXhJN3pOcVJKWGFaSjMtaW1hZ2VzXzE3NzU0NDkxMTY1NTFfbmExZm5fTDJodmJXVXZkV0oxYm5SMUwyWnNkWGh2WDJOeWFXRmpZVzlmWW1sc2FHVjBaWE0ucG5nIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzk4NzYxNjAwfX19XX0_&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=QWHLcSVwsQcB34cwAiyjN6lL5QSytLQJsuPqmnE~FDrZEgZvViNy~wxBi2FyaiDcvarUOIWWt~k~Z4IgLqlOhgTa62wtEa53eiJo8PVbqYpS9GPp859EI1bCxyMCdFlOMa8cMMmWjYhdPzyy-RmZ4AjITWVhnuIc36XB0RztE5IC2ZHdzbanAnmtulGlcLJK6h9VDOHbNTmLvNSQ-ogdVVT2rPNYPXA6OhOKIdBz33a07T2SnA4lPkOmy5k02bg1Ubl-qbawVoA4R35URosVdcr-9md-bUl57ikK9tAWvOoHw41LhUC6JhjjUxYuczbo8-WDSHyHz5JdJgYP0RobDA__)

## 7. Conclusão

A implementação de uma **Arquitetura Híbrida de Dados** é a estratégia mais eficaz para construir um aplicativo robusto de "Big Odds" para o Campeonato Brasileiro, aproveitando o melhor das APIs gratuitas e garantindo a sustentabilidade do projeto. Ao combinar a `football-data.org` para dados históricos e estruturais com a `API-Football` para Odds e informações em tempo real, e complementando com `TheSportsDB` para assets visuais, é possível obter uma cobertura de dados abrangente e rica.

A estratégia de persistência em um banco de dados local, aliada a um sistema de cache, otimiza o desempenho e o uso das APIs, enquanto o fluxo de criação de bilhetes, impulsionado por inteligência algorítmica, oferece ao usuário uma ferramenta poderosa para identificar e gerenciar suas apostas de valor. Esta abordagem minimiza custos, maximiza a qualidade dos dados e fornece uma base sólida para futuras expansões e funcionalidades do aplicativo.

---

### Referências

[1] football-data.org. (n.d.). *Football Coverage*. Retrieved from [https://www.football-data.org/coverage](https://www.football-data.org/coverage)
[2] API-Football. (n.d.). *Our Coverage list*. Retrieved from [https://www.api-football.com/coverage](https://www.api-football.com/coverage)
[3] API-Football. (n.d.). *All our pricing plans*. Retrieved from [https://www.api-football.com/pricing](https://www.api-football.com/pricing)
[4] TheSportsDB. (n.d.). *TheSportsDB*. Retrieved from [https://www.thesportsdb.com](https://www.thesportsdb.com)
