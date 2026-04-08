# Documento de Especificação Técnica (PRD): Projeto BOB - Big Odds Bot

**Versão:** 1.0  
**Status:** Consolidado para Desenvolvimento  
**Autor:** Manus AI (Estrategista Cognitivo)  
**Ambiente de Desenvolvimento:** VS Code + GitHub Copilot / Claude Code  

---

## 1. Visão Geral do Produto
O **BOB (Big Odds Bot)** é um "Orquestrador Cognitivo" de apostas esportivas focado no Campeonato Brasileiro Série A. Ele não é apenas um agregador de dados, mas um sistema de decisão autônomo que utiliza uma **Arquitetura Híbrida de Dados** e um **Cérebro de IA (Claude Sonnet)** para gerar 5 variações de bilhetes (múltiplas) baseadas na "Estratégia das Variações" e em modelos de probabilidade contínua (Lógica Quântica Aplicada).

### Objetivos Principais
*   **Eliminar o Erro Humano:** Automatizar a análise de 10+ variáveis por jogo.
*   **Maximizar Retorno (Big Odds):** Buscar múltiplas com Odds > 1.000 através de cercamento matemático.
*   **Eficiência de Custo:** Operar 100% com camadas gratuitas de APIs através de cache inteligente e orquestração.

---

## 2. Arquitetura de Dados e Integrações

O sistema utiliza 4 APIs principais com papéis definidos e fallbacks automáticos.

### 2.1. Mapa de Responsabilidades das APIs

| API | Papel Principal | Dados Fornecidos | Estratégia de Quota |
| :--- | :--- | :--- | :--- |
| **football-data.org** | Espinha Dorsal | Fixtures, Standings, Resultados, Calendário. | 10 req/min. Atualização 1x/dia. |
| **API-Football** | O Bisturi | **Odds (Pré/Live)**, Lineups (T-1h), Predictions, Stats Avançadas. | 100 req/dia. Cache agressivo no Supabase. |
| **TheSportsDB** | Assets Visuais | Logos, Banners, Escudos HD, H2H Histórico. | Coleta única (Sincronização 1x/vida). |
| **Anthropic (Claude)** | O Cérebro | Análise Cognitiva, Scoring, Geração de Justificativas. | Orquestrador de decisão. Fallback: GPT-4o. |

### 2.2. Stack Tecnológica
*   **Frontend:** Next.js 14 (App Router) + Tailwind CSS + Shadcn/UI.
*   **Backend:** Next.js Server Actions / API Routes (Node.js).
*   **Banco de Dados:** Supabase (PostgreSQL + pgvector para memória semântica).
*   **Cache/Sessão:** Vercel KV (Redis).
*   **Autenticação:** Supabase Auth (Google Login com Whitelist de e-mails).

---

## 3. Regras de Negócio (RN) - 100% Cobertura

| ID | Regra de Negócio | Descrição Detalhada |
| :--- | :--- | :--- |
| **RN01** | **Whitelist de Acesso** | Apenas e-mails presentes na tabela `allowed_users` do Supabase podem acessar o app. |
| **RN02** | **Estratégia das 5 Variações** | O sistema DEVE gerar exatamente 5 bilhetes distintos por rodada, seguindo a matriz de cobertura (Lógica, Equilíbrio, Zebra, Under, Extrema). |
| **RN03** | **Times Âncoras** | O sistema DEVE identificar 4 favoritos (âncoras) baseados em xP (Expected Points) > 65%. |
| **RN04** | **Presença de Âncoras** | Os 4 âncoras DEVEM aparecer como vencedores em pelo menos 3 das 5 variações geradas. |
| **RN05** | **Filtro de Volatilidade** | Jogos com volatilidade alta (Clássicos ou sem interesse na tabela) DEVEM ser excluídos de múltiplas longas (> 8 jogos). |
| **RN06** | **Reanálise T-1h** | Se um jogador-chave (Top 3 xG/Assist) estiver fora da lineup confirmada, o sistema DEVE disparar reanálise automática do bilhete. |
| **RN07** | **Cache de Quota** | Se os dados da rodada já existirem no Supabase com timestamp < 6h, o sistema NÃO DEVE chamar a API externa. |
| **RN08** | **Cálculo de Value Bet** | Uma seleção só entra no bilhete se `Odd_Casa > (1 / Probabilidade_Algorítmica)`. |
| **RN09** | **Fallback de IA** | Se a API da Anthropic retornar erro, o sistema DEVE alternar para OpenAI GPT-4o automaticamente. |
| **RN10** | **Justificativa Cognitiva** | Todo bilhete gerado DEVE conter uma justificativa textual explicando o raciocínio (ex: "Foco em probabilidade devido ao clima e arbitragem"). |
| **RN11** | **Limite de Jogos** | Cada bilhete deve ter entre 7 e 10 jogos para garantir o status de "Big Odd". |
| **RN12** | **Auditoria de Decisão** | Toda decisão do "Cérebro" deve ser logada no banco com os inputs brutos utilizados para permitir melhoria contínua. |

