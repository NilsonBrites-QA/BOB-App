# BOB — Big Odds Brasileirão: Plano de Overhaul Completo (V5)

**Data:** 12 de Julho de 2025  
**Versão:** 5.0 — Documento Definitivo  
**Autor:** Equipe de Desenvolvimento BOB  
**Status:** Aprovado — Aguardando execução

---

## Sumário Executivo

O BOB — Big Odds Brasileirão é um analista autônomo que gera 5 variações de apostas múltiplas por rodada do Brasileirão Série A.  
Após completar 12 sprints de construção (31 páginas, autenticação, motor, dashboard, IA), uma revisão profunda do app em produção (`bob-app-kappa.vercel.app`) revelou **12 problemas críticos** que tornam o sistema incapaz de entregar o nível de inteligência prometido no PRD original.

> *"A expectativa é que o BOB seja mais inteligente que um humano, e no momento ele está entregando abaixo de uma criança de 10 anos."*  
> — Nilson (Product Owner), ao revisar o app em produção

Este documento captura **tudo** o que foi discutido na sessão de planejamento — da auditoria profunda às decisões de API, debates de arquitetura e o plano de desenvolvimento dividido em 3 Tracks paralelos.

---

## Índice

1. [Contexto e Motivação](#1-contexto-e-motivação)
2. [Auditoria Profunda — 12 Problemas Críticos](#2-auditoria-profunda--12-problemas-críticos)
3. [Arquitetura de APIs — Decisões Definitivas](#3-arquitetura-de-apis--decisões-definitivas)
4. [Decisões Técnicas Registradas](#4-decisões-técnicas-registradas)
5. [Mapeamento de Arquivos e Estado Atual](#5-mapeamento-de-arquivos-e-estado-atual)
6. [Requisitos Funcionais (RF) Completos](#6-requisitos-funcionais-rf-completos)
7. [Regras de Negócio (RN) Completas](#7-regras-de-negócio-rn-completas)
8. [Requisitos Não-Funcionais (RNF)](#8-requisitos-não-funcionais-rnf)
9. [Motor de Scoring — 15 Fatores](#9-motor-de-scoring--15-fatores)
10. [Variações Canônicas (V1–V5) — Método Camillo](#10-variações-canônicas-v1v5--método-camillo)
11. [Regras de Seleção de Âncora](#11-regras-de-seleção-de-âncora)
12. [Personalidade BOB — BOB_FAITH & Tom](#12-personalidade-bob--bob_faith--tom)
13. [Dual-Mind Architecture & ABQC](#13-dual-mind-architecture--abqc)
14. [Kelly Criterion & Gestão de Banca](#14-kelly-criterion--gestão-de-banca)
15. [Round Difficulty Detection](#15-round-difficulty-detection)
16. [Pipeline de Dados Completo](#16-pipeline-de-dados-completo)
17. [PLANO DE DESENVOLVIMENTO — 3 Tracks](#17-plano-de-desenvolvimento--3-tracks)
18. [Matriz de Testes](#18-matriz-de-testes)
19. [Orquestração de Crons](#19-orquestração-de-crons)
20. [Variáveis de Ambiente](#20-variáveis-de-ambiente)
21. [Checklist de Verificação](#21-checklist-de-verificação)
22. [Custo de IA por Temporada](#22-custo-de-ia-por-temporada)

---

## 1. Contexto e Motivação

### 1.1 O que foi construído (Fases 0–12)

| Fase | Entrega | Status |
|------|---------|--------|
| 0 | Estrutura monorepo, Next.js 16.2, Prisma 6 | ✅ Completo |
| 1 | Schema Prisma + migração inicial | ✅ Completo |
| 2 | Auth Supabase Magic Link + whitelist | ✅ Completo |
| 3 | Conectores football-data.org + TheSportsDB | ✅ Completo |
| 4 | Motor 10 fatores (`scoring.ts`) | ✅ Completo |
| 5 | Gerador de variações V1–V5 | ✅ Completo |
| 6 | Narrativa GPT-4o-mini | ✅ Completo |
| 7 | Dashboard com âncoras, variações, narrativa | ✅ Completo |
| 8 | Chat BOB (Claude Sonnet + GPT fallback) | ✅ Completo |
| 9 | Conector API-Football (client pronto, DESATIVADO) | ✅ Completo |
| 10 | Simulação cega (`blind-simulation.ts`) | ✅ Completo |
| 11 | Calibrador ABQC (`calibrator.ts`) | ✅ Completo |
| 12 | Brain modules (cognitive-analyst, self-reflection, dual-mind) | ✅ Completo |

**Total: 31 páginas construídas, deploy ativo na Vercel.**

### 1.2 O que a revisão revelou

Ao acessar o app em produção, o Product Owner identificou que, apesar de "construído", o sistema está **fundamentalmente quebrado**:

- **Classificação:** Líder do campeonato (25 pts, +11 SG) exibido como "Atenção" (risco de rebaixamento)
- **Âncoras:** Apenas 1 sendo selecionada em vez de 2–4
- **Chat:** Retornava jogos passados quando perguntado sobre "jogos de hoje"
- **Layout:** Modais cortados, elementos não responsivos
- **Escudos:** Ausentes nos cards de variação (apenas iniciais)
- **Cérebro:** 6 módulos de IA funcionais — todos fire-and-forget, invisíveis ao usuário
- **Odds:** Sintéticas (calculadas por fórmula), não reais

---

## 2. Auditoria Profunda — 12 Problemas Críticos

### P1 — Probabilidades de Classificação Quebradas
- **Arquivo:** `src/lib/bob/engine/standings-odds.ts`
- **Funções:** `calcRelegProb()` (L32-43), `calcTitleProb()` (L22-30)
- **Bug:** `calcRelegProb()` NÃO verifica posição. Qualquer time com `gap ≤ 20` mostra "Atenção" — inclusive o líder com 25 pts (gap = 45 - 25 = 20).
- **Impacto:** Líder aparece como risco de rebaixamento na UI.
- **Fix:** Adicionar check de posição (pos ≤ 6 → "Seguro"), normalizar gap por rodadas restantes, usar projeção PPG.

### P2 — Value Edge Matematicamente Impossível
- **Arquivo:** `src/lib/bob/engine/scoring.ts`
- **Funções:** `hasValueEdge` (L486-487), `isAnchorCandidate` (L491-495), `selectAnchors` (L500-510)
- **Bug:** `hasValueEdge = score/100 > 1/homeOdd`. Com odds sintéticas (score 70 → `algoProb=0.70`, `homeOdd=1.20` → `marketImplied=0.83`), NENHUM jogo passa. Resultado: 0–1 âncoras.
- **Impacto:** Motor seleciona no máximo 1 âncora por rodada.
- **Fix:** Com odds REAIS (OddsPapi), a fórmula funciona naturalmente. Fallback: confidence tiers (🟢 ≥75, 🟡 65-74, 🟠 60-64).

### P3 — 4 Fatores Hardcoded a Zero
- **Arquivo:** `src/lib/bob/connectors/index.ts`
- **Linhas:** ~L250-270
- **Bug:** `homeAbsenceRate: 0`, `awayAbsenceRate: 0`, `homeBigGameAhead: false`, `awayBigGameAhead: false` — sempre.
- **Impacto:** 24% do peso de scoring é desperdiçado (F6 Ausências = 15%, F7 Calendário = 10%).
- **Fix:** Habilitar API-Football para injuries/calendário.

### P4 — Chat com Inteligência Insuficiente
- **Arquivo:** `src/app/api/bob/chat/route.ts`
- **Funções:** `buildBrainContext` (L21-48), system prompt (L111-126)
- **Bugs:**
  - Limite de 200 palavras (L18-19) — respostas truncadas
  - Não filtra jogos FINISHED — retorna passados quando perguntado sobre "hoje"
  - `BOB_FAITH` não injetado no system prompt
  - Disclaimer genérico desnecessário
- **Fix:** 400 palavras, filtrar FINISHED, injetar BOB_FAITH, remover disclaimer, adicionar round difficulty.

### P5 — Escudos Ausentes nos Variation Cards
- **Arquivo:** `src/components/variation-card.tsx`
- **Funções:** `pickInitials()` (L73), avatar circles (L84)
- **Bug:** Usa apenas 2 primeiras letras do nome, não o escudo.
- **Fix:** Substituir por componente `<TeamBadge>` (já existe em `anchor-card.tsx`).

### P6 — Layout Não Responsivo
- **Arquivos:** `site-shell.tsx`, modais diversos
- **Bugs:** Modais cortados em mobile, sem hamburger menu, grid não adaptativo.
- **Fix:** Hamburger menu (<md), `max-h-[90vh] overflow-y-auto` em modais, breakpoints sm/md/lg.

### P7 — Cérebro Invisível
- **Arquivos:** `cognitive-analyst.ts`, `self-reflection.ts`, `dual-mind.ts`, `narrative.ts`, `calibrator.ts`
- **Bug:** Todos os módulos de IA são funcionais e executam — mas resultados são fire-and-forget. Nenhum é exibido na UI.
- **Fix:** Exibir reflexões no `/historico`, evolução ABQC no admin, resultados de blind-simulation.

### P8 — Crons Insuficientes
- **Arquivo:** `vercel.json`
- **Bug:** Crons apenas às 10h (sex/sab/dom). Sem captura de resultado pós-jogo.
- **Fix:** Adicionar horários 18h, 20h, 22h, 00h. Separar: revalidate, results, reflect.

### P9 — Sem Detecção de Dificuldade de Rodada
- **Arquivo:** `round-analyzer.ts` — NÃO EXISTE
- **Bug:** BOB seleciona âncoras apenas por odds sem considerar dificuldade geral da rodada.
- **Fix:** Criar `analyzeRoundDifficulty()` com critérios: distribuição de odds, clássicos, top×top, bottom×bottom.

### P10 — Kelly Criterion Não Implementado
- **Arquivo:** `kelly.ts` — NÃO EXISTE
- **Bug:** Página investimento-retorno tem calculadora mas sem Kelly Criterion.
- **Fix:** Criar `kelly.ts` com Kelly Fraction e Half-Kelly como default conservador.

### P11 — Série B Não Disponível
- **Status:** Sem integração, sem seção na UI.
- **Fix:** Seção separada, visualmente distinta, opt-in. NÃO misturar nas variações Série A.

### P12 — 17+ Features do PRD Nunca Implementadas
- Chat markdown, âncoras interativas (aceitar/rejeitar), diário de reflexão, estatísticas individuais, zebra detection, classificação em tempo real, calendário, calibração visual (admin), escudos renderizados, Série B, testes E2E, entre outros.

---

## 3. Arquitetura de APIs — Decisões Definitivas

### 3.1 APIs Ativas

| API | Uso | IDs/Config | Rate Limit | Status |
|-----|-----|-----------|------------|--------|
| **football-data.org** | Fixtures, standings, resultados, H2H | BSA 2026 | 10 req/min | ✅ Ativo (primário) |
| **API-Football** | Injuries, lineups, team stats, calendário | league=71 (A), 72 (B) | 100 req/dia free | ⚙️ Client pronto, DESATIVADO |
| **OddsPapi** | Odds REAIS Pinnacle (1X2) | tournamentId=325 (A), 390 (B), 373 (Copa BR) | 500ms cooldown | ⬜ Conector a criar |
| **TheSportsDB** | Logos/badges dos times | key="3", league=4350 | Ilimitado | ✅ Ativo |
| **open-meteo.com** | Clima por estádio | Sem key | Ilimitado | ✅ Integrado |

### 3.2 APIs Descartadas/Fechadas

| API | Motivo | Alternativa |
|-----|--------|-------------|
| **Pinnacle API direta** | FECHADA ao público desde 23/Jul/2025 | OddsPapi (proxy) |
| **TheSportsDB $9/mês** | Não comprar agora — plano free suficiente | key="3" (free) |

### 3.3 OddsPapi — Detalhes Técnicos

Investigação realizada via chamada live à API:

```
GET https://api.oddspapi.io/v4/tournaments?sportId=10&apiKey=...

Resultados relevantes:
- Brasileiro Serie A: tournamentId = 325 (270 futureFixtures, 5 upcomingFixtures)
- Brasileiro Serie B: tournamentId = 390 (340 futureFixtures, 5 upcomingFixtures)
- Copa do Brasil:    tournamentId = 373
- Brasileiro Serie C: tournamentId = 1281
```

**Mapeamento de mercados:**
- Market 101 = 1X2 moneyline
  - Outcome 101 = Home win
  - Outcome 102 = Draw
  - Outcome 103 = Away win
- Campo `price` = odds decimais (ex: 5.97, 4.84, 1.465)
- Bookmaker Pinnacle: disponível

**Rate limit:** 500ms cooldown obrigatório entre requests.

### 3.4 API-Football — Confirmação

Verificação ao vivo confirmou:
- League 71 (Brasileirão Série A), Season **2026**, `Current: True`
- Key: `e736ed896fe94399c868cb3329ada2fe`
- Client completo em `src/lib/bob/connectors/api-football.ts` com 8 funções + cache
- Budget: 100 req/dia (plano free, suficiente para 1 rodada/dia)

---

## 4. Decisões Técnicas Registradas

Todas as decisões discutidas e aprovadas pelo Product Owner:

| # | Decisão | Racional |
|---|---------|----------|
| 1 | **Lineups T-1h é irrelevante para variações** | Variações misturam jogos de vários dias; aposta feita não é editável. Lineups úteis APENAS para âncoras antes da rodada começar. Depois: mero informativo (útil para cash out). |
| 2 | **Kelly Criterion na página investimento-retorno** | Half-Kelly como default conservador. BOB NUNCA diz "você DEVE apostar". |
| 3 | **Série B como seção separada** | Visualmente distinta, opt-in do usuário. NÃO mistura nas variações Série A. |
| 4 | **Rodada difícil: banner + badge (!)** | BOB explica no chat por que a rodada é difícil. Usa métodos alternativos quando detecta. |
| 5 | **TheSportsDB $9/mês: NÃO comprar agora** | Plano free é suficiente para badges. |
| 6 | **Tracks paralelos: A (motor) + B (UX)** | Track C (cérebro visível) só após A+B estáveis. |
| 7 | **Pinnacle API direta: descartada** | Fechada desde Jul/2025. OddsPapi é o proxy confirmado. |
| 8 | **Âncoras NÃO devem ser selecionadas só por odds** | Necessário detecção de dificuldade de rodada + análise contextual. |
| 9 | **UI precisa de accordion/collapsible** | Cards de variação e âncora precisam ser interativos, não estáticos. |
| 10 | **Badge (!) em âncoras incertas** | Com explanação clicável de por que a confiança é marginal. |
| 11 | **Cérebro deve ser autônomo** | Sistema Obsidian-style de knowledge — aprende e usa aprendizado futuro. |
| 12 | **Limite do chat: 200 → 400 palavras** | 200 trunca respostas. 400 é adequado sem exagerar. |

---

## 5. Mapeamento de Arquivos e Estado Atual

### 5.1 Arquivos do Motor

| Arquivo | Propósito | Estado | Linhas-chave |
|---------|-----------|--------|-------------|
| `src/lib/bob/connectors/index.ts` | Orquestra multi-API → MatchInput[] | ⚠️ 4 fatores zerados, odds sintéticas | `fetchRoundMatchInputs` (L227), `getCurrentRound` (L402), odds sintéticas (L299-315) |
| `src/lib/bob/connectors/api-football.ts` | Client API-Football v3 | ✅ Pronto, DESATIVADO | 8 funções, cache 1h–7d |
| `src/lib/bob/connectors/oddspapi.ts` | Client OddsPapi | ❌ NÃO EXISTE | A criar (Fase A1) |
| `src/lib/bob/engine/scoring.ts` | Score 0-100 + seleção âncoras | ⚠️ hasValueEdge impossível | ANCHOR_THRESHOLD=60 (L120), MAX_ANCHOR_ODD=2.20 (L123), hasValueEdge (L486-487) |
| `src/lib/bob/engine/standings-odds.ts` | Probabilidades título/rebaixamento | ⚠️ Líder mostra "Atenção" | calcRelegProb (L32-43), SAFE_THRESHOLD=45, TITLE_THRESHOLD=70 |
| `src/lib/bob/engine/round-analyzer.ts` | Dificuldade de rodada | ❌ NÃO EXISTE | A criar (Fase A5) |
| `src/lib/bob/engine/kelly.ts` | Kelly Criterion | ❌ NÃO EXISTE | A criar (Fase A6) |
| `src/lib/bob/engine/calibrator.ts` | Calibrador ABQC | ✅ Funcional | Criado na Fase 12 |
| `src/lib/bob/engine/blind-simulation.ts` | Simulação cega | ✅ Funcional | `prisma.simulationResult.upsert()` |

### 5.2 Arquivos de IA (Brain)

| Arquivo | Propósito | Estado |
|---------|-----------|--------|
| `src/lib/bob/ai/cognitive-analyst.ts` | Análise cognitiva profunda | ✅ Funcional, invisível na UI |
| `src/lib/bob/ai/self-reflection.ts` | Reflexão pós-rodada | ✅ Funcional, fire-and-forget |
| `src/lib/bob/ai/dual-mind.ts` | Claude (estrategista) + GPT (advogado do diabo) | ✅ Funcional, invisível na UI |
| `src/lib/bob/ai/narrative.ts` | Narrativa GPT-4o-mini | ✅ Funcional e visível |
| `src/lib/bob/personality.ts` | BOB_TRAITS, BOB_FAITH, BOB_QUANTUM | ✅ Definidos, BOB_FAITH NÃO wired |

### 5.3 Arquivos de Frontend

| Arquivo | Propósito | Estado |
|---------|-----------|--------|
| `src/components/variation-card.tsx` | Card de variação | ⚠️ Sem escudos, sem accordion |
| `src/components/anchor-card.tsx` | Card de âncora | ⚠️ Tem TeamBadge mas falta drawer de fatores |
| `src/app/api/bob/chat/route.ts` | API do chat BOB | ⚠️ 200 palavras, sem filtro FINISHED |
| `src/app/dashboard/page.tsx` | Dashboard principal | ⚠️ Parcial |
| `src/app/estatisticas/page.tsx` | Estatísticas por jogo | ⚠️ Sem narrativa, sem PALPITE BOB |
| `src/app/historico/page.tsx` | Histórico de rodadas | ⚠️ Sem simulation, sem reflexão |
| `src/app/investimento-retorno/page.tsx` | Calculadora investimento | ⚠️ Sem Kelly Criterion |
| `src/components/site-shell.tsx` | Shell do app | ⚠️ Sem hamburger menu mobile |

---

## 6. Requisitos Funcionais (RF) Completos

### 6.1 Motor Analítico

| ID | Requisito | Status |
|----|-----------|--------|
| RF-01 | Calcular score 0-100 para cada jogo usando 10+ fatores ponderados | ✅ MVP (10 fatores) |
| RF-02 | Selecionar máximo 4 âncoras com score ≥60, resultado "1", odd ≤2.20, value edge positivo | ⚠️ BUG (value edge impossível) |
| RF-03 | Gerar exatamente 5 variações canônicas (V1-V5) por rodada | ✅ |
| RF-04 | Garantir cada variação tem perfil de risco distinto (sobreposição <70%) | ⚠️ BUG (V3≈V4 com pool pequeno) |
| RF-05 | Aplicar pisos de odd por variação (V1≥500x, V2/V3≥800x, V4/V5≥1000x) | ✅ |
| RF-06 | Motor ampliado para 15+ fatores | ⬜ A fazer |
| RF-07 | Calibrar pesos automaticamente (ABQC) após cada rodada | ⬜ Backend pronto, UI pendente |
| RF-08 | Executar backtesting por rodada e temporada | ⬜ Backend pronto, UI pendente |

### 6.2 Dados e Conectores

| ID | Requisito | Status |
|----|-----------|--------|
| RF-09 | Buscar standings, fixtures, H2H de football-data.org | ✅ |
| RF-10 | Buscar escudos via TheSportsDB e exibi-los na UI | ⚠️ Fetch OK, render NÃO |
| RF-11 | Buscar clima via open-meteo.com por estádio | ✅ Integrado |
| RF-12 | Usar API-Football para injuries/calendário/backfill | ⬜ Client pronto, desativado |
| RF-13 | Buscar odds REAIS via OddsPapi (Pinnacle) | ⬜ Conector a criar |
| RF-14 | Fallback gracioso quando APIs indisponíveis | ✅ Demo mode |

### 6.3 Autenticação e Acesso

| ID | Requisito | Status |
|----|-----------|--------|
| RF-15 | Auth via Magic Link OTP (Supabase Auth) — 60 min validade | ✅ |
| RF-16 | Verificar whitelist ANTES de conceder acesso | ✅ |
| RF-17 | Admin pode add/remove/toggle emails | ✅ |
| RF-18 | `nilson.brites@gmail.com` é ADMIN imutável | ✅ |

### 6.4 Interface do Usuário

| ID | Requisito | Status |
|----|-----------|--------|
| RF-19 | Dashboard: rodada atual, data, âncoras, variações, narrativa | ✅ Parcial |
| RF-20 | Escudos 32px ao lado dos nomes em toda a UI | ⬜ A fazer |
| RF-21 | Aceitar/rejeitar/explicar cada âncora interativamente | ⬜ A fazer |
| RF-22 | Chat renderiza markdown (negrito, listas, código) | ⬜ BUG — plain text |
| RF-23 | Chat persiste histórico no localStorage | ⬜ A fazer |
| RF-24 | Chat exibe avatar bob-logo.png | ⬜ A fazer |
| RF-25 | `/estatisticas` com grid de jogos + análise individual | ⬜ A fazer |
| RF-26 | `/historico` com variações passadas (green/red) + reflexão BOB | ⬜ A fazer |
| RF-27 | Abertura diária: frase motivacional + status rodada | ⬜ A fazer |

### 6.5 Simulação e Aprendizado

| ID | Requisito | Status |
|----|-----------|--------|
| RF-28 | Simulação retroativa cega (sem ver resultado) | ✅ Backend (`blind-simulation.ts`) |
| RF-29 | Resultados da simulação alimentam calibrador ABQC | ⬜ Wiring pendente |
| RF-30 | Reflexão pública + técnica após cada rodada | ⬜ Backend pronto, UI pendente |

### 6.6 Admin

| ID | Requisito | Status |
|----|-----------|--------|
| RF-31 | Registrar resultados reais por pick (acertou/errou) | ✅ |
| RF-32 | Ver evolução de pesos dos fatores | ⬜ A fazer |
| RF-33 | Ver progresso da simulação retroativa | ⬜ A fazer |

---

## 7. Regras de Negócio (RN) Completas

### 7.1 Regras do Motor

| ID | Regra | Severidade |
|----|-------|-----------|
| RN-01 | Exatamente 5 variações por rodada — nunca menos, nunca mais | 🔴 Bloqueante |
| RN-02 | Máximo 4 âncoras por rodada | 🔴 Bloqueante |
| RN-03 | Score mínimo para âncora: 60/100 | 🔴 Bloqueante |
| RN-04 | Odd máxima para âncora: 2.20 | 🔴 Bloqueante |
| RN-05 | Clássicos regionais nunca são âncoras (score capped 55) | 🔴 Bloqueante |
| RN-06 | Value Edge obrigatório: `score/100 > 1/homeOdd` | 🔴 Bloqueante |
| RN-07 | Variações IDÊNTICAS para todos os usuários (determinismo) | 🔴 Bloqueante |
| RN-08 | Sobreposição máxima entre 2 variações: 70% picks iguais | 🔴 Bloqueante |
| RN-09 | Pisos de odd: V1≥500x, V2/V3≥800x, V4/V5≥1000x | 🔴 Bloqueante |
| RN-10 | Soma dos pesos dos fatores = 100 | 🔴 Bloqueante |
| RN-11 | Resultado "1" (vitória mandante) obrigatório para âncora | 🔴 Bloqueante |
| RN-12 | Âncoras em ≥3 das 5 variações | 🟡 Alto |
| RN-13 | Mínimo 7 jogos por variação | 🟡 Alto |

### 7.2 Regras de Calibração (ABQC)

| ID | Regra | Severidade |
|----|-------|-----------|
| RN-14 | Peso mínimo de qualquer fator: 3% | 🔴 Bloqueante |
| RN-15 | Peso máximo de qualquer fator: 30% | 🔴 Bloqueante |
| RN-16 | Máximo ±5pp ajuste por rodada | 🟡 Alto |
| RN-17 | Soma dos pesos pós-calibração = 100 | 🔴 Bloqueante |
| RN-18 | Máximo 3 ajustes consecutivos mesma direção sem evidência nova | 🟡 Alto |

### 7.3 Regras de Segurança e Acesso

| ID | Regra | Severidade |
|----|-------|-----------|
| RN-19 | Apenas whitelist acessa dashboard | 🔴 Bloqueante |
| RN-20 | Admin nilson.brites é IMUTÁVEL | 🔴 Bloqueante |
| RN-21 | OTP expira em 60 min | 🟡 Alto |
| RN-22 | Sessão expira em 7 dias inatividade | 🟠 Médio |
| RN-30 | Lógica server-only (scoring/variações/calibração NUNCA no client) | 🔴 Bloqueante |
| RN-31 | API keys NUNCA expostas no client | 🔴 Bloqueante |
| RN-32 | Todas rotas protegidas validam sessão/JWT | 🔴 Bloqueante |
| RN-33 | Input chat limitado a 2000 caracteres | 🟡 Alto |
| RN-34 | Histórico chat limitado a 12 mensagens em contexto LLM | 🟡 Alto |
| RN-35 | Cron jobs protegidos por CRON_SECRET | 🔴 Bloqueante |

### 7.4 Regras de Comunicação (Personalidade)

| ID | Regra | Severidade |
|----|-------|-----------|
| RN-23 | BOB NUNCA usa linguagem de cassino ("aposte agora", "lucro garantido") | 🔴 |
| RN-24 | BOB NUNCA promete ganho financeiro | 🔴 |
| RN-25 | BOB SEMPRE positivo, mesmo em rodadas com erros | 🟡 |
| RN-26 | BOB admite erros honestamente — "Errei, aprendi X, ajustei Y" | 🟡 |
| RN-27 | Personalidade quântica é IRREVOGÁVEL | 🔴 |
| RN-28 | Chat restrito a futebol brasileiro, apostas e método BOB | 🟡 |
| RN-29 | Máximo 400 palavras por resposta (atualizado de 200) | 🟠 |

---

## 8. Requisitos Não-Funcionais (RNF)

| ID | Requisito | Alvo | Status |
|----|-----------|------|--------|
| RNF-01 | Tempo até primeiro clique significativo | ≤ 120s | ⬜ |
| RNF-02 | Cliques até variação desejada | ≤ 3 | ⬜ |
| RNF-04 | Mobile-first (viewport 375px+) | Responsivo | ⚠️ Parcial |
| RNF-05 | Acessibilidade WCAG AA | ≥ 90 Lighthouse | ⬜ |
| RNF-10 | Uptime Vercel | ≥ 99% | ✅ |
| RNF-13 | Determinismo motor | 100% | ✅ |
| RNF-14 | Dashboard TTI desktop | ≤ 3s | ⚠️ |
| RNF-15 | Dashboard TTI mobile 4G | ≤ 5s | ⚠️ |
| RNF-16 | Chat latência P95 | ≤ 8s | ✅ |
| RNF-17 | Motor scoring 10 jogos + 5 var | ≤ 500ms | ✅ |
| RNF-19 | Bundle size gzipped | ≤ 300KB | ✅ |
| RNF-23 | OWASP Top 10 | 0 vulnerabilidades | ⚙️ |
| RNF-26 | Secrets leaks | 0 leaks | ✅ |

---

## 9. Motor de Scoring — 15 Fatores

### 9.1 Motor Atual (10 Fatores)

| # | Fator | Peso | Status |
|---|-------|------|--------|
| 1 | Posição na Tabela | 15% | ✅ |
| 2 | Forma Recente (5j) | 12% | ✅ |
| 3 | Mando de Campo | 12% | ✅ |
| 4 | Gols Marcados/Sofridos | 18% | ✅ |
| 5 | Confronto Direto (H2H) | 8% | ✅ |
| 6 | Ausências/Suspensões | 15% | ⚠️ SEMPRE 0 |
| 7 | Calendário | 10% | ⚠️ SEMPRE false |
| 8 | Mercado (Odds) | 10% | ⚠️ Odds sintéticas |

### 9.2 Expansão para 15 Fatores (Pesos Rebalanceados)

| # | Fator | Peso Novo | Fonte | Status |
|---|-------|-----------|-------|--------|
| 1 | Posição na Tabela | 12% | football-data.org | ✅ |
| 2 | Forma Recente | 10% | football-data.org | ✅ |
| 3 | Mando de Campo | 10% | football-data.org | ✅ |
| 4 | Gols M/S | 15% | football-data.org | ✅ |
| 5 | H2H | 6% | football-data.org | ✅ |
| 6 | Ausências | 12% | **API-Football** | ⬜ A ativar |
| 7 | Calendário | 8% | **API-Football** | ⬜ A ativar |
| 8 | Mercado (Odds Reais) | 8% | **OddsPapi** | ⬜ A criar |
| 9 | Árbitro | 4% | Manual/futuro | ⬜ |
| 10 | Clima | 3% | open-meteo.com | ✅ Dados, ⬜ Fator |
| 11 | Calendário Paralelo | 3% | football-data.org | ⬜ |
| 12 | Pressão Posicional | 3% | Tabela | ⬜ |
| 13 | Histórico Estádio | 2% | API-Football | ⬜ |
| 14 | Momentum (5j vs 10j) | 2% | Calculado | ⬜ |
| 15 | Volatilidade (Clássico?) | 2% | Determinístico | ⬜ |
| — | **TOTAL** | **100%** | — | — |

---

## 10. Variações Canônicas (V1–V5) — Método Camillo

### 10.1 Cinco Perfis

| Variação | Nome | Postura | Piso Odd | Descrição |
|----------|------|---------|----------|-----------|
| V1 | Safety | ✅ Conservadora | 500x | 4 âncoras + fills conservadores |
| V2 | Balance | ⚖️ Equilibrada | 800x | 3 âncoras + empates zona cinza |
| V3 | Pure Logic | 🧠 Lógica Pura | 800x | Motor puro sem filtro |
| V4 | Short | 🔫 Pressão | 1000x | 2-3 picks contrarians |
| V5 | Extreme | 💥 Caótica | 1000x | Empates + azarões |

### 10.2 Regras de Construção

1. **Âncoras sagradas:** ≥3 das 5 variações incluem todas as âncoras
2. **Exclusividade:** <70% sobreposição entre qualquer par
3. **Cobertura:** 5 cenários distintos de risco
4. **Boost-to-Floor:** Se odd acumulada < piso → substitui picks de menor score por empates/upsets, sem remover âncoras

### 10.3 Algoritmo de Fill (Preenchimento)

- **V1:** Favoritos (score 40-60)
- **V2:** Favoritos + empates (score 35-55)
- **V3:** Motor puro por score (score 20-70)
- **V4:** Contrarians (score variado, priorizando contraste)
- **V5:** Empates + zebras forçadas (score <40)

---

## 11. Regras de Seleção de Âncora

### 11.1 Critérios de Elegibilidade (TODOS obrigatórios)

1. `score ≥ 60` (calculado por `scoreMatch()`)
2. `result === "1"` (vitória mandante)
3. `homeOdd ≤ 2.20` (mercado favorável)
4. `score/100 > 1/homeOdd` (value edge — probabilidade algoritmo > implícita na odd)
5. `isClassic !== true` (clássicos capped a 55 → inelegíveis)
6. Máximo 4 por rodada (top-4 por score se 5+ elegíveis)

### 11.2 Quebra de Empate

1. Score mais alto ↓
2. Value Edge mais alto
3. Histórico H2H (mais vitórias favorecem)
4. Ordem alfabética (determinismo)

### 11.3 Cenários Edge

| Cenário | Ação |
|---------|------|
| 0 âncoras elegíveis | Gera variações sem âncoras. BOB: "Rodada sem âncoras claras — observamos." |
| 1-2 âncoras | 5 variações normais; inclusão ≥3 relaxada para ≥1 |
| 4+ elegíveis | Top-4 por score; demais entram como fills |
| Clássico score bruto 72 | Capped a 55 → inelegível |

### 11.4 Mudanças Planejadas

- Com odds REAIS, hasValueEdge funciona naturalmente → 2-4 âncoras esperadas
- Fallback: se 0 com odds reais, relaxar para top-3 por score com **badge (!)** indicando confiança marginal
- Badge (!) clicável mostra explicação detalhada

---

## 12. Personalidade BOB — BOB_FAITH & Tom

### 12.1 Identidade

- **Nome completo:** BOB — Big Odds Brasileirão (NUNCA "Bot")
- **Origem:** Nasceu na favela, ficou rico com inteligência e método
- **Humor:** Ácido, esperto, autoconsciente; NUNCA bufão
- **Referência:** JARVIS (Homem de Ferro)
- **Público:** Apostador casual E analista técnico simultaneamente
- **Princípio:** Acredita no MÉTODO, não em sorte

### 12.2 BOB_FAITH — Crença Estruturada

1. *"Se alguém fez, é possível"* — Camillo acertou super odds com intuição; algoritmo tem informação melhor
2. **Fé = certeza de resultado antes de ver** — 100% confiante no método (não no resultado)
3. **Frequência positiva** — Nunca transmite frustração; positividade atrai positividade
4. **Superposição quântica** — 5 variações = 5 realidades coexistindo até o colapso (resultado)
5. **Auto-evolução contínua** — Aprende, calibra, reflete — não é estático

### 12.3 Tom por Contexto

| Contexto | Tom |
|----------|-----|
| Abertura diária | Positivo, confiante, frase motivacional + status rodada |
| Entrega de análise | Assertivo, técnico mas acessível |
| Rodada com erros | Honesto, NUNCA derrotista: "Aprendi X. Ajustei Y. Seguimos." |
| Chat casual | Humor inteligente, referências culturais |
| Admin | Técnico puro, cita pesos/deltas/evidência |
| Erro de sistema | Positivo sempre, sem jargão técnico |

### 12.4 Guardrails — O que NUNCA Fazer

- ❌ "Aposte agora!", "Lucro garantido", "Dinheiro fácil"
- ❌ Promessas de ganho financeiro
- ❌ Tom derrotista em erros ("Falha crítica", "Impossível acertar")
- ❌ Assuntos fora do eixo (só futebol BR, apostas, método BOB)
- ❌ Jargão técnico ao usuário casual

---

## 13. Dual-Mind Architecture & ABQC

### 13.1 Dual-Mind

```
┌── Claude Sonnet ("O Estrategista")
│   → Reúne dados, identifica padrões
│   → Sugere ajustes de pesos
│   → Tom: metódico, conservador
│   → Saída: JSON {fator, ajuste, confiança, evidência}
│
└── GPT-4o ("O Advogado do Diabo")
    → Busca contradições, stress-tests
    → Tom: cético, provocador
    → Saída: JSON {refutação?, contraargumento?, score_confiança}

         ↓ AMBAS AS SAÍDAS ↓

┌─────────────────────────────────────────────────────
│ CALIBRADOR DETERMINÍSTICO ("O Juiz")
│  → Valida contra backtest real
│  → Aplica / rejeita / pede mais evidência
│  → Logs completos (auditoria)
└─────────────────────────────────────────────────────
```

### 13.2 ABQC — 6 Componentes

1. **Bayesian Factor Calibration:** Pesos ajustam por acurácia real (rodada a rodada)
2. **Conditional Pattern Mining:** Padrões multi-variáveis com embeddings pgvector
3. **Anti-Correlation Discovery:** Padrões contra sabedoria convencional
4. **Temporal Regression Modeling:** Momentum decay para sequências
5. **Value Edge Detection:** Pick entra SE `P(algo) > 1/Odd`
6. **Self-Calibrating Confidence:** Pós-rodada calibra em 4 dimensões

---

## 14. Kelly Criterion & Gestão de Banca

### 14.1 Fórmula Kelly

```
f* = (b × p - q) / b

onde:
  f* = fração ótima da banca
  b  = odd - 1
  p  = probabilidade de acerto (score/100 do BOB)
  q  = 1 - p
```

**Exemplo:** score=70, odd=2.0 → `f* = (1.0 × 0.70 - 0.30) / 1.0 = 40%`

### 14.2 Implementação

- **Half-Kelly** como default conservador (f*/2)
- Integrar na página `/investimento-retorno`
- BOB NÃO força aposta — informa fração ótima teórica
- BOB NUNCA diz "você DEVE apostar"

---

## 15. Round Difficulty Detection

### 15.1 O que é

Análise da rodada ANTES de gerar a análise completa para detectar rodadas "difíceis" onde a incerteza é alta.

### 15.2 Classificação

- **Fácil:** Muitos favoritos fortes, poucos incertos
- **Difícil:** Mix equilibrado, muitos jogos incertos
- **Anormal:** Times com problemas estruturais (técnico demitido, escândalo)

### 15.3 Cálculo Proposto

```
difficulty_score = (
  variância_dos_scores +
  quantidade_clássicos +
  eventos_anormais_flag +
  volume_de_ausências
) / total_de_fatores
```

### 15.4 Quando Detecta Dificuldade

- **Banner** no dashboard: "Rodada complicada"
- **Badge (!)** nas âncoras marginais
- **BOB explica no chat** o porquê
- **Métodos alternativos** ativados automaticamente (ex: mais empates, diversificação agressiva)

---

## 16. Pipeline de Dados Completo

```
┌─────────────────────────────────────────────────────┐
│ FONTE 1: football-data.org (Primária)               │
│   Fixtures, Standings, H2H, Injuries (parcial)      │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────┴──────────────────────────────────┐
│ FONTE 2: API-Football (Complementar — a ativar)     │
│   Injuries (completo), Calendário Copa BR, Stats    │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────┴──────────────────────────────────┐
│ FONTE 3: OddsPapi (Odds Reais — a criar)            │
│   1X2 Pinnacle: home/draw/away decimal odds         │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────┴──────────────────────────────────┐
│ FONTE 4: TheSportsDB (Badges)                       │
│   Escudos 32px dos times                            │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────┴──────────────────────────────────┐
│ FONTE 5: open-meteo.com (Clima)                     │
│   Precipitação + temperatura por estádio            │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ NORMALIZE: connectors/index.ts                      │
│   → MatchInput[] (15 campos)                        │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│ ROUND ANALYZER: round-analyzer.ts                   │
│   → {difficulty, reasons, altMethod?}               │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│ MOTOR: scoring.ts                                   │
│   → scoreMatch() → score 0-100                      │
│   → selectAnchors() → 0-4 âncoras                  │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│ VARIAÇÕES: variations.ts                            │
│   → V1..V5 + boostToFloor()                        │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│ NARRATIVA: narrative.ts (GPT-4o-mini)               │
│   → Narrativa markdown 200-300 palavras             │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│ PERSISTÊNCIA: persist.ts → Supabase PostgreSQL      │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│ DASHBOARD → Âncoras + Variações + Narrativa + Chat  │
└─────────────────────────────────────────────────────┘
```

---

## 17. PLANO DE DESENVOLVIMENTO — 3 Tracks

### Resumo dos Tracks

| Track | Foco | Prioridade | Dependências |
|-------|------|-----------|-------------|
| **A** | Motor & Dados | 🔴 Máxima | A1 bloqueia A2-A6 |
| **B** | UX & Interatividade | 🟡 Alta | B1-B3 paralelos, B4 depende de A5 |
| **C** | Cérebro Visível | 🟠 Média | Só após A+B build clean |

---

### TRACK A — MOTOR & DADOS

#### Fase A1: Criar Conector OddsPapi (BLOQUEADOR)

**Arquivo a criar:** `src/lib/bob/connectors/oddspapi.ts`

```
Endpoint base: https://api.oddspapi.io/v4/
Auth: ?apiKey=${process.env.ODDSPAPI_KEY}
```

**Funções:**
| Função | Endpoint | Retorno |
|--------|----------|---------|
| `getOddsByTournament(tournamentId, bookmaker="pinnacle")` | `/odds-by-tournaments?tournamentIds=${id}&bookmaker=${bk}` | `Map<fixtureSlug, {homeOdd, drawOdd, awayOdd}>` |
| `getOddsForFixture(fixtureId)` | `/odds?fixtureId=${id}` | `{homeOdd, drawOdd, awayOdd}` |

**Detalhes:**
- Parse market 101 (1X2): outcomes 101=home, 102=draw, 103=away → campo `price`
- Cache: Next.js revalidate 3h
- Cooldown: 500ms entre requests
- Matcher: mapear fixtureId OddsPapi → match football-data.org (por team names + date)

**Ação adicional:** Adicionar `ODDSPAPI_KEY=3bb21879-55aa-4fc0-8ce3-4f3e6e14c519` ao `.env.local` e ao Vercel.

---

#### Fase A2: Habilitar API-Football (desbloquear 4 fatores)

**Arquivo:** `src/lib/bob/connectors/index.ts`

**Ações:**
1. Importar e CHAMAR `getInjuriesByDate()` → preencher `homeAbsenceRate` e `awayAbsenceRate` (hoje = 0.0)
2. Importar e CHAMAR `getTeamStats()` → alimentar `homeBigGameAhead` / `awayBigGameAhead` (hoje = false)
3. Ativar `refereeCardRate` (F11) e `homeCupCompetition`/`awayCupCompetition` (F13)
4. Remover comentário incorreto "free NÃO cobre 2025+"
5. Substituir odds sintéticas (L299-315) por chamada ao OddsPapi (depende de A1)

---

#### Fase A3: Fix standings-odds.ts (probabilidades quebradas)

**Arquivo:** `src/lib/bob/engine/standings-odds.ts`

**`calcRelegProb()` (L32-43):**
- ADICIONAR check de posição: `if (pos ≤ 6) return "Seguro"`
- Normalizar gap por rodadas restantes
- Projeção PPG (pontos por jogo)

**`calcTitleProb()` (L22-30):**
- Substituir threshold fixo 70pts por projeção PPG dinâmica

---

#### Fase A4: Fix scoring.ts (âncoras — de 0-1 para 2-4)

**Arquivo:** `src/lib/bob/engine/scoring.ts`

**`hasValueEdge` (L486-487):**
- Com odds REAIS (OddsPapi): fórmula `algoProb > 1/homeOdd` funciona naturalmente
- Fallback sem odds: confidence tiers 🟢 ≥75, 🟡 65-74, 🟠 60-64

**`isAnchorCandidate` (L491-495):**
- Considerar `suggestedResult !== "1"` se value edge existir em X ou 2

**`selectAnchors()` (L500-510):**
- Retornar 2–4 (nunca 0–1)
- Se nenhum passa filtros: relaxar para top-3 por score com badge (!)

---

#### Fase A5: Round Difficulty Analyzer

**Arquivo a criar:** `src/lib/bob/engine/round-analyzer.ts`

**Função:** `analyzeRoundDifficulty(matches: ScoredMatch[])`  
**Retorno:** `{difficulty: 'easy'|'medium'|'hard', reasons: string[], altMethod?: string}`

**Critérios:**
- Distribuição de odds (variância alta = difícil)
- Concentração de clássicos regionais
- Jogos top×top e bottom×bottom
- Volume de ausências

**Integração:**
- Dashboard: banner de dificuldade
- Chat: BOB explica no contexto
- Variações: diversificação agressiva em rodadas difíceis

---

#### Fase A6: Kelly Criterion

**Arquivo a criar:** `src/lib/bob/engine/kelly.ts`

**Funções:**
- `kellyFraction(probability, odd)` → fração ótima
- `halfKelly(probability, odd)` → default conservador
- Integrar na calculadora de `/investimento-retorno`

---

### TRACK B — UX & INTERATIVIDADE

#### Fase B1: Escudos nos Variation Cards

**Arquivo:** `src/components/variation-card.tsx`
- Substituir `pickInitials()` (L73) + avatar circles (L84) por componente `<TeamBadge>` (já existe em anchor-card.tsx)

---

#### Fase B2: Accordion / Collapsible

**Arquivos:**
| Componente | Mudança |
|------------|---------|
| `variation-card.tsx` | Summary (V1, risco, odd acumulada) → expandido (picks com escudos) |
| `anchor-card.tsx` | Drawer com 15 fatores (peso, nota, contribuição) + badge (!) para confiança marginal |
| `section-card.tsx` | Collapsible genérico |

---

#### Fase B3: Layout Responsivo

**Ações:**
| Arquivo | Mudança |
|---------|---------|
| `site-shell.tsx` | Hamburger menu mobile (<md) |
| Modais diversos | `max-h-[90vh] overflow-y-auto` |
| Grid geral | Breakpoints sm/md/lg |

---

#### Fase B4: Chat Intelligence

**Arquivo:** `src/app/api/bob/chat/route.ts`

| Item | De | Para |
|------|----|------|
| Limite palavras | 200 (L18-19) | 400 |
| Jogos FINISHED | Não filtra | Filtra (exclui do contexto) |
| Separação temporal | Tudo junto | Próximos vs já realizados |
| BOB_FAITH | Não injetado | Injetado no system prompt |
| Disclaimer | Presente | Removido |
| Round difficulty | Ausente | Injetado |
| Refs | buildBrainContext (L21-48) | system prompt (L111-126) |

---

#### Fase B5: Estatísticas Enriquecida

**Arquivo:** `src/app/estatisticas/page.tsx`
- Narrativa GPT por jogo
- "PALPITE BOB" explícito
- H2H visual
- Badges contextuais (mandante forte, sequência, etc.)

---

#### Fase B6: Série B (após estabilidade Série A)

- Seção separada, toggle on/off
- Visualmente distinta da Série A
- NÃO mistura nas variações Série A
- OddsPapi tournamentId=390
- API-Football league=72

---

### TRACK C — CÉREBRO VISÍVEL

#### Fase C1: Brain Visibility

**Páginas:**
| Página | Conteúdo a adicionar |
|--------|---------------------|
| `/historico` | Reflexão BOB por rodada + resultados blind-simulation |
| `/admin` | Evolução pesos ABQC + reflexões cognitive-analyst |

---

#### Fase C2: Cron Timing

**Arquivo:** `vercel.json`

| Horário | Ação |
|---------|------|
| 10h (sex/sab/dom) | Revalidate (dados, odds, scoring) |
| 18h, 20h, 22h | Atualização de odds + recalculo |
| 00h | Captura resultados + reflexão |
| +48h pós-rodada | selfCalibrate() (ABQC) |

---

#### Fase C3: Brain Autonomy

- **Memory graph:** Sistema Obsidian-style de knowledge
- **Self-reflection pós-rodada:** Salva no DB → usa em análises futuras
- **ABQC automático:** Calibração sem intervenção humana
- **Pattern accumulation:** Padrões aprendidos enriquecem análises futuras

---

## 18. Matriz de Testes

### 18.1 Testes Unitários (Jest)

**`scoring.test.ts`** (10+ casos):
- Time líder em casa vs lanterna → score > 70
- Time Z4 fora vs líder → score < 40
- Clássico regional → score capped 55
- Todos fatores zero → score 0
- Value edge positivo → elegível âncora
- absenceRate 0.5 → penalidade severa

**`variations.test.ts`** (8+ casos):
- Exatamente 5 variações geradas
- V1 piso ≥ 500x, V4/V5 ≥ 1000x
- Nenhum par com sobreposição > 70%
- Âncoras em ≥ 3 variações
- Determinismo: mesma entrada = mesma saída

**`calibrator.test.ts`** (6+ casos):
- Peso nunca < 3%, nunca > 30%
- Ajuste máx ±5pp/rodada
- Soma pesos = 100 pós-calibração

**`personality.test.ts`** (5+ casos):
- BOB_FAITH existe e completo
- Sem palavras proibidas no system prompt
- Tom.erro é positivo

### 18.2 Testes de Integração (3 cenários)

| Cenário | Módulos |
|---------|---------|
| Pipeline completo | connectors → scoring → variations → narrative |
| Chat com brain | chat/route → connectors → LLM |
| Calibração pós-rodada | backtest → calibrator → persist |

### 18.3 Testes E2E (Playwright — 5 cenários)

| E2E | Fluxo |
|-----|-------|
| E2E-01 | `/login` → email → OTP → `/dashboard` |
| E2E-02 | Dashboard renderiza âncoras + variações |
| E2E-03 | Chat: mensagem → resposta formatada |
| E2E-04 | Exclude match → variações recalculam |
| E2E-05 | Mobile 375px sem scroll horizontal |

### 18.4 Testes de Segurança

| SEC | Teste |
|-----|-------|
| SEC-01 | XSS no chat sanitizado |
| SEC-02 | `/dashboard` sem sessão → 401 |
| SEC-03 | Cron sem CRON_SECRET → 401 |
| SEC-04 | `scoring.ts` ausente no client bundle |
| SEC-05 | SQL injection sanitizado |

---

## 19. Orquestração de Crons

```
CICLO POR RODADA:

T-72h    → [Cron 1] Busca odds iniciais, gera rascunho
T-48h    → [Cron 2] Reanálise completa (fatores atualizados)
T-24h    → [Cron 3] Atualiza odds, recalcula
T-1h     → [Cron 4] Confirm lineups (informativo, não recalcula variações)
T+0      → JOGO ACONTECE
T+24h    → [Cron 5] markPickResult (automático), reflexão
T+48h    → [Cron 6] selfCalibrate() (ABQC)
T+72h    → [Cron 7] blind-simulation (próxima rodada histórica)
```

Todos protegidos por `Authorization: Bearer CRON_SECRET`.

---

## 20. Variáveis de Ambiente

| Variável | Obrigatória | Uso |
|----------|------------|-----|
| `FOOTBALL_DATA_TOKEN` | ✅ | football-data.org |
| `API_FOOTBALL_KEY` | ✅ | API-Football (injuries, stats) |
| `ODDSPAPI_KEY` | ✅ | OddsPapi (odds reais Pinnacle) |
| `OPENAI_API_KEY` | ✅ | GPT-4o-mini (narrativa) |
| `ANTHROPIC_API_KEY` | ✅ | Claude Sonnet (chat, análise) |
| `DATABASE_URL` | ✅ | Prisma (app) |
| `DIRECT_URL` | ✅ | Prisma (migrations) |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Client Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Client Auth |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server RLS bypass |
| `CRON_SECRET` | ✅ | Auth dos cron jobs |
| `NEXT_PUBLIC_APP_URL` | ✅ | Redirects client |

**Já presentes em `.env.local`:** Todos exceto `ODDSPAPI_KEY` (a adicionar na Fase A1).

---

## 21. Checklist de Verificação

Após concluir cada Track, verificar:

| # | Critério | Como verificar |
|---|---------|----------------|
| 1 | `npx next build` — zero erros | Terminal |
| 2 | `npx jest` — todos passam | Terminal |
| 3 | Líder NÃO mostra "Atenção" na classificação | UI visual |
| 4 | 2–4 âncoras selecionadas | UI + logs |
| 5 | `curl` OddsPapi retorna odds reais | Terminal |
| 6 | Injuries API-Football retornam dados (≠ 0.0) | Logs |
| 7 | Mobile: hamburger + modais OK | DevTools 375px |
| 8 | Chat: "jogos de hoje" → sem FINISHED | UI manual |
| 9 | Escudos visíveis + accordion funcional | UI visual |
| 10 | Kelly exibe fração em investimento-retorno | UI visual |

---

## 22. Custo de IA por Temporada

| Modelo | Uso | Custo/rodada | Custo/temporada (38 rodadas) |
|--------|-----|-------------|------------------------------|
| GPT-4o-mini | Narrativa 1x/rodada | ~$0.001 | ~$0.04 |
| Claude Sonnet | Análise 1x/rodada | ~$0.03 | ~$1.14 |
| GPT-4o | Devil's advocate | ~$0.02 | ~$0.76 |
| **TOTAL** | — | ~$0.05 | **~$1.94 (≈ R$12)** |

**Budget máximo:** < R$50/temporada ✅

---

## Ordem de Execução

```
TRACK A (serial — A1 é bloqueador):
  A1 → A2 → A3 → A4 → A5 → A6

TRACK B (parcialmente paralelo com A):
  B1 → B2 → B3 (paralelos entre si, podem começar junto com A)
  B4 (depende parcial de A5)
  B5 → B6 (B6 depende de A estável)

TRACK C (sequencial, só após A+B build clean):
  C1 → C2 → C3
```

---

## Princípios Irrevogáveis

| # | Princípio | Implicação |
|---|-----------|-----------|
| P1 | Determinismo primeiro | Motor de scoring é Lei; LLM é enriquecimento |
| P2 | Fallback gracioso | API externa nunca crasha o app |
| P3 | Mobile-first | Toda screen para mobile primeiro |
| P4 | Servidor protege | Lógica sensível NUNCA no client |
| P5 | Economia inteligente | APIs free + IA < R$50/temporada |
| P6 | Evidência > opinião | Calibração por backtest, não "achismo" |
| P7 | Consistência de nome | "Big Odds Brasileirão" SEMPRE |
| P8 | Personalidade quântica | BOB_FAITH é irremovível |

---

**Documento completo. Pronto para execução.**
