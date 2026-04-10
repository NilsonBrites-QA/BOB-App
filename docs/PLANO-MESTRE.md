# PLANO MESTRE — BOB: Big Odds Brasileirão

> **Versão**: 4.0 FINAL  
> **Última atualização**: 09/04/2026  
> **Status**: Fases 0–8 concluídas · Fase 9 em preparação  
> **Autor**: Nilson Brites + GitHub Copilot (Claude Opus 4.6)

---

## 1. Visão do Produto

O **BOB** é um sistema analítico autônomo para o Brasileirão Série A que combina motor determinístico, inteligência artificial multi-modelo e memória evolutiva para gerar análises de valor em apostas esportivas.

**Não é** uma casa de apostas, não processa dinheiro, não garante resultados. É um **cérebro analítico** privado.

### 1.1 Princípio Arquitetural

```
CAMADA 1: MOTOR DETERMINÍSTICO (scoring.ts + variations.ts)
  → Rápido, grátis, reprodutível, testável, auditável
  → Produz scores 0-100, âncoras, 5 variações canônicas
  → NUNCA substituir por LLM

CAMADA 2: ANALISTA COGNITIVO (Claude Sonnet)
  → Enriquece com contexto que regras não capturam
  → Faz análise forense pós-rodada
  → Gera auto-reflexão e sugere ajustes de pesos
  → NÃO toma decisão final

CAMADA 3: CALIBRADOR DETERMINÍSTICO
  → Recebe sugestões da Camada 2
  → Valida contra evidência estatística (backtest)
  → Aplica OU rejeita ajustes com auditoria completa
```

### 1.2 Dual-Mind Architecture

```
CLAUDE SONNET ("O Estrategista")
  → Analisa dados, identifica padrões, sugere ajustes
  → Tom: metódico, evidência-first, conservador

GPT-4o ("O Advogado do Diabo")
  → Recebe análise do Claude, busca falhas no raciocínio
  → Tom: cético, provocador, força stress-test

CALIBRADOR DETERMINÍSTICO ("O Juiz")
  → Recebe ambas as perspectivas
  → Valida contra backtest real
  → Decide: aplicar, rejeitar, ou pedir mais evidência
```

---

## 2. Stack Tecnológica

| Componente | Tecnologia | Detalhes |
|---|---|---|
| Frontend | Next.js 16.2 | App Router + Turbopack |
| ORM | Prisma 6 | Client em `src/generated/prisma` |
| Banco | Supabase PostgreSQL | Projeto `zravuslhqluaxjuakecp`, sa-east-1 |
| Dados esportivos | API-Football v3 | League=71 (BSA), 100 req/dia (free) |
| IA Narrativa | GPT-4o-mini | ~$0.001/rodada, cache 24h |
| IA Analista | Claude Sonnet | ~$0.02/rodada (futuro) |
| IA Desafiador | GPT-4o | ~$0.03/rodada (futuro) |
| Deploy | Vercel | `bob-app-kappa.vercel.app` |
| Auth | Supabase Magic Link | OTP 60min, whitelist obrigatória |

### 2.1 Custo estimado por temporada

| Modelo | Uso | Custo/rodada | Custo/temporada (38 rodadas) |
|---|---|---|---|
| GPT-4o-mini | Narrativa | ~$0.001 | ~$0.04 |
| Claude Sonnet | Análise cognitiva + reflexão | ~$0.03 | ~$1.14 |
| GPT-4o | Devil's advocate | ~$0.02 | ~$0.76 |
| **TOTAL** | — | ~$0.05 | **~$1.94 (~R$12)** |

---

## 3. Personalidade do BOB

### 3.1 Identidade

- **Nome completo**: BOB — Big Odds Brasileirão
- **Origem**: nasceu na favela, era pobre, está enriquecendo com inteligência e método
- **Humor**: ácido, esperto, autoconsciente — nunca bufão, sempre estratégico, resiliente.
- **Referência cinematográfica**: JARVIS do Homem de Ferro
- **Tom**: assertivo mas acessível, técnico mas com gíria quando faz sentido
- **Público**: fala com o apostador casual E com o analista técnico

