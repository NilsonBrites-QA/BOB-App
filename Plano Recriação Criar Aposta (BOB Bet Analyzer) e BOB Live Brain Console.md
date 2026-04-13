
## Plano: Recriação "Criar Aposta" (BOB Bet Analyzer) + BOB Live Brain Console

A feature "Apostas" atual está a ~15% do PRD — é um "manual bet builder" onde o **usuário** monta bilhetes clicando em odds 1×2. O PRD exige o oposto: **o BOB analisa** e entrega palpites prontos por perfil de apostador. A Brain Console já tem backend funcional mas visual tabular simples. OddsPapi está offline provavelmente por falta da env var no Vercel.

---

### Respostas às suas perguntas

**OddsPapi offline?** O conector em connectors/oddspapi.ts está implementado corretamente, mas a variável `ODDSPAPI_KEY` pode não estar configurada no Vercel. O código verifica `Boolean(process.env.ODDSPAPI_KEY)` e retorna `false`. Verificar em Vercel → Settings → Environment Variables.

**Cérebro em tempo real não funciona?** Na verdade funciona parcialmente: o endpoint `GET /api/bob/brain/status` retorna snapshot real (modo cognitivo, memórias, pesos, padrões) e o componente brain-observatory.tsx faz polling a cada 10s com merge de deltas. Porém o visual é um painel tabular simples — não o grafo interativo premium descrito na spec.

**Feature Apostas está errada?** Sim. O que está implementado vs. o que o PRD pede:

| O que tem | O que o PRD pede |
|-----------|-----------------|
| Usuário clica em odds e monta bilhete | BOB analisa e entrega palpites prontos |
| Só mercado 1×2 | 10+ mercados (BTTS, Over/Under, Escanteios, Cartões...) |
| Zero sugestões do BOB | 4 perfis (Conservador/Moderado/Agressivo/Matemático) |
| Sem justificativa | Justificativa detalhada por sugestão |
| Sem histórico de acertos | Taxa de acerto por perfil + ROI simulado |
| Tabela `bob_suggestions` vazia | Sugestões pré-calculadas salvas no BD |

---

### PARTE 1 — RECRIAÇÃO "CRIAR APOSTA"

**Fase A — Backend: Motor de Análise BOB** *(bloqueadora)*

1. Criar `apps/web/src/lib/bob/bet-analyzer.ts` — reutiliza `engine/scoring.ts` (10+  fatores) + `connectors/index.ts` (pipeline multi-API) + `ai/cognitive-analyst.ts` (callClaude). Para cada `BetMatch`, coleta dados → monta prompt → LLM retorna JSON com 4 perfis × mercados selecionados → salva em `bob_suggestions` (tabela já existe, vazia)
2. Criar `POST /api/bob/analyze-match` — aciona análise por partida
3. Criar `GET /api/bob/suggestions?matchId=X&profile=Y` — lista sugestões
4. Criar `GET /api/bob/suggestions/history` — histórico com stats
5. Criar cron `api/cron/analyze-round` — análise automática T-48h

**Fase B — Frontend: UI estilo Bet365** *(depende de A)*

1. Reescrever apostas-client.tsx — click em partida → expandir → 4 perfis com cards "Criar Aposta" estilo Bet365 (como nas imagens: nome da partida, lista de seleções BOB, odd combinada, justificativa toggle)
2. Criar `bob-suggestion-card.tsx` (card verde Bet365), `profile-selector.tsx` (tabs 4 perfis), `match-stats-panel.tsx` (H2H, forma, artilheiros)
3. Aba "Histórico BOB" com taxa acerto, ROI por perfil

**Fase C — OddsPapi / Odds Reais** *(paralela com B)*

1. Verificar `ODDSPAPI_KEY` no Vercel
2. Integrar odds reais no `bet-importer.ts`
3. Importar BTTS, Over/Under além de 1×2

**Fase D — Grading e Métricas** *(depende de A)*

1. Cron `grade-suggestions` — marca WON/LOST após encerramento
2. `getBobPerformanceStats()` — taxa acerto por perfil, ROI simulado
3. Renderizar na tab "Histórico BOB"

---

### PARTE 2 — BOB LIVE BRAIN CONSOLE

**Fase E — Evolução Backend** *(paralela com Parte 1)*

1. Criar SSE endpoint `GET /api/bob/brain/stream` — stream de MemoryEvents
2. Estender `/api/bob/brain/status` com health check de cada API (latência, último acesso, falhas), conhecimentos consolidados, estado cognitivo textual
3. Criar `GET /api/bob/brain/node/[id]` — detalhes de nó do grafo

**Fase F — Redesign Visual Premium** *(depende de E)*

1. Reescrever brain-observatory.tsx com layout do mockup
2. Núcleo central "BOB Brain" com pulsação CSS + grafo SVG com nós (Football Data, Claude, OpenAI, API-Football, OddsPapi, Cron) + linhas animadas
3. Painel esquerdo: Live Observabilidade + Feed de cognições + Integrações
4. Painel direito: Real Connections + Learned Knowledge
5. Tema premium: glow ciano, cores por domínio (azul=memória, verde=integração, roxo=IA, dourado=aprendizado)

**Fase G — Interatividade** *(depende de F)*

1. Click nó → drawer lateral com detalhes reais
2. Click memória → expandir conteúdo completo
3. Filtros por período, tipo de evento, origem

---

### Arquivos relevantes

- engine/scoring.ts — reutilizar `scoreMatch()` para análise
- ai/cognitive-analyst.ts — reutilizar `callClaude()` para sugestões
- connectors/index.ts — pipeline multi-API existente
- connectors/oddspapi.ts — conector pronto, precisa da env var
- brain-observatory.tsx — componente base para redesign
- api/bob/brain/status/route.ts — endpoint já rico, evoluir
- apostas-client.tsx — reescrever completamente
- prisma/schema.prisma — modelos BobSuggestion, BetMatch já existem

### Verificação

1. `npm run typecheck` — zero errors após cada fase
2. Sugestões BOB com `justification` não-nula em todas as `bob_suggestions`
3. Brain Console: 100% dados reais (nenhum mock/fake)
4. `/admin/cerebro` protegido por ADMIN role
5. `npx next build` sem erros
6. Teste E2E: partida → 4 perfis → justificativa visível

### Decisões

- **Stack**: PRD sugere tRPC/MySQL/Manus — ignorar, manter Next.js/Prisma/Supabase/Vercel existente
- **Mercados**: Iniciar com 1×2, BTTS, Over/Under, Dupla Chance (dados disponíveis). Jogador a Marcar = fase futura
- **LLM**: Claude Sonnet (já integrado) com fallback GPT-4o-mini  
- **Grafo do Brain**: SVG puro (sem dependência pesada) ou `@xyflow/react` se complexidade justificar

### Ordem de execução

1. **Fase A + E** (paralelo) — backends  
2. **Fase B + C** (paralelo) — frontend apostas + odds  
3. **Fase F** — brain console visual  
4. **Fase D** — histórico/métricas  
5. **Fase G** — interatividade brain  

Caminho crítico: **A → B → D** (apostas usáveis com histórico)  
Paralelo: **E → F → G** (brain console premium)