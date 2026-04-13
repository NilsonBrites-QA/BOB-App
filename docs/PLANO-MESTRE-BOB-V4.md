# BOB — Big Odds Brasileirão · Plano Mestre V4
> **Documento único e autoritativo.** Substitui todos os planejamentos anteriores.
> Última atualização: 13 Abr 2026
> Stack: Next.js 16.2 · Prisma 6 · Supabase PostgreSQL · Vercel · Claude Sonnet + GPT-4o-mini

---

## 🗺️ MAPA DO PROJETO

```
BOB
├── Motor de Análise (engine/)
├── Connectors (football-data, API-Football, OddsPapi, TheSportsDB, open-meteo)
├── IA Dual-Mind (cognitive-analyst, dual-mind, self-reflection)
├── Bet Analyzer (4 perfis × 10 mercados)
├── Páginas de Produto (Dashboard, Apostas, Histórico, Estatísticas, Chat...)
└── Admin (Betslips, Calibração, Brain Observatory)
```

---

## ✅ IMPLEMENTADO — O que existe e funciona

### Core Engine
- [x] `engine/scoring.ts` — motor de scoring (10 fatores)
- [x] `engine/variations.ts` — 5 variações por rodada
- [x] `engine/calibrator.ts` — ABQC (guardrails 3%/30%/±5pts)
- [x] `engine/backtest.ts` — backtesting por rodada/temporada
- [x] `engine/forensic.ts` — análise forense por pick
- [x] `engine/anti-correlation.ts` — detecção de anti-correlações

### Connectors
- [x] `connectors/football-data.ts` — primário (BSA 2026, free)
- [x] `connectors/api-football.ts` — histórico 2022-2024
- [x] `connectors/thesportsdb.ts` — escudos/badges
- [x] `connectors/oddspapi.ts` — conector pronto (Pinnacle via proxy)
- [x] `connectors/index.ts` — pipeline multi-API

### IA / Dual-Mind
- [x] `ai/cognitive-analyst.ts` — Claude Sonnet (análise, reflexão, `callClaude` exportado)
- [x] `ai/dual-mind.ts` — Claude + GPT em paralelo
- [x] `ai/self-reflection.ts` — orquestrador de auto-reflexão
- [x] `ai/narrative.ts` — geração de narrativa (GPT-4o-mini)

### BOB Bet Analyzer *(implementado nessa sessão)*
- [x] `lib/bob/bet-analyzer.ts` — motor LLM com fallback determinístico (4 perfis)
- [x] `api/bob/analyze-match/route.ts` — POST analisar partida
- [x] `api/bob/suggestions/route.ts` — GET sugestões por matchIds
- [x] `api/cron/analyze-round/route.ts` — cron análise automática da rodada

### Persistência
- [x] `persist.ts` — saveRound, markPickResult, saveRoundResult, getPerformanceMetrics
- [x] `persist-weights.ts` — salva FactorWeight + ConditionalPattern
- [x] Schema Prisma com: Round, Pick, BetMatch, BobSuggestion, BrainMemoryEvent, FactorWeight, ConditionalPattern
- [x] Migrations aplicadas: `001` + `002` + `003_memory_deep` + `004_push_subscription`

### Crons
- [x] `cron/pre-round` — análise T-48h
- [x] `cron/post-round` — após rodada (reflexão + calibração)
- [x] `cron/backfill` — importa resultados históricos
- [x] `cron/calibrate` — ABQC calibração de pesos
- [x] `cron/simulate` — simulação retroativa cega
- [x] `cron/lineup-check` — verifica escalações
- [x] `cron/import-matches` — importa partidas do Brasileirão
- [x] `cron/analyze-round` — BOB Bet Analyzer por rodada

### Páginas de Produto
- [x] `/dashboard` — análise da rodada atual (variações + âncoras)
- [x] `/apostas` — BOB Bet Analyzer (4 perfis, expandível por partida) *(reescrito)*
- [x] `/historico` — rounds passados
- [x] `/estatisticas` — análise por jogo
- [x] `/chat` — chat com BOB
- [x] `/classificacao` — tabela do Brasileirão
- [x] `/calendario` — calendário de jogos
- [x] `/investimento-retorno` — calculadora com métricas reais