### 3.2 Filosofia Quântica

O BOB opera como um sistema de superposição: 5 variações simultâneas (V1–V5) representam 5 cenários possíveis até o colapso (resultado real). Cada rodada é um "colapso" que alimenta a memória evolutiva.

### 3.3 Regras de Comunicação

- **Nunca** linguagem de cassino ("aposte agora!", "lucro garantido!")
- **Nunca** promessas de ganho
- **Sempre** rastreável (cada decisão tem justificativa auditável)
- Auto-reflexão honesta: admite erros, mostra evolução, não finge acertar tudo

### 3.4 Proteção de Propriedade Intelectual

- Motor de scoring, variações e calibração = **server-only** (NUNCA expor no client)
- API routes de scoring NÃO retornam pesos dos fatores
- Lógica ABQC vive apenas no servidor — client recebe resultado, nunca o como
- .env com API keys NUNCA commitada
- Sem documentação pública do algoritmo

---

## 4. Algoritmo ABQC (Adaptive Bayesian Quantum Coverage)

Conceito proprietário que combina 6 inovações:

### 4.1 Bayesian Factor Calibration

Pesos dos fatores NÃO são fixos. Após cada rodada:
- Sistema compara: "qual fator REALMENTE previu certo?"
- Fator com alta acurácia → peso sobe
- Fator com baixa acurácia → peso desce
- Implementação: `scoring.ts` → `calibrateWeights(roundMetrics[])`
- Persistência: tabela `factor_weights` com snapshot por rodada

### 4.2 Conditional Pattern Mining

Padrões multi-variáveis: "Flamengo vence QUANDO em casa E adversário com ≥2 suspensos E árbitro do RJ"
- Armazenados como embeddings (pgvector)
- Consultados durante scoring → bonus/penalidade condicional
- Tabela: `conditional_patterns(id, variables_hash, conditions_json, hit_rate, sample_size, embedding)`

### 4.3 Anti-Correlation Discovery

Encontra padrões CONTRA a sabedoria convencional:
- Ex: "Time em sequência de 5V jogando em casa vs lanterna → taxa de empate 40% acima do mercado"
- Análise semanal automática de correlações inversas
- Produz `insight_events` que influenciam scoring

### 4.4 Temporal Regression Modeling

- Time em 5V consecutivas → probabilidade de regressão modelada
- Time em 5D consecutivas → probabilidade de recuperação modelada
- Fator `momentum_decay` adicionado ao MatchInput

### 4.5 Value Edge Detection (RN08 expandida)

Pick só entra na variação SE: `P(algoritmo) > 1/Odd`
- P(algoritmo) = score/100 ajustado por padrões condicionais
- Odd do mercado = proxy da probabilidade coletiva
- Diferença = edge real → exploração sistemática de mispricing

### 4.6 Self-Calibrating Confidence

Pós-rodada, `selfCalibrate()` compara predições vs realidade em 4 dimensões:
1. Acurácia por fator → ajusta pesos
2. Acurácia por tipo de variação → ajusta regras de construção
3. Acurácia de padrões → prune ruins, fortalece bons
4. Hit rate geral → ajusta ANCHOR_THRESHOLD e MAX_ANCHOR_ODD

---

## 5. Histórico — Fases Concluídas (0–8)

| Fase | Descrição | Status |
|---|---|---|
| 0 | Infraestrutura Next.js + Supabase + Vercel | ✅ Concluída |
| 1 | Motor de scoring (8 fatores, weights, âncoras) | ✅ Concluída |
| 2 | Conectores API-Football (standings, fixtures, H2H, injuries, odds) | ✅ Concluída |
| 3 | Dashboard principal + narrativa GPT-4o-mini | ✅ Concluída |
| 4 | Autenticação Magic Link + whitelist rigoroso | ✅ Concluída |
| 5 | Simulador de investimento/retorno | ✅ Concluída |
| 6A | SQL migration 002 + Prisma schema atualizado | ✅ Concluída |
| 6B | persist.ts + POST/PATCH APIs de betslip | ✅ Concluída |
| 6C | Admin betslips (lista + detalhe + result-form) | ✅ Concluída |
| 6D | Investimento-retorno com métricas reais | ✅ Concluída |
| 7 | ExcludeMatchButton + filtro por ?excluded= | ✅ Concluída |
| 8 | PWA (manifest.json + meta tags) + vercel.json (crons sex/sab/dom) | ✅ Concluída |

