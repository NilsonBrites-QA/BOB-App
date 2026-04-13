# PLANO DEFINITIVO — BOB: Big Odds Brasileirão (V3)

> Documento-mestre de implementação. Cada item é um checklist rastreável.
> Nome oficial: **BOB — Big Odds Brasileirão** (nunca "Big Odds Bot").
> Última atualização: sessão de planejamento completo.

---

## 0. CONTEXTO RAPIDÍSSIMO

| Item | Valor |
|------|-------|
| Stack | Next.js 16.2, Prisma 6, Supabase PostgreSQL, Vercel |
| LLMs | Claude Sonnet 4.5 (analista cognitivo) + GPT-4o-mini (narrativa) |
| Dados primários | football-data.org (BSA 2026, free, 10 req/min) |
| Dados complementares | API-Football (2022-2024 histórico), TheSportsDB (escudos), open-meteo.com (clima) |
| Vercel project | `bob-app` → `bob-app-kappa.vercel.app` |
| Supabase ref | `zravuslhqluaxjuakecp` · `aws-1-sa-east-1.pooler.supabase.com:6543` |
| Autenticação | Supabase Auth (Magic Link OTP) + whitelist admin |

---

## 1. IDENTIDADE E PERSONALIDADE — IRREVOGÁVEL

### 1.1 Quem é o BOB

- **Nome completo:** BOB — Big Odds Brasileirão
- **Acrônimo:** B.O.B. = Big Odds Brasileirão
- **Missão:** Ser o analista mais preciso do Brasileirão — sem promessas, só evidência
- **Origem:** Nasceu na favela, enriquecendo com inteligência e método
- **Tom:** Humor com inteligência, linguagem acessível mas técnica quando precisa
- **NUNCA:** linguagem de cassino, promessa de ganho, "aposte agora", "garanta seu lucro"

### 1.2 BOB_FAITH — Lei da Atração Aplicada

A personalidade quântica do BOB **não é** apenas "5 cenários simultâneos". O conceito real:

- **Fé = certeza de resultado antes de ver.** BOB acredita no método, acredita nos dados, acredita que é possível.
- **"Se alguém fez, é possível"** — tipsters reais (Camillo e outros) já acertaram super odds. Se um humano com intuição consegue, um motor analítico com dados, padrões e IA tem as ferramentas para buscar isso. NÃO é "Flamengo venceu 8 H2H então é padrão real" — isso é apenas estatística básica.
- **Frequência positiva:** BOB nunca transmite frustração, desânimo ou negatividade. Ele faz o usuário ACREDITAR indiretamente — mantém alta frequência, positividade, confiança no processo.
- **Superposição:** 5 variações simultâneas representam 5 realidades possíveis coexistindo — cada uma é válida até o "colapso" (resultado real).
- **Auto-evolução:** BOB aprende, calibra pesos, reflete — não é estático. A fé é no PROCESSO de melhoria contínua.

### 1.3 Tom Quântico nas Mensagens

| Contexto | Tom |
|----------|-----|
| Abertura diária | Positivo, confiante, frase motivacional + status da rodada |
| Entrega de análise | Assertivo, técnico mas acessível, sem arrogância |
| Rodada com erros | Honesto mas NUNCA derrotista. "Aprendi X. Ajustei Y. Seguimos." |
| Chat casual | Humor inteligente, referências culturais, personalidade forte |
| Admin | Técnico puro, cita fatores/pesos/deltas |

### 1.4 Checklist Personalidade

- [ ] Renomear "Big Odds Bot" → "Big Odds Brasileirão" em TODOS os arquivos (✅ código feito — faltam docs históricos)
- [ ] Adicionar `BOB_FAITH` em `personality.ts` com as definições acima
- [ ] Revisar `BOB_QUANTUM` — expandir manifesto com conceito de fé/atração
- [ ] Revisar `BOB_SYSTEM_PROMPT` — injetar tom quântico correto
- [ ] Implementar `aberturaDiaria()` com frase positiva + status real da rodada
- [ ] Wiring: abertura diária exibida no dashboard quando usuário acessa primeira vez em 24h
- [ ] Revisar todas as mensagens de erro — tom positivo conforme `BOB_COPY.erros`

---

## 2. SPRINTS DE IMPLEMENTAÇÃO

---

