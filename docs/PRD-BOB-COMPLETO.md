# PRD COMPLETO — BOB: Big Odds Brasileirão

> **Tipo:** Product Requirements Document (PRD) + Requisitos de Software  
> **Versão:** 1.0  
> **Data:** 11 de abril de 2026  
> **Autor:** PM/PD — Nilson Brites  
> **Modelo de IA:** Claude Opus 4.6 (GitHub Copilot)  
> **Complementa:** `PLANO-V3-DEFINITIVO.md` (checklists de implementação) e `PLANO-MESTRE.md` (arquitetura técnica)

---

## SUMÁRIO

1. [Visão do Produto](#1-visão-do-produto)
2. [Stakeholders & Personas](#2-stakeholders--personas)
3. [Storyboard — Jornada do Usuário](#3-storyboard--jornada-do-usuário)
4. [User Stories (Épicos + Stories)](#4-user-stories-épicos--stories)
5. [Requisitos Funcionais (RF)](#5-requisitos-funcionais-rf)
6. [Regras de Negócio (RN)](#6-regras-de-negócio-rn)
7. [Requisitos Não Funcionais (RNF)](#7-requisitos-não-funcionais-rnf)
8. [Critérios de Aceite (CA) por Feature](#8-critérios-de-aceite-ca-por-feature)
9. [Definition of Done (DoD)](#9-definition-of-done-dod)
10. [Estratégia de Testes (TDD)](#10-estratégia-de-testes-tdd)
11. [Regras Gerais do Produto](#11-regras-gerais-do-produto)
12. [Matriz de Rastreabilidade](#12-matriz-de-rastreabilidade)

---

## 1. VISÃO DO PRODUTO

### 1.1 Declaração de Visão

**Para** apostadores analíticos do Brasileirão Série A  
**Que** precisam de análises fundamentadas e coberturas matemáticas para apostas de big odds  
**O BOB — Big Odds Brasileirão** é um sistema analítico autônomo  
**Que** combina motor determinístico de 15+ fatores, IA multi-modelo (Claude + GPT) e memória evolutiva para gerar 5 variações de apostas múltiplas por rodada  
**Diferente de** tipsters manuais, bots genéricos, ou algoritmos de odd fixa  
**Nosso produto** oferece análise rastreável, auto-calibração bayesiana, personalidade quântica e evolução contínua baseada em evidência.

### 1.2 O que o BOB NÃO é

- ❌ Casa de apostas (não processa dinheiro)
- ❌ Guru de apostas (não promete ganho)
- ❌ Bot de automação (não faz apostas pelo usuário)
- ❌ Ferramenta genérica (foco 100% = Brasileirão Série A, Resultado Final 1X2)

### 1.3 Objetivos de Negócio

| Objetivo | Métrica | Meta |
|----------|---------|------|
| OBJ-01: Análise de alta qualidade | Acurácia de âncoras por temporada | ≥ 65% |
| OBJ-02: Cobertura eficiente | Pelo menos 1 variação com ≥7 picks corretos/rodada | ≥ 40% das rodadas |
| OBJ-03: Custo operacional mínimo | Custo de IA + APIs por temporada | < R$ 50,00 |
| OBJ-04: Confiança do usuário | NPS entre usuários beta | ≥ 70 |
| OBJ-05: Evolução demonstrável | Acurácia R20 > Acurácia R5 | Tendência positiva |

### 1.4 Escopo do Produto (Releases)

| Release | Conteúdo | Status |
|---------|----------|--------|
| R1 (MVP) | Motor 10 fatores + Dashboard + Auth + Variações | ✅ Entregue |
| R2 (Inteligência) | Backtesting + Calibrador ABQC + Memória profunda | ✅ Backend pronto |
| R3 (Produto) | Sprint 1-3: bugs críticos + dados expandidos + dashboard premium | ⬜ Planejado |
| R4 (Autonomia) | Sprint 4-5: simulação cega + estatísticas individuais | ⬜ Planejado |
| R5 (Completude) | Sprint 6-8: zebras, histórico, segurança, polimento | ⬜ Planejado |

---

## 2. STAKEHOLDERS & PERSONAS

### 2.1 Stakeholders

| Papel | Nome | Interesse |
|-------|------|-----------|
| Product Owner | Nilson Brites | Visão de produto, decisões finais, validação |
| Admin técnico | nilson.brites@gmail.com | Gerência de usuários, monitoramento do motor |
| Idealizador do método | Camillo | Estratégia original das 5 variações |
| Desenvolvedor | GitHub Copilot (Claude Opus 4.6) | Implementação técnica |

### 2.2 Personas

#### Persona 1: Lucas — O Apostador Analítico
- **Idade:** 28 anos, São Paulo
- **Perfil:** Aposta regularmente no Brasileirão, gosta de múltiplas longas
- **Frustração:** Perde tempo montando bilhetes manualmente, não tem dados organizados
- **Necessidade:** Receber 5 variações prontas com justificativa clara
- **Comportamento digital:** Acessa pelo celular, quer informação rápida e visual
- **Quote:** "Quero entender POR QUE o BOB escolheu esse jogo, não só ver o bilhete"

#### Persona 2: Renata — A Curiosa Casual
- **Idade:** 34 anos, Belo Horizonte
- **Perfil:** Assiste futebol, aposta ocasionalmente, não é analítica
- **Frustração:** Não entende termos técnicos, se sente excluída de ferramentas avançadas
- **Necessidade:** Interface amigável, linguagem acessível, chat para tirar dúvidas
- **Comportamento digital:** Mobile-first, acessa links do WhatsApp
- **Quote:** "Quero saber quem vai ganhar, sem precisar ler 50 gráficos"

#### Persona 3: Nilson — O Admin/PO
- **Idade:** 40 anos
- **Perfil:** Product Owner, monitora performance do BOB, gerencia whitelist
- **Frustração:** Quer ver se o motor está evoluindo, precisa de métricas claras
- **Necessidade:** Painel admin com calibração, acurácia, reflexões técnicas
- **Quote:** "Me mostra se o BOB está ficando mais inteligente rodada a rodada"

---

## 3. STORYBOARD — JORNADA DO USUÁRIO

### 3.1 Fluxo Principal — Rodada Nova

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 1. DESCOBERTA                                                                │
│    Usuário recebe link de acesso (email magic link aprovado pelo admin)       │
│    → Abre app → Vê tela de login premium com identidade BOB                 │
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 2. AUTENTICAÇÃO                                                              │
│    Insere email → Recebe OTP por email → Valida código                      │
│    → Se email não está na whitelist: "Acesso restrito" (sem cadastro)        │
│    → Se aprovado: redirect ao Dashboard                                      │
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 3. ABERTURA DIÁRIA (primeira visita em 24h)                                  │
│    BOB cumprimenta com frase positiva + status da rodada                     │
│    Ex: "Fala, campeão! Rodada 12 com 4 âncoras fortes. Vamos que vamos." 🌟│
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 4. DASHBOARD — VISÃO GERAL DA RODADA                                        │
│    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                       │
│    │ Rodada 12     │ │ Primeiro jogo│ │ Status       │                       │
│    │ 2026          │ │ Sáb 12/04    │ │ Programada   │                       │
│    └──────────────┘ └──────────────┘ └──────────────┘                       │
│                                                                              │
│    ┌─ ÂNCORAS (destaque principal) ─────────────────────────────┐            │
│    │ 🛡️ Palmeiras vs Cuiabá     Score: 82/100  [✅][❌][ℹ️]  │            │
│    │ 🛡️ Flamengo vs Juventude   Score: 77/100  [✅][❌][ℹ️]  │            │
│    │ 🛡️ Botafogo vs Criciúma    Score: 74/100  [✅][❌][ℹ️]  │            │
│    │ 🛡️ Fortaleza vs Goiás      Score: 71/100  [✅][❌][ℹ️]  │            │
│    └────────────────────────────────────────────────────────────┘            │
│                                                                              │
│    ┌─ 5 VARIAÇÕES ──────────────────────────────────────────────┐            │
│    │ V1 Safety (500x) │ V2 Balance (800x) │ V3 Pure Logic(800x)│            │
│    │ V4 Short (1000x) │ V5 Extreme (1000x)│                    │            │
│    └────────────────────────────────────────────────────────────┘            │
│                                                                              │
│    ┌─ NARRATIVA BOB ──────┐  ┌─ REFLEXÃO ──────────┐                        │
│    │ "Rodada 12 tem cara   │  │ "Ajustei o peso do  │                        │
│    │  de segurança..."     │  │  fator forma..."     │                        │
│    └──────────────────────┘  └─────────────────────┘                        │
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 5. INTERAÇÃO COM ÂNCORAS                                                     │
│    → [ℹ️] Expande: breakdown de 15 fatores com barras de progresso          │
│    → [❌] Rejeitar: remove âncora → recalcula variações em tempo real       │
│    → [✅] Aceitar: confirma (visual feedback)                                │
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 6. EXPLORAÇÃO DE VARIAÇÕES                                                   │
│    → Clica em V1: expande com escudos, picks, odds, resultado sugerido      │
│    → Compara V1 vs V5 lado a lado                                            │
│    → Vê indicador de risco (verde → amarelo → vermelho)                     │
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 7. CHAT COM BOB                                                              │
│    → Abre widget flutuante                                                   │
│    → "Explica por que Palmeiras é âncora?"                                   │
│    → BOB responde com markdown, dados reais, tom quântico                   │
│    → Histórico persistido no localStorage                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Fluxo Secundário — Estatísticas de Jogo

```
Dashboard → Clica em "Estatísticas" (nav) → Página /estatisticas
→ Grid de 10 jogos com escudos → Clica em "Palmeiras x Cuiabá"
→ Modal de análise: H2H, forma, fatores, previsão BOB
→ Volta ao dashboard com contexto enriquecido
```

### 3.3 Fluxo Secundário — Histórico de Variações

```
Dashboard → Clica em "Histórico" (nav) → Página /historico
→ Lista de rodadas (1, 2, 3, ..., N) clicáveis
→ Clica em "Rodada 8" → Vê 5 variações com picks green/red
→ Vê métricas: "Acertou 7/9 picks · Odd: 1.234x · Status: ❌"
→ Variação vencedora tem destaque dourado
```

### 3.4 Fluxo Admin — Calibração e Monitoramento

```
Login admin → /admin → Painel de controle
→ Vê whitelist de usuários (add/remove/toggle)
→ Vê betslips por rodada → Registra resultados reais
→ Vê evolução de pesos do motor (gráfico de tendência)
→ Vê reflexões técnicas (admin text)
→ Vê progresso da simulação retroativa (rodada X de 38)
```

---

## 4. USER STORIES (ÉPICOS + STORIES)

### Épico 1: Autenticação e Acesso

| ID | User Story | Prioridade | Sprint |
|----|-----------|------------|--------|
| US-01 | Como **visitante**, quero receber um magic link por email para acessar o app sem senha | Must | MVP ✅ |
| US-02 | Como **admin**, quero aprovar/revogar emails na whitelist para controlar acesso | Must | MVP ✅ |
| US-03 | Como **usuário**, quero que minha sessão persista por 7 dias para não precisar logar toda vez | Should | S8 |
| US-04 | Como **admin**, quero que o email `nilson.brites@gmail.com` seja ADMIN imutável | Must | MVP ✅ |

### Épico 2: Motor Analítico e Variações

| ID | User Story | Prioridade | Sprint |
|----|-----------|------------|--------|
| US-05 | Como **usuário**, quero ver 5 variações de apostas para a rodada atual com odds projetadas | Must | MVP ✅ |
| US-06 | Como **usuário**, quero ver as 4 âncoras da rodada com score e justificativas | Must | MVP ✅ |
| US-07 | Como **usuário**, quero que cada variação tenha perfil de risco DISTINTO para que eu escolha a que mais combina comigo | Must | S1 |
| US-08 | Como **usuário**, quero que as variações sejam idênticas para todos os usuários na mesma rodada | Must | MVP ✅ |
| US-09 | Como **usuário**, quero ver a data/hora REAL do primeiro jogo da rodada, não "T-1h" | Must | S1 |
| US-10 | Como **usuário**, quero aceitar, rejeitar ou pedir explicação sobre cada âncora | Should | S3 |
| US-11 | Como **usuário**, quero que ao rejeitar uma âncora, as variações sejam recalculadas | Should | S3 |
| US-12 | Como **usuário**, quero ver o escudo de cada time ao lado do nome | Should | S3 |
| US-13 | Como **usuário**, quero ver indicador visual de risco por variação (verde/amarelo/vermelho) | Should | S3 |

### Épico 3: Chat com BOB

| ID | User Story | Prioridade | Sprint |
|----|-----------|------------|--------|
| US-14 | Como **usuário**, quero conversar com o BOB sobre a rodada, classificação e método | Must | MVP ✅ |
| US-15 | Como **usuário**, quero que o BOB formate respostas com negrito, listas e markdown | Must | S1 |
| US-16 | Como **usuário**, quero que o histórico do chat persista ao fechar e reabrir o widget | Should | S1 |
| US-17 | Como **usuário**, quero ver o avatar do BOB (bob-logo.png) nas mensagens do assistente | Should | S1 |
| US-18 | Como **usuário**, quero poder limpar o histórico do chat | Could | S1 |

### Épico 4: Estatísticas e Análise por Jogo

| ID | User Story | Prioridade | Sprint |
|----|-----------|------------|--------|
| US-19 | Como **usuário logado**, quero ver uma página de estatísticas com todos os 10 jogos da rodada | Should | S5 |
| US-20 | Como **usuário**, quero clicar em um jogo e ver análise detalhada (H2H, forma, fatores, previsão) | Should | S5 |
| US-21 | Como **usuário**, quero ver a previsão do BOB para CADA jogo (não só âncoras) com probabilidades | Should | S5 |

### Épico 5: Histórico de Variações

| ID | User Story | Prioridade | Sprint |
|----|-----------|------------|--------|
| US-22 | Como **usuário**, quero ver uma lista de rodadas passadas e clicar para ver as variações | Should | S7 |
| US-23 | Como **usuário**, quero ver cada pick marcado com verde (acertou) ou vermelho (errou) | Must | S7 |
| US-24 | Como **usuário**, quero ver o status de cada variação inteira (vencedora ou não) | Must | S7 |
| US-25 | Como **usuário**, quero ver métricas acumuladas de acurácia ao longo da temporada | Should | S7 |

### Épico 6: Inteligência e Auto-Evolução

| ID | User Story | Prioridade | Sprint |
|----|-----------|------------|--------|
| US-26 | Como **admin**, quero que o BOB calibre automaticamente os pesos dos fatores após cada rodada | Must | S4 |
| US-27 | Como **admin**, quero ver a reflexão do BOB sobre o que aprendeu em cada rodada | Should | S4 |
| US-28 | Como **admin**, quero que o BOB simule rodadas passadas de forma cega e aprenda com elas | Should | S4 |
| US-29 | Como **admin**, quero ver o progresso da simulação retroativa (rodada X de 38) | Could | S4 |

### Épico 7: Features Complementares

| ID | User Story | Prioridade | Sprint |
|----|-----------|------------|--------|
| US-30 | Como **usuário**, quero ver oportunidades de zebra sinalizadas na rodada | Could | S6 |
| US-31 | Como **usuário**, quero ver a tabela atualizada do Brasileirão com zonas coloridas | Should | S6 |
| US-32 | Como **usuário**, quero ver probabilidade de título e rebaixamento por time | Could | S6 |
| US-33 | Como **usuário**, quero ver um calendário dos jogos do Brasileirão | Could | S6 |

### Épico 8: Personalidade BOB

| ID | User Story | Prioridade | Sprint |
|----|-----------|------------|--------|
| US-34 | Como **usuário**, quero ser recebido com frase positiva do BOB na primeira visita do dia | Should | S1 |
| US-35 | Como **usuário**, quero que o BOB tenha personalidade quântica (fé, positividade, evolução) em todas as interações | Must | S1 |
| US-36 | Como **usuário**, quero que erros sejam comunicados com tom positivo, nunca derrotista | Must | S1 |

---

## 5. REQUISITOS FUNCIONAIS (RF)

### 5.1 Motor Analítico

| ID | Requisito | Prioridade | Status |
|----|-----------|------------|--------|
| RF-01 | O sistema DEVE calcular score de 0 a 100 para cada jogo da rodada usando 10+ fatores ponderados | Must | ✅ 10 fatores |
| RF-02 | O sistema DEVE selecionar até 4 âncoras com score ≥ 60, resultado "1", odd ≤ 2.20 e value edge positivo | Must | ✅ |
| RF-03 | O sistema DEVE gerar exatamente 5 variações canônicas (V1-V5) por rodada | Must | ✅ |
| RF-04 | O sistema DEVE garantir que cada variação tem perfil de risco distinto (sobreposição < 70%) | Must | ⬜ Bug ativo |
| RF-05 | O sistema DEVE aplicar pisos de odd: V1≥500x, V2≥800x, V3≥800x, V4≥1000x, V5≥1000x | Must | ✅ |
| RF-06 | O sistema DEVE expandir o motor para 15+ fatores incluindo árbitro, clima, calendário paralelo, pressão posicional e histórico de estádio | Should | ⬜ S2 |
| RF-07 | O sistema DEVE calibrar pesos automaticamente (ABQC) após cada rodada com resultados registrados | Should | ⬜ Backend pronto |
| RF-08 | O sistema DEVE executar backtesting por rodada e temporada para validar calibração | Should | ✅ Backend |

### 5.2 Dados e Conectores

| ID | Requisito | Prioridade | Status |
|----|-----------|------------|--------|
| RF-09 | O sistema DEVE buscar standings, fixtures e H2H da API football-data.org para a temporada vigente | Must | ✅ |
| RF-10 | O sistema DEVE buscar escudos/badges dos times via TheSportsDB e exibi-los na UI | Should | ⬜ Busca ✅, exibição ⬜ |
| RF-11 | O sistema DEVE buscar previsão de clima via open-meteo.com para cada jogo | Could | ⬜ S2 |
| RF-12 | O sistema DEVE usar API-Football para backfill de temporadas históricas (2022-2024) | Could | ⬜ S2 |
| RF-13 | O sistema DEVE estimar odds quando odds reais não estiverem disponíveis (baseado em posição na tabela) | Must | ✅ |
| RF-14 | O sistema DEVE aplicar fallback gracioso quando qualquer API estiver indisponível | Must | ✅ Demo mode |

### 5.3 Autenticação e Autorização

| ID | Requisito | Prioridade | Status |
|----|-----------|------------|--------|
| RF-15 | O sistema DEVE autenticar via Magic Link OTP (Supabase Auth) | Must | ✅ |
| RF-16 | O sistema DEVE verificar whitelist antes de conceder acesso ao dashboard | Must | ✅ |
| RF-17 | O admin DEVE poder adicionar/remover/ativar/desativar emails na whitelist | Must | ✅ |
| RF-18 | O email `nilson.brites@gmail.com` DEVE ser ADMIN imutável e não pode ser removido ou rebaixado | Must | ✅ |

### 5.4 Interface do Usuário

| ID | Requisito | Prioridade | Status |
|----|-----------|------------|--------|
| RF-19 | O dashboard DEVE exibir: rodada atual, data do primeiro jogo, âncoras, variações, narrativa | Must | ✅ Parcial |
| RF-20 | O dashboard DEVE exibir escudos dos times ao lado dos nomes | Should | ⬜ S3 |
| RF-21 | O dashboard DEVE permitir aceitar/rejeitar/explicar cada âncora interativamente | Should | ⬜ S3 |
| RF-22 | O chat DEVE renderizar markdown (negrito, listas, código, links) nas respostas | Must | ⬜ S1 |
| RF-23 | O chat DEVE persistir histórico no localStorage | Should | ⬜ S1 |
| RF-24 | O chat DEVE exibir avatar bob-logo.png do BOB | Should | ⬜ S1 |
| RF-25 | A página `/estatisticas` DEVE exibir grid de 10 jogos com análise individual por jogo | Should | ⬜ S5 |
| RF-26 | A página `/historico` DEVE exibir variações passadas com picks green/red e status da variação | Should | ⬜ S7 |
| RF-27 | A abertura diária DEVE ser exibida na primeira visita em 24h com frase motivacional + status | Should | ⬜ S1 |

### 5.5 Simulação e Aprendizado

| ID | Requisito | Prioridade | Status |
|----|-----------|------------|--------|
| RF-28 | O sistema DEVE executar simulação retroativa cega (rodadas passadas sem ver resultado) | Should | ⬜ S4 |
| RF-29 | Os resultados da simulação DEVEM alimentar o calibrador ABQC | Should | ⬜ S4 |
| RF-30 | O sistema DEVE registrar reflexão pública (linguagem BOB) e técnica (admin) após cada rodada | Should | ⬜ S4 |

### 5.6 Admin

| ID | Requisito | Prioridade | Status |
|----|-----------|------------|--------|
| RF-31 | O admin DEVE poder registrar resultados reais por pick (acertou/errou) | Must | ✅ |
| RF-32 | O admin DEVE ver evolução de pesos dos fatores ao longo das rodadas | Should | ⬜ S4 |
| RF-33 | O admin DEVE ver progresso da simulação retroativa | Could | ⬜ S4 |

---

## 6. REGRAS DE NEGÓCIO (RN)

### 6.1 Regras do Motor

| ID | Regra | Severidade | Testável |
|----|-------|------------|----------|
| RN-01 | Exatamente 5 variações por rodada — nunca menos, nunca mais | Bloqueante | ✅ |
| RN-02 | Máximo 4 âncoras por rodada | Bloqueante | ✅ |
| RN-03 | Score mínimo para âncora: 60/100 | Bloqueante | ✅ |
| RN-04 | Odd máxima para âncora: 2.20 | Bloqueante | ✅ |
| RN-05 | Clássicos regionais nunca são âncoras (score capped em 55) | Bloqueante | ✅ |
| RN-06 | Value Edge obrigatório: `score/100 > 1/homeOdd` para ser âncora | Bloqueante | ✅ |
| RN-07 | Variações IDÊNTICAS para todos os usuários na mesma rodada | Bloqueante | ✅ |
| RN-08 | Sobreposição entre quaisquer duas variações: máximo 70% de picks iguais | Bloqueante | ⬜ Bug |
| RN-09 | Pisos de odd por variação: V1≥500x, V2≥800x, V3≥800x, V4≥1000x, V5≥1000x | Bloqueante | ✅ |
| RN-10 | Soma dos pesos dos fatores DEVE ser exatamente 100 | Bloqueante | ✅ |
| RN-11 | Resultado sugerido "1" (vitória mandante) obrigatório para âncora | Alta | ✅ |
| RN-12 | Âncoras devem aparecer em ≥3 das 5 variações | Alta | ✅ |
| RN-13 | Mínimo 7 jogos por variação para garantir característica "Big Odd" | Alta | ✅ |

### 6.2 Regras de Calibração (ABQC)

| ID | Regra | Severidade | Testável |
|----|-------|------------|----------|
| RN-14 | Peso mínimo de qualquer fator: 3% | Bloqueante | ✅ |
| RN-15 | Peso máximo de qualquer fator: 30% | Bloqueante | ✅ |
| RN-16 | Máximo ±5 pontos percentuais de ajuste por rodada em um mesmo fator | Alta | ✅ |
| RN-17 | Soma dos pesos após calibração DEVE ser normalizada para 100 | Bloqueante | ✅ |
| RN-18 | Máximo 3 ajustes consecutivos na mesma direção sem evidência nova | Alta | ✅ |

### 6.3 Regras de Acesso

| ID | Regra | Severidade | Testável |
|----|-------|------------|----------|
| RN-19 | Apenas emails na whitelist acessam o dashboard | Bloqueante | ✅ |
| RN-20 | Admin `nilson.brites@gmail.com` é imutável — não pode ser removido, desativado ou rebaixado | Bloqueante | ✅ |
| RN-21 | OTP expira em 60 minutos | Alta | ✅ |
| RN-22 | Sessão expira em 7 dias de inatividade | Média | ⬜ |

### 6.4 Regras de Comunicação (Personalidade)

| ID | Regra | Severidade | Testável |
|----|-------|------------|----------|
| RN-23 | BOB NUNCA usa linguagem de cassino ("aposte agora", "lucro garantido", "dinheiro fácil") | Bloqueante | ✅ Prompt |
| RN-24 | BOB NUNCA promete ganho financeiro | Bloqueante | ✅ Prompt |
| RN-25 | BOB SEMPRE mantém tom positivo, mesmo em rodadas com erros | Alta | ✅ Prompt |
| RN-26 | BOB admite erros honestamente — "Errei, aprendi X, ajustei Y" | Alta | ✅ Prompt |
| RN-27 | Personalidade quântica é IRREVOGÁVEL — não pode ser removida ou diluída em nenhuma release | Bloqueante | Manual |
| RN-28 | Chat restrito a futebol brasileiro, apostas esportivas e método BOB | Alta | ✅ Prompt |
| RN-29 | Máximo 200 palavras por resposta do chat (a menos que usuário peça mais) | Média | ✅ Config |

### 6.5 Regras de Segurança

| ID | Regra | Severidade | Testável |
|----|-------|------------|----------|
| RN-30 | Motor de scoring, variações e calibração: server-only (NUNCA no client bundle) | Bloqueante | ✅ |
| RN-31 | API keys NUNCA expostas no client-side | Bloqueante | ✅ |
| RN-32 | Todas as API routes protegidas DEVEM validar sessão/JWT | Bloqueante | ✅ |
| RN-33 | Input do chat limitado a 2000 caracteres por mensagem | Alta | ✅ |
| RN-34 | Histórico do chat limitado a 12 mensagens no contexto da LLM | Alta | ✅ |
| RN-35 | Cron jobs protegidos por `Authorization: Bearer CRON_SECRET` | Bloqueante | ✅ |

---

## 7. REQUISITOS NÃO FUNCIONAIS (RNF)

> Baseados na taxonomia ISO/IEC 25010 e diagrama de requisitos não funcionais do produto.

### 7.1 Usabilidade

| ID | Requisito | Métrica | Meta |
|----|-----------|---------|------|
| RNF-01 | **Facilidade de aprender:** Novo usuário deve entender o dashboard em ≤ 2 minutos | Tempo até primeira interação significativa | ≤ 120s |
| RNF-02 | **Facilidade de usar:** Usuário encontra variações e âncoras sem scroll excessivo | Cliques até variação desejada | ≤ 3 cliques |
| RNF-03 | **Tooltips e glossário** disponíveis para todos os termos técnicos | Cobertura de termos | 100% |
| RNF-04 | **Mobile-first:** Toda page usável em viewport 375px+ | Breakpoints responsivos | 375px, 640px, 1024px, 1280px |
| RNF-05 | **Acessibilidade:** Contraste WCAG AA, aria-labels em botões interativos | Score Lighthouse Accessibility | ≥ 90 |

### 7.2 Manutenibilidade

| ID | Requisito | Métrica | Meta |
|----|-----------|---------|------|
| RNF-06 | **Reparo:** Bug crítico (P0) identificado ao deploy deve ser corrigível em ≤ 4h | Tempo de resolução de P0 | ≤ 4h |
| RNF-07 | **Evolução:** Adicionar novo fator ao scoring deve exigir alteração em ≤ 3 arquivos | Arquivos afetados por novo fator | ≤ 3 |
| RNF-08 | **Modularidade:** Cada conector (API) é independente — falha de um não afeta outros | Acoplamento | Loose coupling |
| RNF-09 | **Documentação:** Funções públicas do motor devem ter JSDoc mínimo | Cobertura JSDoc | ≥ 80% motor |

### 7.3 Confiabilidade

| ID | Requisito | Métrica | Meta |
|----|-----------|---------|------|
| RNF-10 | **Disponibilidade:** App deve estar acessível 99% do tempo (exceto deploys) | Uptime Vercel | ≥ 99% |
| RNF-11 | **Taxa de falhas:** Falha de API externa não deve crashar o app — fallback demo | Taxa de crash | 0 crashes |
| RNF-12 | **Graceful degradation:** Sem Claude → usa GPT; sem GPT → determinístico; sem APIs → demo | Cascata de fallback | 3 níveis |
| RNF-13 | **Idempotência:** Mesma rodada/temporada processada duas vezes deve gerar resultado idêntico | Determinismo do motor | 100% |

### 7.4 Desempenho

| ID | Requisito | Métrica | Meta |
|----|-----------|---------|------|
| RNF-14 | **Dashboard TTI:** Tempo até interativo no desktop | Time to Interactive | ≤ 3s |
| RNF-15 | **Dashboard TTI mobile:** Tempo até interativo em 4G | Time to Interactive (mobile) | ≤ 5s |
| RNF-16 | **Chat response time:** Resposta do BOB no chat | Latência P95 | ≤ 8s |
| RNF-17 | **Motor de scoring:** Processar 10 jogos + 5 variações | Tempo de computação | ≤ 500ms |
| RNF-18 | **Caching:** Narrativa e standings devem usar cache de 24h e 1h respectivamente | Cache hit rate | ≥ 80% |
| RNF-19 | **Bundle size:** JS total do client (gzipped) | Bundle size | ≤ 300KB |

### 7.5 Portabilidade

| ID | Requisito | Métrica | Meta |
|----|-----------|---------|------|
| RNF-20 | **Browsers:** Chrome 90+, Safari 15+, Firefox 100+, Edge 90+ | Compatibilidade | 4 browsers |
| RNF-21 | **PWA:** Instalável como app em iOS e Android | PWA score Lighthouse | ≥ 90 |
| RNF-22 | **Responsivo:** De 375px (iPhone SE) a 2560px (4K) | Range de viewports | Testado |

### 7.6 Segurança

| ID | Requisito | Métrica | Meta |
|----|-----------|---------|------|
| RNF-23 | **OWASP Top 10:** Nenhuma vulnerabilidade conhecida no deploy | Scan SAST | 0 critical |
| RNF-24 | **XSS:** Input sanitizado em chat e admin. Markdown renderizado com sanitizer | Vetores testados | 0 exploits |
| RNF-25 | **CSRF:** Supabase Auth com cookies httpOnly + sameSite | — | Implementado |
| RNF-26 | **Secrets:** Zero secrets no client bundle ou no Git | Scan de secrets | 0 leaks |
| RNF-27 | **Rate limiting:** Máximo 60 req/min por IP em rotas de API | Limite | 60 rpm |

### 7.7 Reusabilidade

| ID | Requisito | Métrica | Meta |
|----|-----------|---------|------|
| RNF-28 | **Componentes UI:** SectionCard, VariationCard, ChatWidget são genéricos e reutilizáveis | Props tipadas | Sim |
| RNF-29 | **Motor:** `scoring.ts` e `variations.ts` são independentes do framework (Next.js) | Dependências de framework no motor | 0 |
| RNF-30 | **Conectores:** Cada conector é um módulo independente com interface estável | Interface padronizada | `fetch → normalize → MatchInput` |

---

## 8. CRITÉRIOS DE ACEITE (CA) POR FEATURE

### CA-01: Motor de Variações (RF-04, RN-08)

```gherkin
Funcionalidade: Geração de 5 variações distintas
  
  Cenário: V3 e V4 NÃO podem ser idênticos
    Dado que a rodada tem 10 jogos e 4 âncoras selecionadas
    Quando o motor gera as 5 variações
    Então V3 e V4 devem ter sobreposição de picks < 70%
    E cada variação deve ter perfil de risco visualmente distinto

  Cenário: Pool pequeno (6 jogos)
    Dado que após exclusões restam apenas 6 jogos elegíveis
    Quando o motor gera as 5 variações
    Então NENHUM par de variações deve ter sobreposição > 70%
    E cada variação ainda respeita o piso de odd mínimo

  Cenário: Zero âncoras elegíveis
    Dado que nenhum jogo atinge score ≥ 60 com resultado "1" e odd ≤ 2.20
    Quando o motor tenta gerar variações
    Então o sistema exibe mensagem BOB: "Rodada sem âncoras claras — aqui a gente observa"
    E NÃO gera variações forçadas

  Cenário: Clássico com score alto
    Dado que Flamengo x Fluminense tem score bruto de 72
    Quando o motor aplica RN-05
    Então o score é capped em 55
    E o jogo NÃO é elegível como âncora
```

### CA-02: Chat com Markdown (RF-22)

```gherkin
Funcionalidade: Chat renderiza markdown

  Cenário: Resposta com negrito
    Dado que o BOB responde com "Os **4 âncoras** da rodada são..."
    Quando a mensagem é renderizada no widget
    Então "4 âncoras" aparece em negrito (tag <strong>)
    E NÃO aparecem asteriscos literais

  Cenário: Resposta com lista
    Dado que o BOB responde com "Fatores:\n- Forma recente\n- Mando de campo"
    Quando a mensagem é renderizada
    Então os itens aparecem como lista não ordenada (<ul><li>)

  Cenário: Resposta com link
    Dado que o BOB inclui um link na resposta
    Quando a mensagem é renderizada
    Então o link é clicável e abre em nova aba (target="_blank")
    E tem rel="noopener noreferrer" por segurança
```

### CA-03: Âncoras Interativas (RF-21)

```gherkin
Funcionalidade: Aceitar/Rejeitar/Explicar âncoras

  Cenário: Rejeitar âncora
    Dado que o usuário vê 4 âncoras na rodada
    Quando clica em [❌] na âncora "Palmeiras vs Cuiabá"
    Então a âncora é removida visualmente
    E as variações são recalculadas em tempo real (sem reload)
    E a URL atualiza com &excluded=<matchId>

  Cenário: Explicar âncora
    Dado que o usuário vê a âncora "Flamengo vs Juventude" com score 77
    Quando clica em [ℹ️]
    Então expande um painel com os 15 fatores
    E cada fator mostra: nome, peso, score individual, barra de progresso

  Cenário: Aceitar âncora
    Dado que o usuário clica em [✅] na âncora
    Então o botão muda para estado "confirmado" (visual feedback)
    E NÃO altera nenhum cálculo (é apenas feedback visual)
```

### CA-04: Histórico de Variações (RF-26)

```gherkin
Funcionalidade: Visualização de variações passadas com green/red

  Cenário: Pick acertou
    Dado que na rodada 5 o pick "Palmeiras vitória" se confirmou
    Quando o usuário visualiza a rodada 5 no histórico
    Então o pick aparece com badge verde ✅

  Cenário: Pick errou
    Dado que na rodada 5 o pick "Santos vitória" não se confirmou (empate)
    Quando o usuário visualiza a rodada 5
    Então o pick aparece com badge vermelho ❌

  Cenário: Variação vencedora
    Dado que na rodada 5 TODOS os picks da V2 acertaram
    Quando o usuário visualiza a rodada 5
    Então o card da V2 aparece com destaque dourado e badge "🏆 Vencedora"

  Cenário: Rodada em andamento
    Dado que a rodada 12 tem 3 jogos finalizados e 7 pendentes
    Quando o usuário visualiza a rodada 12
    Então picks finalizados mostram verde/vermelho
    E picks pendentes mostram badge cinza ⏳
```

### CA-05: Simulação Retroativa Cega (RF-28)

```gherkin
Funcionalidade: BOB simula rodadas passadas sem ver resultados

  Cenário: Simulação de rodada passada
    Dado que a rodada 3 já tem resultados registrados
    Quando o BOB executa simulação cega da rodada 3
    Então busca dados PRÉ-jogo da rodada 3 (standings, forma, H2H)
    E gera âncoras e variações como se fosse ao vivo
    E compara com resultados reais
    E registra acurácia em `simulation_results`

  Cenário: Ordem de simulação
    Dado que as rodadas 1 e 2 ainda não foram simuladas
    Quando o cron de simulação executa
    Então simula a rodada 1 primeiro
    E NÃO pula para a rodada 3
```

### CA-06: Abertura Diária (RF-27)

```gherkin
Funcionalidade: Saudação BOB na primeira visita do dia

  Cenário: Primeira visita do dia
    Dado que o usuário não acessou nas últimas 24h
    Quando abre o dashboard
    Então vê um card de abertura com:
      - Avatar bob-logo.png
      - Frase motivacional positiva
      - Status da rodada (número, data, # âncoras)
    E o card pode ser fechado (dismiss)
    E NÃO aparece novamente nas próximas 24h

  Cenário: Segunda visita no mesmo dia
    Dado que o usuário acessou há 3 horas
    Quando abre o dashboard novamente
    Então NÃO vê card de abertura
    E vai direto para o conteúdo da rodada
```

### CA-07: Página de Estatísticas (RF-25)

```gherkin
Funcionalidade: Análise individual por jogo

  Cenário: Grid de jogos
    Dado que a rodada 12 tem 10 jogos
    Quando o usuário acessa /estatisticas
    Então vê grid 2×5 (desktop) ou 1×10 (mobile) de cards
    E cada card mostra: escudos, nomes, probabilidades previstas

  Cenário: Detalhe do jogo
    Dado que o usuário clica em "Palmeiras x Cuiabá"
    Quando o modal/page abre
    Então vê: H2H (últimos 5), forma de cada time, 15 fatores com scores
    E vê previsão BOB: "Vitória Mandante (78%) | Empate (14%) | Visitante (8%)"
    E vê score de confiança e explicação em 2-3 frases

  Cenário: Acesso público negado
    Dado que o usuário NÃO está logado
    Quando tenta acessar /estatisticas
    Então é redirecionado para /login
```

---

## 9. DEFINITION OF DONE (DoD)

> Aplicável a TODO item de trabalho (bug fix, feature, melhoria). Um item SÓ é "Done" quando TODOS os critérios abaixo estão satisfeitos.

### 9.1 DoD — Código

- [ ] Código implementado e compila sem erros (`npx next build` limpo)
- [ ] ESLint sem erros e sem warnings novos introduzidos
- [ ] TypeScript strict — zero erros de tipo
- [ ] Sem `any` desnecessário ou `@ts-ignore`
- [ ] Funções do motor têm testes unitários correspondentes (TDD)
- [ ] Componentes de UI testados visualmente em 375px e 1280px
- [ ] Sem secrets expostos no código ou console.log com dados sensíveis

### 9.2 DoD — Qualidade

- [ ] Critérios de Aceite (CA) correspondentes verificados e passando
- [ ] Regras de Negócio (RN) impactadas verificadas e não violadas
- [ ] Testes de regressão passando (nenhum teste existente quebrado)
- [ ] Edge cases cobertos (input vazio, API offline, pool pequeno)
- [ ] Error states tratados com tom BOB (positivo, não técnico)

### 9.3 DoD — Revisão

- [ ] Código revisado (self-review para equipe de 1 pessoa)
- [ ] Checklist de segurança do item verificado (OWASP Top 10 relevante)
- [ ] Lógica server-only validada (scoring, variações, calibração não no client)
- [ ] Nome "Big Odds Brasileirão" verificado (nenhum "Bot" introduzido)

### 9.4 DoD — Deploy

- [ ] Build de produção (`next build`) sem erros
- [ ] Deploy na Vercel sem falhas
- [ ] Funcionalidade verificada em produção (smoke test)
- [ ] Migrations de banco aplicadas (se houver)
- [ ] Documentação atualizada (`PLANO-V3-DEFINITIVO.md` checkboxes marcados)

### 9.5 DoD — Persistência

- [ ] Commit com mensagem clara: `feat|fix|chore(escopo): descrição`
- [ ] Memória do repositório atualizada se mudança significativa

---

## 10. ESTRATÉGIA DE TESTES (TDD)

### 10.1 Filosofia

**Test-Driven Development** para o motor analítico (camada 1). O motor é a alma do BOB — deve ser determinístico, reprodutível e auditável. Testes primeiro, implementação depois.

Para UI e integrações: **test-after** pragmático com foco em behavior, não implementação.

### 10.2 Pirâmide de Testes

```
                    ╱ ╲
                   ╱ E2E ╲          → 2-3 cenários críticos (Playwright)
                  ╱───────╲
                 ╱Integration╲      → Pipeline completo (fetch → score → vary)
                ╱─────────────╲
               ╱   Unit Tests   ╲   → Motor, scoring, variações, calibração
              ╱───────────────────╲
             ╱   Static Analysis   ╲ → TypeScript strict + ESLint
            ╱───────────────────────╲
```

### 10.3 Testes Unitários (Motor — TDD Obrigatório)

| Arquivo sob teste | Arquivo de teste | Cenários |
|-------------------|------------------|----------|
| `scoring.ts` | `__tests__/scoring.test.ts` | Cenários abaixo |
| `variations.ts` | `__tests__/variations.test.ts` | Cenários abaixo |
| `calibrator.ts` | `__tests__/calibrator.test.ts` | Cenários abaixo |
| `personality.ts` | `__tests__/personality.test.ts` | Cenários abaixo |

#### scoring.test.ts — Cenários TDD

```typescript
describe("scoreMatch", () => {
  test("time líder em casa contra lanterna deve ter score > 70");
  test("time do Z4 fora contra líder deve ter score < 40");
  test("clássico regional deve ter score capped em 55 (RN-05)");
  test("jogo com mandante sem forma (array vazio) deve retornar score baseado nos outros fatores");
  test("todos os fatores zero deve resultar em score 0");
  test("todos os fatores máximos deve resultar em score ~85-95");
  test("form com 5W consecutivos deve dar recentForm próximo de 1.0");
  test("momentum positivo (form5 > form10) deve bonificar score");
  test("momentum negativo (form5 < form10) deve penalizar score");
  test("absenceRate 0.5 deve gerar penalidade severa (~30% do peso)");
  test("homeOdd < 1.20 deve indicar mercado fortemente favorável");
});

describe("selectAnchors", () => {
  test("deve retornar máximo 4 âncoras") // RN-02
  test("todas âncoras devem ter score >= 60") // RN-03
  test("todas âncoras devem ter odd <= 2.20") // RN-04
  test("todas âncoras devem ter resultado sugerido '1'") // RN-11
  test("todas âncoras devem ter value edge positivo") // RN-06
  test("clássico nunca aparece como âncora") // RN-05
  test("com 10 jogos elegíveis retorna os top 4 por score")
  test("com 0 jogos elegíveis retorna array vazio")
  test("com 2 jogos elegíveis retorna exatamente 2")
  test("ordenação é estável — mesmos inputs geram mesma ordem")
});
```

#### variations.test.ts — Cenários TDD

```typescript
describe("generateVariations", () => {
  test("deve gerar exatamente 5 variações") // RN-01
  test("V1 deve ter postura conservadora com piso >= 500x") // RN-09
  test("V2 deve ter postura equilibrada com piso >= 800x")
  test("V3 deve ser lógica pura com piso >= 800x")
  test("V4 deve ser curta com piso >= 1000x")
  test("V5 deve ser extrema com piso >= 1000x")
  test("nenhum par de variações deve ter sobreposição > 70%") // RN-08
  test("âncoras devem aparecer em >= 3 das 5 variações") // RN-12
  test("cada variação deve ter >= 7 jogos") // RN-13
  test("motor é determinístico — mesma entrada gera mesma saída") // RNF-13
  test("pool de 6 jogos + 3 âncoras ainda gera 5 variações distintas")
  test("pool de 4 jogos (mínimo) ainda gera variações")
});

describe("boostToFloor", () => {
  test("picks com odd abaixo do piso são substituídos por draws/upsets")
  test("substituição prioriza fills sobre âncoras")
  test("se impossível atingir piso, retorna melhor esforço sem loop infinito")
});
```

#### calibrator.test.ts — Cenários TDD

```typescript
describe("selfCalibrate", () => {
  test("fator com alta acurácia ganha peso") // RN-14/15/16
  test("fator com baixa acurácia perde peso")
  test("peso nunca cai abaixo de 3%") // RN-14
  test("peso nunca sobe acima de 30%") // RN-15
  test("ajuste máximo de ±5pp por rodada") // RN-16
  test("soma dos pesos após calibração = 100") // RN-17
  test("3 ajustes consecutivos na mesma direção sem evidência nova bloqueia") // RN-18
  test("sem resultados registrados, retorna pesos inalterados")
});
```

#### personality.test.ts — Cenários TDD

```typescript
describe("BOB_TRAITS", () => {
  test("nomeCompleto deve ser 'Big Odds Brasileirão' (nunca 'Bot')")
  test("BOB_FAITH deve existir e ter propriedades: fe, principio, frequencia")
  test("BOB_SYSTEM_PROMPT não deve conter palavras proibidas: 'aposte agora', 'lucro garantido', 'dinheiro fácil'") // RN-23/24
  test("aberturaDiaria deve retornar string não vazia com rodada")
  test("tom.erro deve ser positivo (não conter 'falha', 'problema', 'impossível')")
});
```

### 10.4 Testes de Integração

| Cenário | Módulos testados | Tipo |
|---------|------------------|------|
| Pipeline completo da rodada | connectors → scoring → selectAnchors → generateVariations | Integration |
| Chat com brain context | chat/route.ts → connectors → scoring → LLM | Integration |
| Calibração pós-rodada | backtest → calibrator → persist-weights | Integration |
| Login + whitelist | auth callback → whitelist check → redirect | Integration |

```typescript
describe("Pipeline de rodada", () => {
  test("dados reais processados geram 4 âncoras e 5 variações válidas")
  test("sem FOOTBALL_DATA_TOKEN, fallback demo gera variações válidas")
  test("API timeout não causa crash — usa demo graciosamente")
});
```

### 10.5 Testes E2E (Playwright)

| Cenário | Fluxo |
|---------|-------|
| E2E-01: Login completo | `/login` → inserir email → OTP → `/dashboard` |
| E2E-02: Dashboard renderiza | `/dashboard` mostra âncoras + variações + narrativa |
| E2E-03: Chat funcional | Abrir widget → enviar msg → receber resposta formatada |
| E2E-04: Exclusão de âncora | Dashboard → excluir match → variações recalculam |
| E2E-05: Mobile responsive | Dashboard em 375px não tem overflow horizontal |

### 10.6 Testes de Segurança

| Cenário | Tipo | Alvo |
|---------|------|------|
| SEC-01 | XSS no chat | Enviar `<script>alert('xss')</script>` como mensagem |
| SEC-02 | Auth bypass | Acessar `/dashboard` sem sessão → deve redirecionar |
| SEC-03 | Cron sem token | POST `/api/cron/revalidate` sem CRON_SECRET → 401 |
| SEC-04 | Client bundle | Verificar que `scoring.ts` NÃO aparece no bundle JS do client |
| SEC-05 | SQL Injection | Input com `'; DROP TABLE users;--` no chat → sanitizado |

### 10.7 Setup de Testes

```bash
# Dependências
npm install -D vitest @testing-library/react @playwright/test

# Scripts em package.json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test",
"test:coverage": "vitest run --coverage"
```

**Meta de cobertura:**

| Camada | Cobertura mínima |
|--------|------------------|
| Motor (scoring, variations, calibrator) | ≥ 90% |
| Conectores (fetch, normalize) | ≥ 70% |
| AI (narrative, cognitive) | ≥ 50% (mocks de LLM) |
| UI (componentes) | ≥ 40% |
| E2E | 5 cenários críticos |

---

## 11. REGRAS GERAIS DO PRODUTO

### 11.1 Princípios de Design

| # | Princípio | Implicação |
|---|-----------|------------|
| P1 | **Determinismo primeiro** | Motor de scoring é regra, LLM é enriquecimento |
| P2 | **Fallback gracioso** | Toda API externa tem fallback — app NUNCA crasha |
| P3 | **Mobile-first** | Toda tela é desenhada para mobile e adaptada para desktop |
| P4 | **Servidor protege** | Lógica sensível (scoring, pesos) NUNCA vai para o client |
| P5 | **Economia inteligente** | APIs free primeiro; custo de IA < R$50/temporada |
| P6 | **Evidência > opinião** | Calibração por dados (backtest), não por "achismo" |
| P7 | **Consistência de nome** | "Big Odds Brasileirão" em TODO lugar — verificar a cada deploy |

### 11.2 Padrões de Código

| Item | Padrão |
|------|--------|
| Linguagem | TypeScript strict em todo o projeto |
| Framework CSS | Tailwind CSS com design tokens customizados |
| Importações | Alias `@/` para `src/` |
| DB client | Singleton `db.ts` com `PrismaClient` importado de `@/generated/prisma` |
| API routes | NextResponse para todas as respostas; always validate input |
| Commits | `feat|fix|chore|refactor(escopo): mensagem` |
| Branches | `main` (produção), feature branches para trabalho em andamento |

### 11.3 Tratamento de Erros

| Cenário | Comportamento |
|---------|---------------|
| API football-data.org offline | Fallback para dados demo + banner "Dados demonstrativos" |
| Claude offline | Fallback para GPT-4o-mini |
| GPT-4o-mini offline | Fallback para reflexão determinística |
| Todas LLMs offline | Chat retorna "Estou offline agora — volto em breve" |
| Supabase offline | Middleware redireciona para página de erro amigável |
| Input inválido no chat | Rejeitar com mensagem BOB amigável |
| Rodada sem âncoras | Exibir mensagem BOB: "Rodada sem âncoras claras" |
| Rate limit atingido | 429 com retry-after header |

### 11.4 Convenções de Nomenclatura

| Elemento | Convenção | Exemplo |
|----------|-----------|---------|
| Componentes React | PascalCase | `VariationCard` |
| Funções | camelCase | `selectAnchors()` |
| Constantes | UPPER_SNAKE | `ANCHOR_THRESHOLD` |
| Arquivos TS | kebab-case | `scoring.ts`, `chat-widget.tsx` |
| Tabelas DB | snake_case | `factor_weights` |
| Colunas DB | snake_case | `projected_odd` |
| Env vars | UPPER_SNAKE | `FOOTBALL_DATA_TOKEN` |
| Rotas API | kebab-case | `/api/bob/chat` |

---

## 12. MATRIZ DE RASTREABILIDADE

> Mapeamento: User Story → Requisito Funcional → Regra de Negócio → Critério de Aceite → Teste

| User Story | RF | RN | CA | Teste | Sprint |
|------------|----|----|----|----|--------|
| US-05 (5 variações) | RF-03 | RN-01, RN-09 | CA-01 | variations.test | MVP ✅ |
| US-06 (âncoras) | RF-02 | RN-02, RN-03, RN-04, RN-05, RN-06 | CA-01 | scoring.test | MVP ✅ |
| US-07 (variações distintas) | RF-04 | RN-08 | CA-01 | variations.test | S1 |
| US-09 (data real) | RF-19 | — | CA-06 | E2E-02 | S1 |
| US-10 (aceitar/rejeitar) | RF-21 | — | CA-03 | E2E-04 | S3 |
| US-12 (escudos) | RF-20 | — | — | E2E-02 | S3 |
| US-15 (markdown chat) | RF-22 | — | CA-02 | E2E-03 | S1 |
| US-16 (persistência chat) | RF-23 | — | — | Unit | S1 |
| US-19 (estatísticas) | RF-25 | RN-19 | CA-07 | E2E | S5 |
| US-22 (histórico) | RF-26 | — | CA-04 | E2E | S7 |
| US-23 (green/red picks) | RF-26 | — | CA-04 | Unit | S7 |
| US-26 (calibração auto) | RF-07 | RN-14-18 | CA-05 | calibrator.test | S4 |
| US-28 (simulação cega) | RF-28 | — | CA-05 | integration | S4 |
| US-34 (abertura diária) | RF-27 | RN-25 | CA-06 | personality.test | S1 |
| US-35 (personalidade) | — | RN-23-27 | — | personality.test | S1 |

---

---

## 13. PLANO DE FASES DE DESENVOLVIMENTO

### 13.1 Estado Atual do Produto

```
████████████████░░░░░░░░░░░░░░  ~45% completo
├── R1 (MVP)           ████████ 100%  ✅ Entregue
├── R2 (Inteligência)  ██████░░  75%  ⚙️ Backend pronto, UI pendente
├── R3 (Produto)       ░░░░░░░░   0%  ⬜ Planejado (Sprint 1-3)
├── R4 (Autonomia)     ░░░░░░░░   0%  ⬜ Planejado (Sprint 4-5)
└── R5 (Completude)    ░░░░░░░░   0%  ⬜ Planejado (Sprint 6-8)
```

#### O que já funciona (Releases R1 + R2 parcial)

| Funcionalidade | Status | Evidência |
|----------------|--------|-----------|
| Auth Magic Link + Whitelist | ✅ Funcional | Login + redirect |
| Dashboard com âncoras e variações | ✅ Funcional | `/dashboard` renderiza SSR |
| Motor 10 fatores (scoring.ts) | ✅ Funcional | Gera scores 0-100 |
| Gerador de 5 variações (variations.ts) | ✅ Funcional | V1-V5 com pisos |
| Exclusão de âncora | ✅ Funcional | Query param `excluded=` |
| Chat com Claude→GPT fallback | ✅ Funcional | `/api/bob/chat` |
| Narrativa com GPT-4o-mini | ✅ Funcional | `narrative.ts` |
| Conector football-data.org | ✅ Funcional | BSA 2026 live |
| Conector TheSportsDB (escudos) | ✅ Fetch OK | Escudos não renderizados na UI |
| Prisma schema 14 modelos | ✅ Aplicado | `schema.prisma` + migrations |
| Personalidade BOB (personality.ts) | ✅ Arquivo existe | Wiring parcial |
| Backtest engine (backtest.ts) | ✅ Backend existe | Não conectado à UI |
| Forensic analysis (forensic.ts) | ✅ Backend existe | Não conectado à UI |
| Calibrador ABQC (calibrator.ts) | ✅ Backend existe | Não conectado à UI |
| Cognitive analyst (cognitive-analyst.ts) | ✅ Backend existe | Não conectado à UI |
| Dual-mind (dual-mind.ts) | ✅ Backend existe | Não conectado à UI |
| Self-reflection (self-reflection.ts) | ✅ Backend existe | Não conectado à UI |
| PWA icons + manifest | ✅ Existe | Configurado |

#### O que NÃO funciona / Bugs conhecidos

| Problema | Impacto | Sprint |
|----------|---------|--------|
| V3 e V4 geram picks idênticos com pool pequeno | 🔴 Credibilidade | S1 |
| Chat renderiza plain text (sem markdown) | 🔴 UX quebrada | S1 |
| "T-1h do primeiro bloco" hardcoded | 🟡 Informação falsa | S1 |
| Odds estimadas, não reais | 🟡 Precisão | S2 |
| `absenceRate` sempre 0 | 🟡 Motor incompleto | S2 |
| `bigGameAhead` sempre false | 🟡 Motor incompleto | S2 |
| Escudos carregados mas nunca renderizados | 🟡 UX incompleta | S3 |
| Backend inteligente desconectado da UI | 🟡 Investimento perdido | S8 |

---

### 13.2 Mapeamento: Fases Legadas → Sprints → Releases

As fases originais (0-16, PLANO-MESTRE.md) foram reorganizadas em Sprints orientados a produto:

| Fase Legada (PLANO-MESTRE) | Status Real | Sprint V3 | Release |
|----------------------------|-------------|-----------|---------|
| F0-F8: Infraestrutura + MVP | ✅ Concluída | — | R1 ✅ |
| F9: Estabilização | ✅ ~90% feita | Resíduos em S1 | R3 |
| F10: Motor 15+ fatores | ⚙️ ~40% (10 de 15) | S2 | R3 |
| F11: Backtesting | ⚙️ Backend 100% | S4 (wiring UI) | R4 |
| F12: Memória + ABQC | ⚙️ Backend 100% | S4 (wiring UI) | R4 |
| F13: Auto-Reflexão | ⚙️ Backend existe | S8 (wiring UI) | R5 |
| F14: Autonomia Total | ⬜ Não iniciada | S4 + S8 (crons) | R4-R5 |
| F15: Proatividade + Chat | ⬜ Chat parcial | S1 (chat) + S3 (proatividade) | R3 |
| F16: Beta Aberto | ⬜ Não iniciada | S8 (polimento) | R5 |

---

### 13.3 Roadmap Detalhado por Fase

---

#### FASE A — Correções Críticas e Base Sólida

> **Release:** R3 · **Sprint:** 1 · **Prioridade:** 🔴 BLOQUEADOR
> **Pré-requisito:** Nenhum (pode começar agora)
> **Dependências downstream:** S2, S3, S4, S5, S6, S7, S8 — TODOS dependem de S1

**Objetivo:** Corrigir bugs que destroem credibilidade e implementar base de personalidade real.

| # | Entrega | US | RF | Teste | Status |
|---|---------|----|----|-------|--------|
| A1 | Fix V3≠V4 (diversificação real) | US-07 | RF-04 | variations.test | ⬜ |
| A2 | Chat com Markdown (react-markdown) | US-15 | RF-22 | E2E-03 | ⬜ |
| A3 | Remover "T-1h" hardcoded → data real | US-09 | RF-19 | E2E-02 | ⬜ |
| A4 | Persistência do chat (localStorage) | US-16 | RF-23 | Unit | ⬜ |
| A5 | BOB_FAITH em personality.ts | US-35 | — | personality.test | ⬜ |
| A6 | Abertura diária no dashboard | US-34 | RF-27 | personality.test | ⬜ |
| A7 | Revisar tom de erros (positivo sempre) | US-35 | — | personality.test | ⬜ |

**Critério de Saída (Exit Criteria):**
- [ ] Zero bugs 🔴 Crítico remanescentes
- [ ] Chat renderiza bold, listas, tabelas
- [ ] Dashboard mostra data real do primeiro jogo
- [ ] Teste: `npm test` passa com ≥ 80% cobertura em variations.ts + personality.ts
- [ ] Deploy Vercel funcional

**Entregável de validação:** Dashboard com 5 variações DISTINTAS, chat formatado, data real, personalidade BOB_FAITH ativa.

---

#### FASE B — Expansão de Inteligência

> **Release:** R3 · **Sprint:** 2 · **Prioridade:** 🟡 ALTA
> **Pré-requisito:** Fase A concluída e deployada
> **Dependências downstream:** S4 (calibração precisa de 15 fatores)

**Objetivo:** Motor com 15+ fatores, dados de clima, backfill histórico, knowledge graph.

| # | Entrega | US | RF | Teste | Status |
|---|---------|----|----|-------|--------|
| B1 | Fator 11: Árbitro | US-03 | RF-01 | scoring.test | ⬜ |
| B2 | Fator 12: Clima (open-meteo.com) | US-03 | RF-01 | scoring.test | ⬜ |
| B3 | Fator 13: Calendário paralelo | US-03 | RF-01 | scoring.test | ⬜ |
| B4 | Fator 14: Pressão de posição | US-03 | RF-01 | scoring.test | ⬜ |
| B5 | Fator 15: Histórico no estádio | US-03 | RF-01 | scoring.test | ⬜ |
| B6 | Conector weather.ts | — | RF-12 | integration | ⬜ |
| B7 | Backfill 2023-2025 (API-Football) | — | RF-15 | integration | ⬜ |
| B8 | Knowledge Graph (memory_nodes + edges) | — | RF-16 | integration | ⬜ |
| B9 | Redistribuir pesos (soma = 100) | — | RN-17 | calibrator.test | ⬜ |
| B10 | Fix: odds reais, absenceRate, bigGameAhead | — | RF-01 | scoring.test | ⬜ |

**Critério de Saída:**
- [ ] `scoring.ts` usa 15 fatores com pesos que somam 100
- [ ] Clima integrado: chuva forte reduz confiança do mandante
- [ ] Teste comparativo: âncoras com 10 vs 15 fatores em 3 rodadas reais
- [ ] historical_results populado com ≥ 1 temporada
- [ ] Migration 004 aplicada no Supabase

**Entregável de validação:** Motor scoring rodada real com 15 fatores gerando âncoras mais precisas que o motor de 10 fatores.

---

#### FASE C — Dashboard Premium

> **Release:** R3 · **Sprint:** 3 · **Prioridade:** 🟡 ALTA
> **Pré-requisito:** Fase B concluída (escudos + 15 fatores disponíveis)
> **Dependências downstream:** S5 (reutiliza componentes), S7 (reutiliza cards)

**Objetivo:** Redesenhar UI para qualidade de produto real — escudos, interatividade, visual premium.

| # | Entrega | US | RF | Teste | Status |
|---|---------|----|----|-------|--------|
| C1 | Renderizar escudos 32px (TheSportsDB) | US-12 | RF-20 | E2E-02 | ⬜ |
| C2 | Âncoras interativas (aceitar/rejeitar/info) | US-10 | RF-21 | E2E-04 | ⬜ |
| C3 | Breakdown de 15 fatores em modal | US-11 | RF-21 | E2E | ⬜ |
| C4 | Variações com visual premium | US-08 | RF-03 | E2E-02 | ⬜ |
| C5 | Indicador de risco visual (verde→vermelho) | US-08 | — | E2E-02 | ⬜ |
| C6 | Layout redesign (remover jargão técnico) | US-08 | RF-19 | E2E-05 | ⬜ |
| C7 | Narrativa BOB com avatar | US-34 | RF-27 | E2E-02 | ⬜ |
| C8 | Aplicar skill `premium-ui-layout` | — | — | Visual review | ⬜ |

**Critério de Saída:**
- [ ] Escudos renderizados em âncoras, variações e tabela de fatores
- [ ] Âncora clicável expande modal com 15 fatores (barras de progresso)
- [ ] Variações em cards com odd em destaque e indicador de risco
- [ ] Zero jargão técnico visível para o usuário final
- [ ] Mobile-first: sem overflow horizontal em 375px
- [ ] Revisão visual aprovada pelo PO

**Entregável de validação:** Dashboard com aparência de produto premium — escudos, interatividade, visual coeso. Screenshot comparativo antes/depois.

---

#### FASE D — Simulação e Autonomia

> **Release:** R4 · **Sprint:** 4 · **Prioridade:** 🟡 ALTA
> **Pré-requisito:** Fase B completa (15 fatores + histórico) + Fase C deployada
> **Dependências downstream:** S5 (estatísticas usam simulação), S8 (crons)

**Objetivo:** BOB simula rodadas passadas de forma cega, aprende com os resultados, e calibra pesos automaticamente.

| # | Entrega | US | RF | Teste | Status |
|---|---------|----|----|-------|--------|
| D1 | blind-simulation.ts (engine) | US-28 | RF-28 | integration | ⬜ |
| D2 | Simulação: gerar âncoras+variações sem ver resultado | US-28 | RF-28 | integration | ⬜ |
| D3 | Comparação: picks vs resultados reais | US-28 | — | integration | ⬜ |
| D4 | Migration: simulation_results | — | — | — | ⬜ |
| D5 | Wiring: calibrator.ts ← resultados simulação | US-26 | RF-07 | calibrator.test | ⬜ |
| D6 | Wiring: backtest.ts → UI admin | — | RF-07 | E2E | ⬜ |
| D7 | Dashboard admin: progresso simulação (X/38) | US-30 | RF-30 | E2E | ⬜ |
| D8 | Reflexão específica por simulação | US-29 | RF-09 | integration | ⬜ |

**Critério de Saída:**
- [ ] Simulação cega executa ≥ 3 rodadas históricas com resultado documentado
- [ ] Calibrador ajusta pesos com base em evidência da simulação
- [ ] Admin vê progresso "Rodada X de 38" com acurácia por rodada
- [ ] Reflexão pós-simulação registrada em `memory_events`
- [ ] Teste: calibração melhora acurácia ao longo de 5+ rodadas simuladas

**Entregável de validação:** Relatório mostrando "Antes da calibração: 55% acurácia. Depois: 65% acurácia" com dados reais simulados.

---

#### FASE E — Estatísticas Individuais

> **Release:** R4 · **Sprint:** 5 · **Prioridade:** 🟢 MÉDIA
> **Pré-requisito:** Fase C (componentes visuais) + Fase D (15 fatores calculados por jogo)
> **Dependências downstream:** Nenhuma (feature independente)

**Objetivo:** Página dedicada de análise detalhada de cada jogo da rodada.

| # | Entrega | US | RF | Teste | Status |
|---|---------|----|----|-------|--------|
| E1 | Página `/estatisticas` (autenticada) | US-19 | RF-25 | E2E | ⬜ |
| E2 | Grid de 10 jogos com escudos clicáveis | US-19 | RF-25 | E2E | ⬜ |
| E3 | Modal de análise: H2H, forma, fatores, previsão | US-20 | RF-25 | E2E | ⬜ |
| E4 | Previsão BOB para TODOS os 10 jogos | US-21 | — | integration | ⬜ |
| E5 | Score de confiança visual (baixa/média/alta) | US-20 | — | E2E | ⬜ |
| E6 | Explicação em 2-3 frases por jogo | US-20 | — | integration | ⬜ |

**Critério de Saída:**
- [ ] `/estatisticas` renderiza 10 jogos com escudos
- [ ] Clique em jogo abre modal com 15 fatores + previsão
- [ ] Previsão indica probabilidade (%) para cada resultado (1/X/2)
- [ ] Dados reais (não demo) quando `FOOTBALL_DATA_TOKEN` presente
- [ ] Responsivo mobile

**Entregável de validação:** Usuário navega Dashboard → Estatísticas → clica em jogo → vê análise completa com previsão e fatores.

---

#### FASE F — Features Complementares

> **Release:** R5 · **Sprint:** 6 · **Prioridade:** 🟢 MÉDIA
> **Pré-requisito:** Fase C (componentes base para tabela), Fase B (dados de posição/forma)
> **Dependências downstream:** Nenhuma

**Objetivo:** Tabela do campeonato, probabilidades, calendário, oportunidades de zebra.

| # | Entrega | US | RF | Teste | Status |
|---|---------|----|----|-------|--------|
| F1 | Flag "Oportunidade de Zebra" | US-24 | RF-24 | integration | ⬜ |
| F2 | Tabela do Brasileirão em tempo real | US-25 | — | E2E | ⬜ |
| F3 | Probabilidades de título/rebaixamento | — | — | integration | ⬜ |
| F4 | Calendário de jogos (visão mensal) | — | — | E2E | ⬜ |

**Critério de Saída:**
- [ ] Dashboard exibe "⚡ Oportunidade de Zebra" quando critérios atendidos
- [ ] Tabela com zonas coloridas (G4 verde, Z4 vermelho) atualizada por cache 1h
- [ ] Probabilidades como badge ao lado de cada time
- [ ] Calendário com indicador de jogos já analisados

**Entregável de validação:** Dashboard enriquecido com informações complementares que aumentam valor percebido sem poluir a experiência.

---

#### FASE G — Histórico e Rastreabilidade

> **Release:** R5 · **Sprint:** 7 · **Prioridade:** 🟢 MÉDIA
> **Pré-requisito:** Fase D (resultados de simulação) + picks com `actualResult` preenchido
> **Dependências downstream:** Fase H (métricas dependem de histórico)

**Objetivo:** Usuário vê track record completo — variações passadas com acerto/erro exibido.

| # | Entrega | US | RF | Teste | Status |
|---|---------|----|----|-------|--------|
| G1 | Página `/historico` (lista de rodadas) | US-22 | RF-26 | E2E | ⬜ |
| G2 | Variações com green/red por pick | US-23 | RF-26 | Unit | ⬜ |
| G3 | Green/red por variação inteira | US-23 | RF-26 | Unit | ⬜ |
| G4 | Destaque dourado para variação vencedora | US-23 | — | E2E | ⬜ |
| G5 | Métricas acumuladas (% acerto, evolução) | US-22 | RF-26 | integration | ⬜ |
| G6 | Gráfico de evolução de acurácia | US-26 | — | E2E | ⬜ |

**Critério de Saída:**
- [ ] `/historico` lista rodadas clicáveis com variações expandíveis
- [ ] Cada pick mostra ✅/❌/⏳ com escudo e odd
- [ ] Variação vencedora (todos picks corretos) tem card dourado
- [ ] Gráfico de linha mostra tendência de acurácia ao longo das rodadas
- [ ] Dados persistidos no banco (não calculados on-the-fly)

**Entregável de validação:** Usuário acessa `/historico`, clica em rodada passada, vê picks com acertos marcados e métricas acumuladas.

---

#### FASE H — Segurança, Wiring e Polimento

> **Release:** R5 · **Sprint:** 8 · **Prioridade:** 🟡 ALTA (segurança é alta, polimento é média)
> **Pré-requisito:** Todas as fases anteriores (A-G)
> **Dependências downstream:** Nenhuma — esta é a fase final

**Objetivo:** Proteger IP, conectar todo backend à UI, testes completos, polimento final.

| # | Entrega | US | RF | RN | Status |
|---|---------|----|----|----|----|
| H1 | Lógica server-only (scoring nunca no client) | — | — | RN-30 | ⬜ |
| H2 | Rate limiting 60 req/min por user | — | RF-32 | RNF-08 | ⬜ |
| H3 | JWT/session em TODAS rotas protegidas | — | RF-33 | RNF-09 | ⬜ |
| H4 | Ofuscar nomes de fatores no client | — | — | RN-30 | ⬜ |
| H5 | Wiring: cognitive-analyst.ts → dashboard | US-29 | RF-09 | — | ⬜ |
| H6 | Wiring: dual-mind.ts → pipeline rodada | US-29 | RF-09 | — | ⬜ |
| H7 | Wiring: self-reflection.ts → cron | US-29 | RF-09 | — | ⬜ |
| H8 | Wiring: aberturaDiaria() → greeting | US-34 | RF-27 | — | ⬜ |
| H9 | Wiring: calibrator.ts ABQC → cron | US-26 | RF-07 | — | ⬜ |
| H10 | Crons: T-48h, T-24h, T-1h, pós-rodada | US-31 | RF-29 | — | ⬜ |
| H11 | Testes unitários scoring.ts (10+ cases) | — | — | — | ⬜ |
| H12 | Testes unitários variations.ts | — | — | — | ⬜ |
| H13 | Testes integração pipeline completo | — | — | — | ⬜ |
| H14 | Testes E2E (5 cenários Playwright) | — | — | — | ⬜ |
| H15 | Mobile responsivo em todas as páginas | — | — | RNF-02 | ⬜ |
| H16 | Loading skeletons + error boundaries | — | — | RNF-04 | ⬜ |
| H17 | Acessibilidade (aria-labels, contraste) | — | — | RNF-03 | ⬜ |
| H18 | PWA verificado em iOS + Android | — | — | RNF-02 | ⬜ |

**Critério de Saída:**
- [ ] Bundle analysis: `scoring.ts` e `variations.ts` AUSENTES do client JS
- [ ] Pentest básico: SEC-01 a SEC-05 todos passam
- [ ] Todo backend inteligente (cognitive, dual-mind, reflection, calibrator) visível na UI
- [ ] 4 crons configurados e funcionais no Vercel
- [ ] `npm test` ≥ 85% cobertura no motor
- [ ] `npm run test:e2e` 5/5 green
- [ ] Zero overflow horizontal mobile em qualquer página
- [ ] PO aprova versão final para beta aberto

**Entregável de validação:** Produto seguro, completo, testado e pronto para beta com ≥6 usuários reais.

---

### 13.4 Timeline Visual

```
                    FASE A         FASE B         FASE C
                   Sprint 1       Sprint 2       Sprint 3
Release R3      ┌───────────┐  ┌───────────┐  ┌───────────┐
(Produto)       │ Fix bugs  │→ │ 15 fatores│→ │ Dashboard │
                │ Chat MD   │  │ Clima     │  │ Premium   │
                │ BOB_FAITH │  │ Backfill  │  │ Escudos   │
                └───────────┘  └───────────┘  └───────────┘
                      │
                      ▼ BLOQUEADOR — sem Fase A, nada avança
                                       │              │
                    FASE D             │         FASE E│
                   Sprint 4            │        Sprint 5
Release R4      ┌───────────┐         │     ┌───────────┐
(Autonomia)     │ Simulação │◄────────┘     │Estatísticas│
                │ Calibração│               │ por jogo   │
                │ ABQC wire │               └───────────┘
                └───────────┘
                      │
                    FASE F         FASE G         FASE H
                   Sprint 6       Sprint 7       Sprint 8
Release R5      ┌───────────┐  ┌───────────┐  ┌───────────┐
(Completude)    │ Zebras    │  │ Histórico │→ │ Segurança │
                │ Tabela    │  │ Green/Red │  │ Wiring    │
                │ Calendário│  │ Métricas  │  │ Testes    │
                └───────────┘  └───────────┘  └───────────┘
                                                    │
                                                    ▼
                                              🏁 BETA ABERTO
```

---

### 13.5 Grafo de Dependências

```
Fase A ──────────┬─────────────────────────────────────────→ Fase H
(BLOQUEADOR)     │
                 ├── Fase B ──┬── Fase C ──┬── Fase E
                 │            │            │
                 │            ├── Fase D ──┤
                 │            │            │
                 │            └── Fase F   └── Fase G ──→ Fase H
                 │
                 └── Fase B é pré-requisito para D, E
                     Fase C reutiliza componentes em E, G
                     Fase D alimenta calibração em H
                     Fase G precisa de picks com resultados (D)
                     Fase H é a última — depende de tudo
```

**Caminho crítico:** A → B → D → G → H

Fases paralelizáveis:
- C e D podem rodar em paralelo (se Fase B completa)
- E e F podem rodar em paralelo (se Fase C completa)
- F é independente — pode ser feito a qualquer momento após C

---

### 13.6 Quality Gates (Checkpoints de Qualidade)

| Gate | Quando | Critério | Quem aprova |
|------|--------|----------|-------------|
| QG-1 | Fim da Fase A | Zero bugs 🔴 + testes base passando | PO |
| QG-2 | Fim da Fase C | Visual review dashboard + mobile check | PO + Design |
| QG-3 | Fim da Fase D | Relatório de simulação com melhoria de acurácia | PO |
| QG-4 | Fim da Fase G | Histórico com track record real de ≥3 rodadas | PO |
| QG-5 | Fim da Fase H | Security checklist + testes green + PO sign-off | PO + Dev |

---

### 13.7 Riscos por Fase

| Fase | Risco | Probabilidade | Impacto | Mitigação |
|------|-------|---------------|---------|-----------|
| A | V3≠V4 fix mais complexo que previsto | Média | Alto | Limitar a 2 abordagens; se ambas falharem, usar seed-based shuffle |
| B | API-Football free plan não cobre BSA 2025 | Alta | Médio | Usar football-data.org como fallback; backfill manual via SQL |
| B | open-meteo não tem granularidade de estádio | Baixa | Baixo | Usar cidade do mandante como proxy |
| C | Redesign consome muito tempo | Média | Médio | Aplicar skill `premium-ui-layout` para manter consistência |
| D | Simulação não mostra melhoria de acurácia | Média | Alto | Aceitar como dado — calibração precisa de volume |
| G | Poucas rodadas com resultados para histórico | Alta | Médio | Usar simulação cega como fallback de histórico |
| H | Scoring exposto no client bundle | Baixa | 🔴 Crítico | Bundle analysis obrigatório pré-deploy (`next-bundle-analyzer`) |
| H | Rate limiting não implementado | Média | Alto | Implementar via middleware (não depender de Vercel KV) |

---

### 13.8 Definição de "Concluído" por Fase

Cada fase só é considerada **Done** quando:

1. ✅ Todos os itens da tabela marcados como concluídos
2. ✅ Testes correspondentes passando (`npm test`)
3. ✅ Deploy funcional no Vercel (smoke test em produção)
4. ✅ Migrations aplicadas (se houver)
5. ✅ Documentação atualizada (checkboxes no PLANO-V3-DEFINITIVO.md)
6. ✅ Exit Criteria da fase atendidos
7. ✅ Quality Gate aprovado pelo PO
8. ✅ Commit com tag: `phase-A-done`, `phase-B-done`, etc.

---

> **Nota final:** Este documento é a fonte de verdade para validação de produto. Qualquer feature desenvolvida sem User Story mapeada, sem Critério de Aceite definido, ou sem teste correspondente NÃO atende o DoD e NÃO pode ser considerada "Done".
>
> **Complementos:**
> - Checklists de implementação: `docs/PLANO-V3-DEFINITIVO.md`
> - Arquitetura técnica detalhada: `docs/PLANO-MESTRE.md`
> - Método Camillo original: `docs/Estratégia de Apostas_ Método das Variações (Camillo).md`