### Admin
- [x] `/admin` — painel principal + whitelist
- [x] `/admin/betslips` — lista de bilhetes
- [x] `/admin/betslips/[id]` — detalhe + registro de resultado
- [x] `/admin/calibration` — painel de calibração ABQC
- [x] `/admin/cerebro` — Brain Observatory *(visual premium implementado)*
- [x] `/admin/season-report` — relatório de temporada

### Infra
- [x] Auth Supabase Magic Link + whitelist + admin imutável
- [x] PWA (manifest.json, Service Worker, push notifications)
- [x] `vercel.json` — crons agendados
- [x] `dark mode` — padrão dark *(corrigido nessa sessão)*
- [x] Toggle dark/light no desktop e mobile *(corrigido nessa sessão)*

---

## ❌ FALTA — O que não foi implementado

### SPRINT 1 — Bugs Críticos (desbloqueador)

| # | Item | Arquivo | Severidade |
|---|------|---------|------------|
| 1.1 | **V3 e V4 idênticos** quando pool pequeno — `boostToFloor()` não gera diversidade real | `engine/variations.ts` | 🔴 Crítico |
| 1.2 | **Chat plain text** — falta `react-markdown` + `remark-gfm` | `components/chat-widget.tsx` | 🔴 Crítico |
| 1.3 | **"T-1h do primeiro bloco" hardcoded** no dashboard | `app/dashboard/page.tsx` | 🟡 Alto |
| 1.4 | **Chat sem persistência** — histórico some ao recarregar | `components/chat-widget.tsx` | 🟡 Alto |
| 1.5 | **`aberturaDiaria()` não conectada** — componente existe, sem wiring real no dashboard | `components/abertura-diaria-banner.tsx` | 🟡 Alto |
| 1.6 | **`BOB_FAITH` não em `personality.ts`** — identidade quântica incompleta | `lib/bob/personality.ts` | 🟡 Alto |

### SPRINT 2 — Dados Reais e Odds

| # | Item | Arquivo | Severidade |
|---|------|---------|------------|
| 2.1 | **`absenceRate` sempre 0** — conector não preenche ausências | `connectors/index.ts` | 🟡 Alto |
| 2.2 | **`bigGameAhead` sempre false** — calendário paralelo não detectado | `connectors/index.ts` | 🟡 Alto |
| 2.3 | **`homeOddDropped` sempre false** — variação de odds não detectada | `connectors/index.ts` | 🟡 Alto |
| 2.4 | **Odds estimadas** no bet-analyzer — usa cálculo local, não OddsPapi real | `lib/bob/bet-analyzer.ts` | 🟡 Alto |
| 2.5 | **ODDSPAPI_KEY não verificada no Vercel** — variável pode estar ausente | Vercel env vars | 🟡 Alto |
| 2.6 | **BTTS e Over/Under via OddsPapi** — wiring incompleto para mercados além de 1×2 | `connectors/oddspapi.ts` | 🟢 Médio |

### SPRINT 3 — Motor 15 Fatores

| # | Item | Arquivo | Severidade |
|---|------|---------|------------|
| 3.1 | **Fator 11: Árbitro** — perfil de cartões/pênaltis | `engine/scoring.ts` | 🟢 Médio |
| 3.2 | **Fator 12: Clima** — chuva forte = instabilidade (open-meteo.com, grátis) | `connectors/weather.ts` (criar) | 🟢 Médio |
| 3.3 | **Fator 13: Calendário paralelo** — Copa do Brasil/Libertadores na semana | `engine/scoring.ts` | 🟢 Médio |
| 3.4 | **Fator 14: Pressão de posição** — Z4 ou disputando título | `engine/scoring.ts` | 🟢 Médio |
| 3.5 | **Fator 15: Histórico no estádio** — mandante no estádio específico | `engine/scoring.ts` | 🟢 Médio |
| 3.6 | **Redistribuir pesos** — soma = 100 com 15 fatores | `engine/scoring.ts` | 🟢 Médio |