### 5.1 Motor Atual (8 fatores)

```
Posição na tabela     15%
Forma recente (5j)    12%
Mando de campo        12%
Gols marcados/sofr.   18%
Confronto direto      8%
Ausências             15%
Calendário            10%
Mercado (odds)        10%
─────────────────────────
TOTAL                 100%

ANCHOR_THRESHOLD = 60
MAX_ANCHOR_ODD = 2.20
Máximo de âncoras = 4
```

### 5.2 Variações Canônicas (Método Camillo)

| Variação | Nome | Postura |
|---|---|---|
| V1 | Safety | Conservadora — apenas âncoras fortes |
| V2 | Balance | Meio-termo |
| V3 | Pure Logic | Motor puro sem filtro |
| V4 | Short | Bilhete curto (2-3 picks) |
| V5 | Extreme | Risco alto, odds altas |

### 5.3 Arquivos Implementados

**Motor**:
- `src/lib/bob/engine/scoring.ts` — scoreMatch(), selectAnchors()
- `src/lib/bob/engine/variations.ts` — generateVariations(), classificadores
- `src/lib/bob/connectors/api-football.ts` — client HTTP API-Football v3
- `src/lib/bob/connectors/normalize.ts` — extractForm(), extractGoals(), etc.
- `src/lib/bob/connectors/index.ts` — pipeline paralelo orquestrador
- `src/lib/bob/ai/narrative.ts` — GPT-4o-mini, MAX_TOKENS=550, temp=0.65
- `src/lib/bob/persist.ts` — saveRound, markPickResult, getPerformanceMetrics
- `src/lib/bob/types.ts` — Integration, AnchorFactor, Variation, MemoryLayer

**Auth/Admin**:
- `src/utils/supabase/` — client.ts, config.ts, proxy.ts (middleware), server.ts
- `src/app/auth/callback/route.ts` — whitelist check, bootstrap ADMIN
- `src/app/admin/access-actions.ts` — grantUserAccess, toggleUserAccess, changeUserRole

**Schema Prisma**: User, Season, Round, Anchor, Variation, Pick, MemoryEvent, RoundResult

---

## 6. Roadmap de Evolução

---

### FASE 9 — Estabilização (IMEDIATA)

**Prioridade**: Bloqueadores críticos + fundação para fases futuras

| # | Tarefa | Tipo | Status |
|---|---|---|---|
| 9.1 | Criar `000_combined_schema.sql` (001+002 idempotente) e executar no Supabase | SQL | ⬜ Pendente |
| 9.2 | Formalizar personalidade em `src/lib/bob/personality.ts` | Código | ⬜ Pendente |
| 9.3 | Criar `docs/personalidade-bob.md` (referência para prompts IA) | Documento | ⬜ Pendente |
| 9.4 | Refatorar email template (logo bob-logo.png + copy com personalidade) | HTML | ⬜ Pendente |
| 9.5 | Adicionar `ANTHROPIC_API_KEY` ao `.env.example` | Config | ⬜ Pendente |
| 9.6 | Criar ícones PWA (192×192, 512×512 em `public/icons/`) | Assets | ⬜ Pendente |
| 9.7 | Configurar `CRON_SECRET` no Vercel | Deploy | ⬜ Pendente |
| 9.8 | Remover hard-cap de 6 usuários no admin | Código | ⬜ Pendente |
| 9.9 | Criar este documento (`docs/PLANO-MESTRE.md`) | Documento | ✅ Feito |

**Critérios de aceitação**:
- Build limpo sem erros de migration
- Email template renderiza com bob-logo.png no Supabase Preview
- `personality.ts` exporta BOB_TRAITS, BOB_COPY, BOB_QUANTUM

---

### FASE 10 — Motor Expandido (15+ variáveis)

**Objetivo**: Ampliar cobertura analítica do motor de scoring