### SPRINT 1 — Correções Críticas e Base

**Objetivo:** Corrigir bugs bloqueadores, implementar personalidade real, tornar chat usável.

#### 1A. Bug: Variações V3/V4 Idênticas
- [ ] Diagnosticar `boostToFloor()` em `variations.ts` — quando pool é pequeno, V3 e V4 geram picks idênticos
- [ ] Implementar validação de sobreposição: se >80% dos picks são iguais entre duas variações, forçar rebuild da segunda
- [ ] Cada variação deve ter perfil de risco REALMENTE distinto:
  - V1 (Segurança): 4 âncoras + fills conservadores, piso 500x
  - V2 (Equilíbrio): 3 âncoras + empates em zona cinza, piso 800x
  - V3 (Lógica Pura): favoritos + lógica estatística pura (sem contrarians), piso 800x
  - V4 (Curta de pressão): menos jogos, maior odd por jogo, contrarian explícito, piso 1000x
  - V5 (Extrema): empates + azarões dominam, piso 1000x
- [ ] Adicionar seed de diversificação por variação (ex: embaralhar fill pool diferente para cada)
- [ ] Teste: gerar variações para 3 rodadas reais, verificar que NENHUM par tem >70% de sobreposição

#### 1B. Chat com Markdown
- [ ] Instalar `react-markdown` + `remark-gfm`
- [ ] Substituir `{m.content}` por `<ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>`
- [ ] Estilizar: bold, italic, listas, código inline, links — com classes Tailwind
- [ ] Avatar do BOB: usar `bob-logo.png` em vez do "B" no círculo
- [ ] Manter avatar 32px circular, com fallback "B" se imagem falhar

#### 1C. Remover "T-1h do Primeiro Bloco"
- [ ] Remover hardcoded "T - 1h do primeiro bloco" do dashboard
- [ ] Substituir por data/hora REAL do primeiro jogo da rodada (vem de `fixtures`)
- [ ] Formato: "Primeiro jogo: Sáb, 12 Abr · 16:00" (ou similar)
- [ ] Se não houver data disponível: "Data a definir pelo CBF"

#### 1D. Persistência do Chat
- [ ] Salvar mensagens no `localStorage` (key: `bob-chat-{userId}`)
- [ ] Restaurar ao reabrir o widget
- [ ] Limitar a últimas 50 mensagens no storage
- [ ] Botão "Limpar conversa" no header do chat

---

### SPRINT 2 — Expansão de Dados e Conhecimento

**Objetivo:** Enriquecer o motor com mais fontes de dados e criar base de conhecimento evolutiva.

#### 2A. Motor 15+ Fatores (expandir scoring.ts)
- [ ] Fator 11: **Árbitro** — perfil de cartões/pênaltis (fonte: manual ou scraping futuro)
- [ ] Fator 12: **Clima** — API open-meteo.com (grátis, sem key), chuva forte = instabilidade
- [ ] Fator 13: **Calendário paralelo** — detectar Copa do Brasil/Libertadores na semana
- [ ] Fator 14: **Pressão de posição** — times em Z4 ou disputando título (diferente de motivation)
- [ ] Fator 15: **Histórico no estádio** — performance do mandante no estádio específico
- [ ] Redistribuir pesos para soma = 100 com 15 fatores
- [ ] Teste: scoring de rodada real com 10 vs 15 fatores, comparar âncoras selecionadas

#### 2B. Conector de Clima (open-meteo.com)
- [ ] Criar `connectors/weather.ts`
- [ ] Endpoint: `api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&hourly=precipitation,temperature_2m`
- [ ] Mapear cidade → coordenadas para os 20 times/estádios do Brasileirão
- [ ] Retorno simplificado: `{ rain: boolean, intensity: "light"|"moderate"|"heavy", temp: number }`
- [ ] Integrar no pipeline de `connectors/index.ts`

#### 2C. Backfill Histórico (Temporadas 2023-2025)
- [ ] Usar API-Football (free: 2022-2024) para importar resultados históricos
- [ ] Salvar em tabela `historical_results` (nova migration)
- [ ] Calcular padrões: "times que mais surpreendem fora", "rodadas com mais zebras", etc.
- [ ] Usar como input para fatores de contexto histórico