### SPRINT 4 — Dashboard Premium

| # | Item | Arquivo | Severidade |
|---|------|---------|------------|
| 4.1 | **Escudos dos times** renderizados — `getTeamAssetsMap()` existe mas não aparece nos cards | `app/dashboard/page.tsx` | 🟡 Alto |
| 4.2 | **Âncoras interativas** — ✅ Aceitar / ❌ Rejeitar / ℹ️ Por quê? com breakdown de fatores | `components/anchor-card.tsx` | 🟡 Alto |
| 4.3 | **Score visual das âncoras** — barra 0–100 com tooltip por fator | `components/anchor-card.tsx` | 🟢 Médio |
| 4.4 | **Variações com visual premium** — odd em destaque, risco por cor, picks com escudos | `components/variation-card.tsx` | 🟢 Médio |
| 4.5 | **Remover jargão técnico** no header do dashboard | `app/dashboard/page.tsx` | 🟢 Médio |
| 4.6 | **Data/hora real do primeiro jogo** em vez de "T-1h do primeiro bloco" | `app/dashboard/page.tsx` | 🟡 Alto |

### SPRINT 5 — Apostas: Fases Pendentes

> O backend do BOB Bet Analyzer foi criado. Faltam as fases de pós-análise:

| # | Item | Arquivo | Severidade |
|---|------|---------|------------|
| 5.1 | **Grading automático** — cron `grade-suggestions` marca WON/LOST após encerramento | `api/cron/grade-suggestions/route.ts` (criar) | 🟡 Alto |
| 5.2 | **`getBobPerformanceStats()`** — taxa de acerto por perfil + ROI simulado | `lib/bob/bet-analyzer.ts` | 🟡 Alto |
| 5.3 | **Aba "Histórico BOB"** — mostra acertos históricos, ROI, melhor perfil | `app/apostas/apostas-client.tsx` | 🟡 Alto |
| 5.4 | **Odds reais** nas sugestões — integrar OddsPapi no `bet-analyzer.ts` | `lib/bob/bet-analyzer.ts` | 🟡 Alto |
| 5.5 | **Match stats panel** — H2H, forma recente, artilheiros ao expandir partida | `app/apostas/apostas-client.tsx` | 🟢 Médio |

### SPRINT 6 — Brain Console: Evolução Visual

> O Brain Observatory foi reescrito com visual premium básico. Falta o nível do mockup:

| # | Item | Arquivo | Severidade |
|---|------|---------|------------|
| 6.1 | **Grafo SVG interativo** — nós clicáveis (Football Data, Claude, OddsPapi, etc.) com linhas animadas | `components/admin/brain-observatory.tsx` | 🟡 Alto |
| 6.2 | **Drawer de nó** — ao clicar em nó: status, último evento, latência, contribuições | `components/admin/brain-observatory.tsx` | 🟡 Alto |
| 6.3 | **SSE endpoint** `GET /api/bob/brain/stream` — stream de eventos em tempo real | `api/bob/brain/stream/route.ts` (criar) | 🟢 Médio |
| 6.4 | **`GET /api/bob/brain/node/[id]`** — detalhes de nó específico | `api/bob/brain/node/[id]/route.ts` (criar) | 🟢 Médio |
| 6.5 | **Cores por domínio** — azul/ciano=memória, verde=integrações, roxo=IA, dourado=aprendizado | `components/admin/brain-observatory.tsx` | 🟢 Médio |
| 6.6 | **Filtros por período/tipo** no feed de cognições | `components/admin/brain-observatory.tsx` | 🟢 Médio |

### SPRINT 7 — Features Complementares

| # | Item | Arquivo | Severidade |
|---|------|---------|------------|
| 7.1 | **Probabilidades de Título/Rebaixamento** na tabela classificação | `app/classificacao/page.tsx` | 🟡 Alto |
| 7.2 | **Zebra Alert** — "⚡ Oportunidade de Zebra" no dashboard | `app/dashboard/page.tsx` | 🟢 Médio |
| 7.3 | **Calendário paralelo** — indicar Copa/Libertadores na tela de jogo | `app/estatisticas/page.tsx` | 🟢 Médio |