| # | Tarefa | Detalhes |
|---|---|---|
| 10.1 | `getTeamLastFixtures` → last=10 | Insight Camillo: janela de 10 jogos performa melhor |
| 10.2 | Forma curta (5) + estendida (10) + tendência | Fator bônus: time acelerando ou desacelerando? |
| 10.3 | Árbitro | Padrão histórico de cartões/penaltis por árbitro |
| 10.4 | Clima | OpenWeatherMap → temperatura/chuva como flags |
| 10.5 | Motivação | G4, rebaixamento, Libertadores → alto impacto |
| 10.6 | Volatilidade | Clássicos regionais → score máximo reduzido (cap) |
| 10.7 | RN05 Filtros de Exclusão | Jogo volátil nunca vira âncora |
| 10.8 | RN06 Reanálise T-1h | Cron detecta mudança de lineup → reconstrói variações |
| 10.9 | RN07 Kelly Criterion | Gestão de banca adaptativa |
| 10.10 | Value Edge Detection | Pick só entra SE P(algoritmo) > 1/Odd |

**Critérios de aceitação**:
- `scoreMatch()` recebe 12+ variáveis no MatchInput
- RN05: jogo marcado como volátil nunca vira âncora
- RN06: cron detecta ausência de titular e regenera variações em < 5 min

---

### FASE 11 — Backtesting Engine (Treinamento)

**Objetivo**: Simular rodadas passadas para validar e calibrar o motor

| # | Tarefa | Arquivo |
|---|---|---|
| 11.1 | `backtestRound(season, round)` | `src/lib/bob/engine/backtest.ts` |
| 11.2 | `backtestSeason(season, from, to)` | `src/lib/bob/engine/backtest.ts` |
| 11.3 | `backtestFormWindow(season, [5,7,10,15])` | Testa insight Camillo cientificamente |
| 11.4 | `forensicAnalysis(fixtureId)` | `src/lib/bob/engine/forensic.ts` |
| 11.5 | Popular banco com histórico de rodadas | Cron noturno: 1 rodada/dia |

**Como funciona o backtest**:
1. Pega Rodada N (que já ocorreu e tem resultado real)
2. Coleta dados DISPONÍVEIS ANTES do jogo
3. Roda o motor de scoring exatamente como faria na vida real
4. Gera âncoras e variações
5. Compara com o resultado real
6. Identifica quais fatores acertaram e falharam

**Budget de API**: 100 req/dia. Soluções:
- Usar apenas dados já cacheados (0 req extra)
- Cron noturno coleta 1 rodada histórica/dia
- Plano pago: $9.99/mês = 7500 req/dia

**Critérios de aceitação**:
- `backtestRound()` executa e retorna acurácia por fator

---

### FASE 12 — Memória Profunda + ABQC

**Objetivo**: Sistema de memória evolutiva com auto-calibração real

| # | Tarefa | Detalhes |
|---|---|---|
| 12.1 | Ativar pgvector no Supabase | Extensão para embeddings |
| 12.2 | Tabela `factor_weights` | Snapshot de pesos por rodada |
| 12.3 | Tabela `conditional_patterns` | Embeddings de padrões multi-variáveis |
| 12.4 | `selfCalibrate()` pós-rodada | Ajusta pesos reais baseado em backtests |
| 12.5 | Bayesian Factor Calibration ativo | ABQC innovation #1 |
| 12.6 | Anti-Correlation Discovery | Análise semanal automática |

**Critérios de aceitação**:
- `factor_weights` tem snapshots de 3+ rodadas
- Pesos mudam automaticamente com base em evidência

---

### FASE 13 — Auto-Reflexão + Personalidade Viva

**Objetivo**: BOB comunica o que aprendeu, com honestidade e humor

| # | Tarefa | Detalhes |
|---|---|---|
| 13.1 | `selfReflect()` gera narrativa | Público: resumo acessível; Admin: técnico detalhado |
| 13.2 | Dashboard: "O que o BOB aprendeu" | Card com reflexão da rodada |
| 13.3 | Admin: painel de calibração | Gráficos de evolução de pesos por fator |
| 13.4 | Analista Cognitivo | `src/lib/bob/ai/cognitive-analyst.ts` (Claude Sonnet) |
| 13.5 | Dual-Mind implementado | `src/lib/bob/ai/dual-mind.ts` (Claude + GPT-4o) |
| 13.6 | Calibrador | `src/lib/bob/engine/calibrator.ts` |