#### 2D. Knowledge Graph (Memória Profunda)
- [ ] Migration: criar tabelas `memory_nodes` + `memory_edges` (grafo tipo Obsidian)
- [ ] Nodes: times, jogadores, rodadas, padrões, insights
- [ ] Edges: relações tipadas (venceu, perdeu_para, joga_no_estadio, sofreu_goleada_de, etc.)
- [ ] Motor de consulta: `queryGraph(subject, relation, depth)` → retorna subgrafo relevante
- [ ] Alimentar grafo automaticamente após cada rodada processada

---

### SPRINT 3 — Dashboard Premium

**Objetivo:** Redesenhar o dashboard para parecer um produto real, não um protótipo.

#### 3A. Escudos dos Times
- [ ] `getTeamAssetsMap()` do TheSportsDB já retorna URLs dos escudos — USAR
- [ ] Renderizar escudo 32px ao lado do nome de cada time (âncoras, variações, fatores)
- [ ] Fallback: iniciais do time em círculo colorido se imagem falhar
- [ ] Cache de escudos no `localStorage` para não re-baixar

#### 3B. Âncoras Interativas (Aceitar/Rejeitar)
- [ ] Cada âncora deve ter botões: ✅ Aceitar | ❌ Rejeitar | ℹ️ Por quê?
- [ ] "Por quê?" expande explicação detalhada dos fatores que selecionaram aquela âncora
- [ ] "Rejeitar" remove daquela rodada (via query param `excluded=`) e recalcula variações
- [ ] Exibir score numérico (0-100) em barra de progresso visual
- [ ] Tooltip com breakdown dos 15 fatores e seus pesos individuais

#### 3C. Variações com Visual Premium
- [ ] Cada variação em card com: nome, postura, odd projetada em destaque, # jogos
- [ ] Picks dentro do card: escudo + nome time + resultado sugerido + odd individual
- [ ] Odd total em destaque grande (ex: "1.564x") com cor diferenciada por faixa
- [ ] Indicador visual de risco: verde (conservador) → amarelo (moderado) → vermelho (agressivo)

#### 3D. Layout Redesign
- [ ] Remover jargão técnico do header ("cutoff operacional", "política de lineups")
- [ ] Substituir por informações úteis: data do primeiro jogo, rodada #, status (ao vivo/programada/encerrada)
- [ ] Seção de âncoras como destaque principal (cards grandes, visuais)
- [ ] Variações em accordion/tabs para não poluir a tela
- [ ] Narrativa do BOB em card de destaque com avatar bob-logo.png
- [ ] Aplicar skill `premium-ui-layout` em todos os componentes

---

### SPRINT 4 — Simulação Retroativa Cega

**Objetivo:** BOB simula as rodadas 1 a N de forma autônoma, como se estivesse apostando de verdade.

#### 4A. Engine de Simulação
- [ ] Criar `lib/bob/engine/blind-simulation.ts`
- [ ] BOB processa rodada passada SEM ver resultados → gera âncoras + variações
- [ ] Depois compara com resultados reais → marca green/red por pick
- [ ] Calcula: acurácia de âncoras, acurácia por variação, odd acumulada real vs projetada
- [ ] Salvar resultados em tabela `simulation_results` (nova migration)

#### 4B. Autonomia
- [ ] BOB decide QUANDO simular (não é cron fixo)
- [ ] Trigger: após calibrar pesos da rodada atual, simula a próxima rodada passada pendente
- [ ] Fila: processa rodadas na ordem (1→2→3...), sem pular
- [ ] Rate-limit: máximo 1 simulação por execução do cron (para não estourar API)

#### 4C. Aprendizado da Simulação
- [ ] Resultados da simulação alimentam o calibrador ABQC
- [ ] Se simulação mostra padrão (ex: "fator h2h superestimado"), ajusta pesos
- [ ] BOB registra reflexão específica da simulação (separada da reflexão de rodada real)
- [ ] Dashboard admin: exibir progresso da simulação (rodada X de 38)

---

### SPRINT 5 — Página de Estatísticas

**Objetivo:** Página dedicada de análise de cada jogo da rodada.

#### 5A. Página `/estatisticas`
- [ ] Restrita a usuários logados (middleware de auth)
- [ ] Grid de 10 jogos da rodada com cards clicáveis
- [ ] Cada card: escudos + placar projetado + probabilidades + status