### SPRINT 8 — Segurança e Qualidade

| # | Item | Arquivo | Severidade |
|---|------|---------|------------|
| 8.1 | **Rate limiting** por usuário — Vercel KV ou middleware | `middleware.ts` | 🟡 Alto |
| 8.2 | **`dual-mind.ts` wiring** no pipeline real de rodada | `api/cron/pre-round/route.ts` | 🟡 Alto |
| 8.3 | **Testes unitários** — scoring.ts (10+ cases), variations.ts (diversidade) | `__tests__/` (criar) | 🟢 Médio |
| 8.4 | **Responsividade** mobile-first em todas páginas | global | 🟢 Médio |
| 8.5 | **Loading skeletons** em vez de spinners | global | 🟢 Médio |
| 8.6 | **Error boundaries** com mensagens BOB-friendly | global | 🟢 Médio |

---

## 🗓️ FASES DE IMPLEMENTAÇÃO — ORDEM PRIORITÁRIA

### FASE 1 — Bugs Críticos (Sprints 1 + 4.6) — PRÓXIMA
**Objetivo:** Tornar o produto apresentável em uso real.
**Duração estimada:** 1 sessão

```
1. variations.ts — validação anti-sobreposição V3/V4 (>80% picks iguais → rebuild)
2. chat-widget.tsx — instalar react-markdown, persistência localStorage
3. dashboard/page.tsx — data real do primeiro jogo em vez de "T-1h"
4. personality.ts — adicionar BOB_FAITH completo
5. abertura-diaria-banner.tsx — wiring real no dashboard (1x/24h)
```

### FASE 2 — Odds e Dados Reais (Sprint 2)
**Objetivo:** Motor operando com dados 100% reais.
**Desbloqueado por:** Fase 1

```
1. Verificar ODDSPAPI_KEY no Vercel
2. connectors/index.ts — corrigir absenceRate, bigGameAhead, homeOddDropped
3. bet-analyzer.ts — integrar OddsPapi para odds reais nas sugestões
4. oddspapi.ts — expandir para BTTS e Over/Under
```

### FASE 3 — Motor 15 Fatores (Sprint 3)
**Objetivo:** Precisão analítica máxima.
**Desbloqueado por:** Fase 2

```
1. connectors/weather.ts — open-meteo.com (grátis, sem key)
2. engine/scoring.ts — fatores 11 a 15 + redistribuição de pesos
```

### FASE 4 — Dashboard Premium (Sprint 4)
**Objetivo:** Interface de produto real, não protótipo.
**Pode rodar paralelo com Fase 3**

```
1. anchor-card.tsx — breakdown de fatores (Por quê?), aceitar/rejeitar
2. variation-card.tsx — odds destaque, risco por cor, escudos
3. dashboard/page.tsx — escudos + layout premium
```

### FASE 5 — Apostas Completa (Sprint 5)
**Objetivo:** BOB Bet Analyzer com histórico de acertos e ROI.
**Desbloqueado por:** Fase 2

```
1. api/cron/grade-suggestions — WON/LOST automático
2. lib/bob/bet-analyzer.ts — getBobPerformanceStats()
3. apostas-client.tsx — aba Histórico BOB com métricas reais
4. apostas-client.tsx — match stats panel (H2H, forma, artilheiros)
```

### FASE 6 — Brain Console Premium (Sprint 6)
**Objetivo:** Grafo interativo conforme mockup e spec.
**Pode rodar paralelo com Fase 5**

```
1. brain-observatory.tsx — grafo SVG com nós + linhas animadas (xyflow ou SVG puro)
2. brain-observatory.tsx — drawer de nó (detalhes reais ao clicar)
3. api/bob/brain/stream/route.ts — SSE endpoint em tempo real
4. api/bob/brain/node/[id]/route.ts — endpoint de detalhe de nó
```

### FASE 7 — Features Complementares (Sprint 7)
**Objetivo:** Completude do produto.

```
1. classificacao/page.tsx — probabilidades de título/rebaixamento
2. dashboard/page.tsx — Zebra Alert
```

