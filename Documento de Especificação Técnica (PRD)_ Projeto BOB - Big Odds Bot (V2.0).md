# Documento de Especificação Técnica (PRD): Projeto BOB - Big Odds Bot (V2.0)

**Versão:** 2.0 (Consolidada)  
**Status:** Pronto para Desenvolvimento  
**Autor:** Manus AI (Estrategista Cognitivo)  
**Ambiente de Desenvolvimento:** VS Code + GitHub Copilot / Claude Code  

---

## 1. Visão Geral e Diagnóstico
O **BOB (Big Odds Bot)** é um orquestrador cognitivo que industrializa a estratégia de apostas "Camillo" para o Brasileirão Série A. Ele remove a subjetividade humana através de um **Scoring Algorítmico de 15+ variáveis** e uma **Matriz de Cobertura Matemática** para gerar múltiplas de alta cotação (Big Odds).

### Diferenciais Estratégicos (BOB vs. Manual)
| Ponto Fraco Atual | Solução BOB |
| :--- | :--- |
| Seleção por intuição | Scoring algorítmico ponderado (xG, Mando, H2H, Motivação, Desfalques, Árbitro). |
| Variações manuais | Matriz de cobertura automática (cobre quadrantes de probabilidade sem sobreposição). |
| Odds estáticas | Monitoramento de movimentação de odds em tempo real (sinal de informação nova). |
| Sem memória | Engine de padrões condicionais (Aprende correlações entre Times e Árbitros). |
| Stake fixo | **Kelly Criterion Adaptado**: Stake varia conforme o nível de confiança do BOB. |

---

## 2. Arquitetura Técnica e Stack (100% Gratuita para Validação)
O app será um **PWA (Progressive Web App)**, eliminando a necessidade de lojas de aplicativos e backends dedicados caros.

| Camada | Tecnologia | Justificativa |
| :--- | :--- | :--- |
| **Frontend/Backend** | Next.js 14 (App Router) | Serverless no Vercel (Grátis). PWA nativo. |
| **Banco de Dados** | Supabase (PostgreSQL + pgvector) | Grátis (500MB). Auth e Storage integrados. |
| **Cérebro (IA)** | **Claude 3.5 Sonnet** (Anthropic) | Superior em raciocínio analítico e lógica estrutural. |
| **Dados Esportivos** | **football-data.org** | Única API com Série A BR permanente no plano gratuito. |
| **Assets Visuais** | **TheSportsDB** | Logos e banners HD sem custo de quota. |
| **Cache Rápido** | Vercel KV (Redis) | Gerenciamento de sessão e rate limiting. |

---

## 3. Regras de Negócio (RN) - Cobertura 100%

| ID | Regra | Descrição Detalhada |
| :--- | :--- | :--- |
| **RN01** | **Exclusividade Série A** | Analisa apenas jogos do Campeonato Brasileiro Série A na temporada vigente. |
| **RN02** | **Threshold de Big Odd** | Cada bilhete deve ter entre 7 e 10 jogos com Odd total combinada > 500x (Ideal: 1.000x+). |
| **RN03** | **Matriz de 5 Variações** | Gera exatamente 5 bilhetes únicos: Lógica, Equilíbrio, Zebra, Under e Extrema. |
| **RN04** | **Âncoras Algorítmicos** | Favoritos (Score >= 70%) devem vencer em no mínimo 3 das 5 variações. |
| **RN05** | **Filtros de Exclusão** | Exclui automaticamente clássicos (Volatilidade) e times sem objetivo (Motivação) de múltiplas longas. |
| **RN06** | **Reanálise T-1h** | Dispara reanálise se um titular-chave (Top 3 xG) estiver fora da lineup confirmada. |
| **RN07** | **Kelly Criterion** | Sugere stake proporcional à confiança (ex: Confiança 80% = Stake 1.5x; Confiança 50% = Stake 0.5x). |
| **RN08** | **Feedback Loop** | O usuário DEVE registrar o resultado real para alimentar a memória de padrões do cérebro. |
| **RN09** | **Whitelist Beta** | Acesso restrito a e-mails autorizados via Supabase Auth (Máx. 6 usuários no beta). |
| **RN10** | **Justificativa Natural** | Cada seleção deve ter uma explicação clara (ex: "Flamengo vence: xG superior e visitante desfalcado"). |

---

## 4. Critérios de Aceitação (CA)

| ID | Funcionalidade | Critério de Aceitação |
| :--- | :--- | :--- |
| **CA01** | **Geração de Análise** | Retornar 5 bilhetes distintos em < 30s com justificativas e scores de 0-100. |
| **CA02** | **Dashboard de Performance** | Exibir Taxa de Acerto, ROI simulado e evolução mensal baseada nos feedbacks. |
| **CA03** | **Sincronização de Dados** | Carregar fixtures e standings automaticamente via football-data.org. |
| **CA04** | **Intervenção Manual** | Permitir que o usuário exclua um jogo manualmente e o BOB reconstrua as variações. |
| **CA05** | **Instalação PWA** | O app deve permitir "Adicionar à tela inicial" e rodar em tela cheia no iOS/Android. |
| **CA06** | **Segurança de Acesso** | E-mails não autorizados devem ser bloqueados antes de qualquer chamada de API de IA. |

---

## 5. Fluxo de Desenvolvimento (VS Code + Copilot)

### Fase 1: Fundação (Semana 1)
*   Setup Next.js + Supabase + PWA Config.
*   Implementação da Whitelist e Auth.
*   Sincronização inicial de times e logos (TheSportsDB).

### Fase 2: O Motor de Dados (Semana 2)
*   Integração football-data.org com cache no Supabase.
*   Criação do Dashboard de Rodadas (Visualização de Fixtures).

### Fase 3: O Cérebro Analítico (Semana 3)
*   Implementação do Prompt do Claude 3.5 Sonnet com as 15+ variáveis.
*   Lógica de geração das 5 variações (Matriz de Cobertura).

### Fase 4: Feedback e Evolução (Semana 4)
*   Sistema de registro de resultados pós-rodada.
*   Dashboard de métricas e ROI.
*   Ajustes finais de UI/UX para Mobile.

---

## 6. Prompt Mestre para o Copilot (Use no Início)
> "Atue como um desenvolvedor Fullstack Senior. Vamos construir o BOB, um PWA em Next.js 14 para análise de Big Odds no Brasileirão. Use Supabase para DB/Auth e Claude 3.5 Sonnet para a lógica cognitiva. Siga rigorosamente o PRD V2.0 que forneci. Comece gerando a estrutura de pastas e o esquema do banco de dados PostgreSQL."