#### 5B. Análise Individual do Jogo (expandir card)
- [ ] Ao clicar: modal/página de detalhe com:
  - Confronto: Escudo A × Escudo B
  - Classificação atual dos dois times
  - Últimos 5 resultados de cada (W/D/L com escudos dos adversários)
  - H2H: últimos 5 confrontos diretos
  - Fatores do motor: 15 fatores com nota de 0-100 cada
  - Previsão BOB: resultado sugerido + odd + confiança
  - Contexto extra: calendário paralelo, clima, árbitro (quando disponível)

#### 5C. Previsão BOB por Jogo
- [ ] BOB emite previsão para TODOS os 10 jogos (não só âncoras)
- [ ] Formato: "Resultado mais provável: Vitória Mandante (72%) | Empate (18%) | Vitória Visitante (10%)"
- [ ] Score de confiança: baixa (<50), média (50-70), alta (>70)
- [ ] Explicação em 2-3 frases do racional

---

### SPRINT 6 — Features Complementares

**Objetivo:** Funcionalidades que enriquecem a experiência.

#### 6A. Oportunidade de Zebra
- [ ] Jogo com visitante forte (top 6) jogando fora contra mandante fraco (bottom 6) MAS:
  - Mandante com boa sequência em casa
  - Visitante com calendário pesado (Copa/Libertadores na semana)
  - Visitante com desfalques
- [ ] Flag visual especial: "⚡ Oportunidade de Zebra" no dashboard
- [ ] Não é âncora — é destaque informativo para o usuário decidir
- [ ] Explicação do "por quê" de cada zebra potencial

#### 6B. Tabela do Brasileirão em Tempo Real
- [ ] Componente com classificação atualizada (football-data.org `/standings`)
- [ ] Cores por zona: G4 verde, neutro cinza, Z4 vermelho
- [ ] Acessível via sidebar ou tab no dashboard
- [ ] Cache de 1h (standings mudam pouco)

#### 6C. Probabilidades de Título e Rebaixamento
- [ ] Cálculo simples baseado em pontos restantes e saldo
- [ ] Ex: "Pontos possíveis: 72. Para título precisa de ~70. Probabilidade: Alta"
- [ ] Ex: "Pontos possíveis: 38. Para escapar do Z4 precisa de ~45. Probabilidade: Crítica"
- [ ] Exibir como badge colorido ao lado de cada time na tabela
- [ ] Atualizar automaticamente a cada rodada

#### 6D. Calendário de Jogos
- [ ] Visão mensal/semanal dos jogos do Brasileirão
- [ ] Indicador de jogos já analisados pelo BOB
- [ ] Link rápido para dashboard da rodada correspondente

---

### SPRINT 7 — Histórico de Variações

**Objetivo:** Usuário pode ver variações de rodadas passadas com indicação de acerto/erro.

#### 7A. Página `/historico`
- [ ] Lista de rodadas processadas (1, 2, 3, ..., N)
- [ ] Cada número de rodada é CLICÁVEL
- [ ] Ao clicar: exibe as 5 variações daquela rodada

#### 7B. Green/Red por Pick
- [ ] Cada pick dentro de cada variação:
  - ✅ Verde: resultado acertou
  - ❌ Vermelho: resultado errou
  - ⏳ Cinza: jogo ainda não aconteceu
- [ ] Visual: escudo do time + resultado + odd + badge de cor

#### 7C. Green/Red por Variação
- [ ] Variação inteira:
  - 🟢 Verde: TODOS os picks corretos (bilhete vencedor!)
  - 🔴 Vermelho: pelo menos 1 pick errou
  - ⏳ Cinza: rodada em andamento
- [ ] Exibir: "Acertou 7/9 picks · Odd: 1.234x · Status: ❌"
- [ ] Destaque especial se alguma variação VENCEU (todas corretas): card dourado

#### 7D. Métricas Acumuladas
- [ ] Ao longo de N rodadas: % de acerto de âncoras, % por variação
- [ ] Gráfico de evolução: acurácia por rodada (linha crescente = aprendizado)
- [ ] Total de variações vencedoras vs total gerado

---

### SPRINT 8 — Segurança, Polimento e Testes

**Objetivo:** Proteger o motor, polir a experiência, garantir qualidade.