### FASE 8 — Segurança e Qualidade (Sprint 8)
**Objetivo:** Produto seguro, testado e robusto.

```
1. Rate limiting por usuário
2. dual-mind wiring no pre-round
3. Testes unitários scoring + variations
4. Polish mobile + skeletons + error boundaries
```

---

## 🔑 REGRAS DE NEGÓCIO IMUTÁVEIS

1. **5 variações por rodada** — SEMPRE. Nunca menos, nunca mais.
2. **Variações idênticas para todos os usuários** — mesma rodada = mesmas variações.
3. **Máximo 4 âncoras** — score ≥ 60, resultado "1", odd ≤ 2.20, value edge positivo.
4. **Clássicos nunca são âncoras** — score capped em 55.
5. **Pisos de odd:** V1: 500× | V2: 800× | V3: 800× | V4: 1000× | V5: 1000×.
6. **Whitelist obrigatória** — só emails aprovados acessam o dashboard.
7. **Admin imutável:** nilson.brites@gmail.com.
8. **Lógica server-only** — scoring, variações, calibração NUNCA no client bundle.
9. **Sem promessas de ganho** — BOB é analista, não guru.
10. **Personalidade quântica é IRREVOGÁVEL** — BOB_FAITH não pode ser removida ou diluída.
11. **Dark mode é o padrão** — light mode é opt-in.
12. **Nome:** BOB — Big Odds Brasileirão (NUNCA "Big Odds Bot").

---

## 📦 VARIÁVEIS DE AMBIENTE (Vercel)

| Variável | Status | Observação |
|----------|--------|------------|
| `FOOTBALL_DATA_TOKEN` | ✅ | Primário BSA 2026 |
| `OPENAI_API_KEY` | ✅ | GPT-4o-mini narrativa |
| `ANTHROPIC_API_KEY` | ✅ | Claude Sonnet análise |
| `DATABASE_URL` | ✅ | Transaction pooler :6543 |
| `DIRECT_URL` | ✅ | Para migrations |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | ✅ | |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | |
| `CRON_SECRET` | ✅ | Auth dos crons |
| `ODDSPAPI_KEY` | ⚠️ **Verificar** | `3bb21879-55aa-4fc0-8ce3-4f3e6e14c519` — pode estar faltando no Vercel |
| `API_FOOTBALL_KEY` | Opcional | Backfill histórico 2022-2024 |

---

## 🗃️ MIGRATIONS PENDENTES

```sql
-- 005_brain_graph.sql (quando implementar Knowledge Graph)
CREATE TABLE IF NOT EXISTS memory_nodes (...);
CREATE TABLE IF NOT EXISTS memory_edges (...);

-- 006_historical_results.sql (quando implementar Fase 3/backfill histórico)
CREATE TABLE IF NOT EXISTS historical_results (...);

-- (simulation_results já existe via 003_memory_deep.sql — verificar)
```

---

## 📊 PROGRESSO GERAL

| Sprint | Nome | Status | % |
|--------|------|--------|---|
| 0–8 | MVP + Auth + PWA + Scoring | ✅ Completo | 100% |
| 9 legado | Personalidade + Memoria | ✅ Completo | 90% |
| Fase A | BOB Bet Analyzer backend | ✅ Completo | 100% |
| Fase B | BOB Bet Analyzer UI | ✅ Completo | 75% (falta grading/histórico) |
| Fase E | Brain Console backend | ✅ Completo | 80% (falta SSE/node endpoint) |
| Fase F | Brain Console visual premium | ✅ Básico completo | 60% (falta grafo interativo) |
| Sprint 1 | Bugs críticos | ⬜ Pendente | 0% |
| Sprint 2 | Dados reais | ⬜ Pendente | 20% (conectores existem) |
| Sprint 3 | 15 fatores | ⬜ Pendente | 0% |
| Sprint 4 | Dashboard premium | ⬜ Pendente | 30% |
| Sprint 7 | Features complementares | ⬜ Pendente | 0% |
| Sprint 8 | Segurança + testes | ⬜ Pendente | 0% |

**Estimativa geral: ~55% do produto planejado implementado.**