---

## 4. Critérios de Aceite (CA)

| ID | Critério de Aceite | Validação (QA) |
| :--- | :--- | :--- |
| **CA01** | **Acesso Negado** | Tentar logar com e-mail fora da whitelist deve redirecionar para `/acesso-negado`. |
| **CA02** | **Geração de Bilhetes** | Ao clicar em "Gerar Análise", o sistema deve retornar 5 objetos de bilhete únicos em < 15s. |
| **CA03** | **Persistência de Odds** | As Odds exibidas no bilhete devem corresponder ao último snapshot salvo no banco de dados. |
| **CA04** | **Sincronização Visual** | Logos dos times devem ser carregados via URL do TheSportsDB armazenada localmente. |
| **CA05** | **Alerta de Lineup** | Simular ausência de titular deve alterar o status do bilhete para "Reanalisando" e gerar nova versão. |
| **CA06** | **Cálculo de Retorno** | O multiplicador final do bilhete deve ser o produto exato das Odds individuais de cada seleção. |
| **CA07** | **Interface Responsiva** | O dashboard deve ser 100% utilizável em dispositivos móveis (foco em PWA). |
| **CA08** | **Logs de Erro** | Falhas de API devem gerar um log no Supabase e exibir mensagem amigável ao usuário (RN10 do doc-tecnico). |
| **CA09** | **Memória Semântica** | O sistema deve "lembrar" se o usuário prefere bilhetes mais conservadores ou agressivos baseando-se no histórico de cliques. |
| **CA10** | **Performance de Cache** | A segunda visualização da mesma rodada por qualquer usuário deve carregar em < 1s (sem chamadas externas). |

---

## 5. Fluxo de Desenvolvimento (VS Code + Copilot)

### Fase 1: Setup e Infraestrutura
1.  `npx create-next-app@latest bob-app`
2.  Configurar Supabase (Auth, DB, Storage).
3.  Criar tabelas: `allowed_users`, `leagues`, `teams`, `fixtures`, `odds`, `betslips`, `logs`.
4.  Implementar Middleware de Whitelist.

### Fase 2: Camada de Dados (Ingestão)
1.  Criar scripts de sincronização para TheSportsDB (Assets).
2.  Implementar Orquestrador de APIs (football-data.org -> API-Football fallback).
3.  Criar lógica de Cache em camadas (Supabase + Redis).

### Fase 3: O Cérebro (IA Integration)
1.  Configurar SDK da Anthropic e OpenAI.
2.  Desenvolver o "Prompt Sistêmico" (O Coração do BOB).
3.  Implementar o Pipeline de Decisão (Coleta -> Análise -> Scoring -> Justificativa).

### Fase 4: UI e UX
1.  Desenvolver Dashboard de Rodadas.
2.  Criar componente de "Card de Bilhete" com as 5 variações.
3.  Implementar visualização de justificativas e níveis de confiança.

### Fase 5: Automação e Refinamento
1.  Configurar Cron Jobs (Vercel Cron) para atualização T-48h, T-24h e T-1h.
2.  Implementar TDD (Test Driven Development) para os 10 CAs usando Claude Code.

---

## 6. Considerações Finais
O sucesso do BOB reside na **precisão da reanálise de última hora (T-1h)** e na **justificativa lógica** que convence o usuário da qualidade da aposta. O uso do GitHub Copilot deve ser focado em gerar o boilerplate de componentes e tipos, enquanto o raciocínio das Regras de Negócio deve ser validado rigorosamente contra este PRD.