#### 8A. Segurança Anti-Cópia
- [ ] Scoring engine, variations, calibrator: server-only (nunca expor no client bundle)
- [ ] API routes: validar JWT/session em TODAS as rotas protegidas
- [ ] Rate limiting: máximo 60 req/min por usuário (Vercel KV ou middleware)
- [ ] Variações e âncoras: servir via API (não SSR com dados no HTML source)
- [ ] Ofuscar nomes de fatores/pesos no client (usar IDs genéricos)
- [ ] Whitelist ativa: só emails aprovados acessam dashboard

#### 8B. Wiring Completo
- [ ] Conectar `cognitive-analyst.ts` ao dashboard (enriquecimento de zona cinza)
- [ ] Conectar `dual-mind.ts` ao pipeline de rodada (reflexão paralela)
- [ ] Conectar `self-reflection.ts` ao cron pós-rodada
- [ ] Conectar `aberturaDiaria()` ao greeting do dashboard
- [ ] Conectar `calibrator.ts (ABQC)` ao cron de calibração
- [ ] Verificar: TODA feature implementada no backend está exposta na UI

#### 8C. Testes
- [ ] Testes unitários para `scoring.ts` (10+ cases: clássico, time em Z4, líder, etc.)
- [ ] Testes unitários para `variations.ts` (validar 5 variações distintas)
- [ ] Testes de integração para pipeline completo (fetch → score → variations)
- [ ] Teste de regressão: V3 ≠ V4 com pool pequeno
- [ ] Snapshot test do dashboard (Playwright ou similar)

#### 8D. Polimento Final
- [ ] Responsividade: mobile-first em TODAS as páginas
- [ ] Loading states: skeletons em vez de spinners onde possível
- [ ] Error boundaries: mensagens BOB-friendly em caso de falha
- [ ] Acessibilidade: aria-labels nos botões, contraste adequado
- [ ] Performance: lazy load de componentes pesados, image optimization
- [ ] Favicon e PWA: verificar em iOS e Android

---

## 3. BUGS CONHECIDOS (CORRIGIR IMEDIATAMENTE EM CADA SPRINT)

| Bug | Arquivo | Severidade | Sprint |
|-----|---------|------------|--------|
| V3 e V4 idênticos quando pool pequeno | `variations.ts` | 🔴 Crítico | 1 |
| Chat renderiza plain text (sem markdown) | `chat-widget.tsx` | 🔴 Crítico | 1 |
| "T-1h do primeiro bloco" hardcoded | `dashboard/page.tsx` | 🟡 Alto | 1 |
| Odds estimadas, não reais | `connectors/index.ts` | 🟡 Alto | 2 |
| `absenceRate` sempre 0 | `connectors/index.ts` | 🟡 Alto | 2 |
| `bigGameAhead` sempre false | `connectors/index.ts` | 🟡 Alto | 2 |
| `homeOddDropped` sempre false | `connectors/index.ts` | 🟢 Médio | 2 |
| Escudos carregados mas nunca renderizados | `dashboard/page.tsx` | 🟡 Alto | 3 |
| `aberturaDiaria()` existe mas não wired | `personality.ts` | 🟢 Médio | 8 |
| `cognitive-analyst.ts` não conectado à UI | `cognitive-analyst.ts` | 🟡 Alto | 8 |
| `dual-mind.ts` não conectado à UI | `dual-mind.ts` | 🟡 Alto | 8 |
| `self-reflection.ts` não conectado | `self-reflection.ts` | 🟡 Alto | 8 |
| RoundStatus enum mismatch Prisma/DB | `schema.prisma` | 🟢 Médio | 1 |

---

## 4. MIGRATIONS PENDENTES

### Migration 004: Brain Schema
```sql
-- Tabelas novas
CREATE TABLE IF NOT EXISTS memory_nodes (...);
CREATE TABLE IF NOT EXISTS memory_edges (...);
CREATE TABLE IF NOT EXISTS historical_results (...);
CREATE TABLE IF NOT EXISTS simulation_results (...);
CREATE TABLE IF NOT EXISTS team_profiles (...);
CREATE TABLE IF NOT EXISTS stadium_profiles (...);
```

> Criar arquivo: `prisma/migrations/004_brain_schema.sql`
> Executar no SQL Editor do Supabase antes de rodar `prisma generate`

---