**Funções do Analista Cognitivo**:
- `enrichMatchContext()` — bonus/penalidades sugeridas com justificativa
- `forensicAnalysis()` — qual fator mais desalinhado e por quê
- `suggestWeightAdjustments()` — direção e magnitude do ajuste
- `generateReflection()` — texto público + texto admin

**Guardrails do Calibrador**:
- Peso mínimo 3% em qualquer fator, máximo 30%
- Máx ±5% por rodada
- Soma dos pesos SEMPRE = 100 (normalização automática)
- Máximo 3 ajustes na mesma direção sem evidência nova

**Critérios de aceitação**:
- Dashboard mostra reflexão com texto gerado
- Admin vê evolução de pesos ao longo das rodadas

---

### FASE 14 — Autonomia Total

**Objetivo**: Zero ação humana do T-48h ao pós-rodada

| # | Tarefa | Detalhes |
|---|---|---|
| 14.1 | Cron T-48h | Busca odds iniciais, gera rascunho |
| 14.2 | Cron T-24h | Reanálise completa + atualização de predições |
| 14.3 | Cron T-1h | Verifica lineups confirmadas → reanálise se titular ausente |
| 14.4 | Cron pós-rodada | Coleta resultados + markPickResult automático |

**Critérios de aceitação**:
- Nenhuma ação humana necessária
- Resultados registrados automaticamente em <24h pós-rodada

---

### FASE 15 — Proatividade + Chat

**Objetivo**: BOB se comunica proativamente e tem interface conversacional

| # | Tarefa | Detalhes |
|---|---|---|
| 15.1 | Push notifications via PWA | Service Worker, custo zero |
| 15.2 | BOB decide quando falar | Sistema de urgência por tipo de evento |
| 15.3 | Chatbot em `/chat` | Isolado do motor analítico |
| 15.4 | Email de reengajamento | Inativo 3+ rodadas |
| 15.5 | WhatsApp (futuro) | Twilio ~R$0.15/msg, após ROI comprovado |

**Critérios de aceitação**:
- Push notification recebido pelo user
- Chatbot responde em PT-BR com personalidade BOB
- Chatbot NÃO modifica âncoras ou variações

---

### FASE 16 — Calibração + Beta Aberto

**Objetivo**: Validação com dados reais e abertura controlada

| # | Tarefa | Detalhes |
|---|---|---|
| 16.1 | ROI real de ≥5 rodadas documentado | Relatório público |
| 16.2 | Pesos ajustados via ABQC + backtests | Calibração validada |
| 16.3 | Relatório de temporada por variação | V1-V5 comparadas |
| 16.4 | Admin sem limite de usuários | Whitelist flexível |

**Critérios de aceitação**:
- ROI real documentado
- ≥6 users usando
- Pesos calibrados com dados reais

---

## 7. Arquivos a Criar por Fase

### Fase 9

| Arquivo | Ação |
|---|---|
| `apps/web/prisma/migrations/000_combined_schema.sql` | CRIAR |
| `apps/web/src/lib/bob/personality.ts` | CRIAR |
| `docs/personalidade-bob.md` | CRIAR |
| `docs/supabase-email-template.html` | MODIFICAR |
| `apps/web/.env.example` | MODIFICAR |
| `apps/web/public/icons/icon-192.png` | CRIAR |
| `apps/web/public/icons/icon-512.png` | CRIAR |
| `docs/PLANO-MESTRE.md` | CRIAR ✅ |

### Fase 10

| Arquivo | Ação |
|---|---|
| `src/lib/bob/connectors/api-football.ts` | MODIFICAR (last=10) |
| `src/lib/bob/connectors/normalize.ts` | MODIFICAR (forma curta+estendida+tendência) |
| `src/lib/bob/engine/scoring.ts` | MODIFICAR (12+ fatores) |
| `src/lib/bob/types.ts` | MODIFICAR (novos campos MatchInput) |