## 5. VARIÁVEIS DE AMBIENTE

| Var | Obrigatória | Onde |
|-----|-------------|------|
| `FOOTBALL_DATA_TOKEN` | ✅ | Vercel + .env.local |
| `OPENAI_API_KEY` | ✅ | Vercel + .env.local |
| `ANTHROPIC_API_KEY` | ✅ | Vercel + .env.local |
| `DATABASE_URL` | ✅ | Vercel + .env.local |
| `DIRECT_URL` | ✅ | Vercel + .env.local |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Vercel + .env.local |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | ✅ | Vercel + .env.local |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Vercel + .env.local |
| `CRON_SECRET` | ✅ | Vercel + .env.local |
| `API_FOOTBALL_KEY` | Opcional | Vercel (para backfill 2022-2024) |

---

## 6. ARQUIVOS-CHAVE DO PROJETO

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/lib/bob/engine/scoring.ts` | Motor de scoring (10→15 fatores) |
| `src/lib/bob/engine/variations.ts` | Gerador de 5 variações |
| `src/lib/bob/engine/calibrator.ts` | ABQC — auto-calibração de pesos |
| `src/lib/bob/engine/backtest.ts` | Backtesting por rodada/temporada |
| `src/lib/bob/personality.ts` | Identidade + BOB_FAITH + prompts |
| `src/lib/bob/ai/cognitive-analyst.ts` | Claude — reflexão + enriquecimento |
| `src/lib/bob/ai/dual-mind.ts` | Claude + GPT em paralelo |
| `src/lib/bob/ai/self-reflection.ts` | Orquestrador de auto-reflexão |
| `src/lib/bob/ai/narrative.ts` | Geração de narrativa (GPT) |
| `src/lib/bob/connectors/index.ts` | Pipeline de dados (fetch + normalize) |
| `src/lib/bob/connectors/football-data.ts` | Conector primário (BSA) |
| `src/lib/bob/connectors/thesportsdb.ts` | Escudos/badges dos times |
| `src/lib/bob/persist.ts` | Persistência DB (rounds, picks, etc.) |
| `src/components/chat-widget.tsx` | Chat flutuante |
| `src/app/dashboard/page.tsx` | Dashboard principal |
| `src/app/api/bob/chat/route.ts` | API do chat |

---

## 7. REGRAS DE NEGÓCIO IMUTÁVEIS

1. **5 variações por rodada** — SEMPRE. Nunca menos, nunca mais.
2. **Variações idênticas para todos os usuários** — não há personalização. Mesma rodada = mesmas variações.
3. **Máximo 4 âncoras** — score ≥ 60, resultado "1" (vitória mandante), odd ≤ 2.20, value edge positivo.
4. **Clássicos nunca são âncoras** — score capped em 55 (volatilidade estrutural).
5. **Pisos de odd:** V1: 500x | V2: 800x | V3: 800x | V4: 1000x | V5: 1000x.
6. **Whitelist obrigatória** — só emails aprovados pelo admin acessam o dashboard.
7. **Admin imutável:** nilson.brites@gmail.com.
8. **Lógica server-only** — scoring, variações, calibração NUNCA no client bundle.
9. **Sem promessas de ganho** — BOB é analista, não guru.
10. **Personalidade quântica é IRREVOGÁVEL** — não pode ser removida ou diluída.

---

## 8. PRINCÍPIOS DE ATUALIZAÇÃO

- **A cada mudança em qualquer arquivo, verificar consistência em TODOS os relacionados.**
- Nome "Big Odds Brasileirão" deve ser único e consistente em todo o codebase.
- Qualquer novo fator no scoring deve: ter peso, ser documentado, ter teste.
- Qualquer nova página deve: ter auth check, responsive, usar design system existente.
- Qualquer novo conector deve: ter fallback gracioso, rate-limit, cache.
- Qualquer novo cron deve: ter `Authorization: Bearer CRON_SECRET`, log de execução.

---

## 9. ORDEM DE EXECUÇÃO RECOMENDADA

```
Sprint 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
```

Cada sprint deve ser commitado separadamente com mensagem clara.
Não iniciar sprint N+1 sem sprint N funcional e deployado.

**Sprint 1 é BLOQUEADOR** — sem ele, o produto está quebrado (V3=V4, chat sem formatação, "T-1h" confuso).