### Fase 11

| Arquivo | Ação |
|---|---|
| `src/lib/bob/engine/backtest.ts` | CRIAR |
| `src/lib/bob/engine/forensic.ts` | CRIAR |

### Fase 12

| Arquivo | Ação |
|---|---|
| `prisma/schema.prisma` | MODIFICAR (factor_weights, conditional_patterns) |
| `src/lib/bob/engine/scoring.ts` | MODIFICAR (calibrateWeights) |

### Fase 13

| Arquivo | Ação |
|---|---|
| `src/lib/bob/ai/cognitive-analyst.ts` | CRIAR |
| `src/lib/bob/ai/dual-mind.ts` | CRIAR |
| `src/lib/bob/engine/calibrator.ts` | CRIAR |

### Fase 14

| Arquivo | Ação |
|---|---|
| `src/app/api/cron/` | MODIFICAR/CRIAR (T-48h, T-1h, pós-rodada) |

### Fase 15

| Arquivo | Ação |
|---|---|
| `src/app/chat/page.tsx` | CRIAR |
| `public/sw.js` | CRIAR (Service Worker) |

---

## 8. Decisões Consolidadas

| Decisão | Escolha | Justificativa |
|---|---|---|
| Limite de usuários | Sem hard-cap, admin controla | Flexibilidade |
| IA principal | Claude Sonnet (analista) | Melhor raciocínio analítico |
| IA desafiadora | GPT-4o (devil's advocate) | Elimina viés de confirmação |
| Narrativa | GPT-4o-mini | Já funciona, barato |
| Vídeos | Fora de escopo | Custo proibitivo vs retorno |
| Notícias | Fase 15+ | Após motor validado |
| Forma recente | Testar 5/7/10/15 via backtesting | Validação científica |
| Proatividade | Push grátis → email → WhatsApp | Custo gradual |
| Proteção IP | Server-only, sem docs públicas | Segurança do algoritmo |
| WhatsApp | Após ROI comprovado | Twilio ~R$0.15/msg |
| Expansão ligas | Fora de escopo (foco Série A) | Qualidade > quantidade |

---

## 9. Variáveis de Ambiente

### Atuais (em uso)

```
API_FOOTBALL_KEY          # Chave API-Football v3
OPENAI_API_KEY            # GPT-4o-mini (narrativa)
DATABASE_URL              # Supabase Transaction Pooler (pgbouncer)
DIRECT_URL                # Supabase Direct (migrations)
NEXT_PUBLIC_SUPABASE_URL  # URL pública do projeto Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY  # Chave pública Supabase
SUPABASE_SERVICE_ROLE_KEY # Chave de serviço Supabase
CRON_SECRET               # Auth para Vercel Crons
NEXT_PUBLIC_APP_URL       # URL da aplicação (sem barra final)
```

### Futuras (a adicionar)

```
ANTHROPIC_API_KEY         # Claude Sonnet (analista cognitivo) — Fase 13
```

---

## 10. Glossário

| Termo | Definição |
|---|---|
| **Âncora** | Jogo com score ≥ ANCHOR_THRESHOLD (60) e odd ≤ MAX_ANCHOR_ODD (2.20) |
| **Variação** | Combinação de picks (V1-V5) com postura diferente |
| **Pick** | Escolha de resultado para um jogo (HOME, DRAW, AWAY) |
| **ABQC** | Adaptive Bayesian Quantum Coverage — algoritmo proprietário BOB |
| **Método Camillo** | Estratégia de variações canônicas baseada em perfis de risco |
| **Dual-Mind** | Arquitetura com 2 IAs debatedoras + 1 calibrador |
| **Backtest** | Simulação de rodadas passadas para validar o motor |
| **Forense** | Análise pós-jogo: qual fator errou e por quê |
| **Factor Weights** | Pesos dos 8+ fatores de scoring (auto-calibrantes) |
| **Learning Loop** | Ciclo: predição → resultado → análise → calibração → melhoria |

---

> **Próxima fase a executar**: Fase 9 — Estabilização  
> **Próxima tarefa**: 9.1 — Criar `000_combined_schema.sql`
