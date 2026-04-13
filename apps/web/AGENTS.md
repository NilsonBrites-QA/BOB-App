# BOB — Big Odds Brasileirão · Regras do Projeto

> Fonte de verdade para agentes e modelos trabalhando neste repositório.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 16.2 App Router (Turbopack) |
| Banco de dados | Prisma 6 + Supabase PostgreSQL (`zravuslhqluaxjuakecp`, sa-east-1) |
| ORM gerado | `src/generated/prisma/` — importar via `@/generated/prisma/client` |
| LLM primário | `claude-sonnet-4-5` (Anthropic) — chat + reflexão |
| LLM secundário | `gpt-4o-mini` (OpenAI) — fallback + narrativa |
| Hospedagem | Vercel + crons declarados em `vercel.json` |
| Auth | Supabase SSR magic link — whitelist obrigatória |
| Estilo | Tailwind CSS + variáveis CSS (`--accent`, `--surface`, `--foreground`) |

**Build:** `cd apps/web && npx next build`

---

## Arquitetura do Cérebro BOB

```
APIs externas (football-data.org, API-Football, OddsPapi, open-meteo)
        ↓
  connectors/        ← busca e normaliza dados das APIs
        ↓
  engine/            ← motor determinístico de scoring (15 fatores, 0–100)
     scoring.ts      ← pontua cada jogo
     variations.ts   ← gera V1–V5 (5 realidades coexistindo)
     calibrator.ts   ← ajusta pesos com base em resultados anteriores
     backtest.ts     ← simula rodadas passadas para validação
        ↓
  ai/                ← camada cognitiva (Claude + GPT)
     cognitive-analyst.ts  ← generateReflection(), suggestWeightAdjustments(), enrichMatchContext()
     self-reflection.ts    ← selfReflect() — orquestra calibração + reflexão IA
     dual-mind.ts          ← analyzeDualMind() — Claude + GPT em paralelo
     narrative.ts          ← generateRoundNarrative() — narrativa GPT-4o-mini
        ↓
  persist.ts / persist-weights.ts  ← escrita no DB (picks, pesos)
        ↓
  /api/cron/post-round   ← orquestra tudo após rodada encerrar
  /api/bob/chat          ← chat conversacional com dados reais + memória DB
```

---

## Personalidade BOB — IRREVOGÁVEL

A personalidade `BOB_FAITH` em `src/lib/bob/personality.ts` é **IRREVOGÁVEL**:

- **Nunca robótico.** Nunca respostas secas, listas sem contexto, linguagem corporativa.
- **Nunca frustração.** BOB mantém alta frequência mesmo após rodadas ruins.
- **Superposição quântica.** As 5 variações são 5 realidades coexistindo — cada uma válida até o resultado.
- **Fé no processo.** "Fé não é superstição. É dados + método + disciplina." 
- **Origem favela, linguagem acessível.** BOB entende todos os públicos.
- **`max_tokens` mínimo de 2000** no chat — nunca menos.

Importar sempre: `import { BOB_FAITH, BOB_QUANTUM, BOB_TRAITS } from "@/lib/bob/personality"`

---

## Convenções TypeScript

- `"use client"` apenas em componentes com hooks/interatividade. Server Components por padrão.
- Prisma Client: `import { prisma } from "@/lib/db"` (instância singleton)
- Prisma types: `import { ... } from "@/generated/prisma/client"` (sem `/index`)
- `cookies()` do Next.js é async em Next 15+: `const cookieStore = await cookies()`
- Auth: sempre `const { data: { user } } = await supabase.auth.getUser()` antes de qualquer operação
- Variáveis de ambiente server-side apenas — nunca `NEXT_PUBLIC_` para chaves de API

---

## Módulos Ativos vs Código Morto

### ✅ Ativos (chamados no codebase):
- `engine/scoring.ts` → chamado em `connectors/index.ts`
- `engine/variations.ts` → chamado em `api/bob/round`
- `engine/calibrator.ts` → chamado em `ai/self-reflection.ts`
- `engine/backtest.ts` → chamado em `ai/self-reflection.ts`
- `engine/round-analyzer.ts` → chamado no dashboard e chat
- `engine/kelly.ts` → chamado em `investment-return-calculator.tsx`
- `ai/cognitive-analyst.ts` → `generateReflection()` chamado em `self-reflection.ts`
- `ai/self-reflection.ts` → chamado (fire-and-forget) em `cron/post-round`

### ❌ Código morto (0 imports — DEVE ser conectado):
- `ai/dual-mind.ts` → `analyzeDualMind()` — precisa ser chamado no `post-round`
- `ai/narrative.ts` → `generateRoundNarrative()` — precisa ser chamado no `post-round`
- `ai/cognitive-analyst.ts` → `enrichMatchContext()` — precisa ser chamado no pipeline

### ⚠️ Parcialmente implementado:
- `ai/self-reflection.ts` → resultado não é persistido no DB (fire-and-forget)
- `MemoryEvent` table → existe no schema, 0 inserts no código
- `ChatMessage` → model pendente de criação no schema

---

## Regras Invioláveis

1. **Zero código morto.** Qualquer módulo criado ou modificado DEVE ter ≥1 import ativo no codebase.
2. **Nunca inventar dados.** Todos os dados vêm das APIs reais ou do banco de dados Prisma.
3. **Nunca fire-and-forget crítico.** Operações de persistência e reflexão devem usar `await`.
4. **Nunca localStorage como fonte de verdade.** Apenas fallback offline.
5. **Nunca `//` em JSON.** `vercel.json` e qualquer JSON de config deve ser JSON puro.
6. **Nunca expor scoring/variações no client.** Lógica do motor é server-only.
7. **Executar `npx prisma generate` após qualquer mudança no schema.**

---

## Banco de Dados — Models Principais

| Model | Tabela | Propósito |
|-------|--------|-----------|
| `User` | `users` | Usuário autenticado (Supabase) |
| `Season` | `seasons` | Temporada do Brasileirão |
| `Round` | `rounds` | Rodada (DRAFT/READY/DELIVERED/CLOSED) |
| `Anchor` | `anchors` | Jogo âncora (score ≥ 65) |
| `Variation` | `variations` | Variação V1–V5 |
| `Pick` | `picks` | Jogo dentro de uma variação |
| `FactorWeight` | `factor_weights` | Snapshot de pesos após calibração |
| `ConditionalPattern` | `conditional_patterns` | Anti-padrões emergentes (ABQC) |
| `SimulationResult` | `simulation_results` | Resultado de simulação cega |
| `MemoryEvent` | `memory_events` | Memória do BOB (RAW/NORMALIZED/PATTERNS/DECISIONS) |
| `ChatMessage` | `chat_messages` | Histórico de chat por usuário (TTL 4 dias) |

---

## APIs Externas

| API | Uso | Env var |
|-----|-----|---------|
| football-data.org | Jogos, resultados, standings Brasileirão (league=71) | `FOOTBALL_DATA_API_KEY` |
| API-Football | Lesões, copas, dados adicionais | `API_FOOTBALL_KEY` |
| OddsPapi | Odds Pinnacle (tournamentId=325) | `ODDSPAPI_KEY` |
| TheSportsDB | Escudos dos times | (público) |
| open-meteo | Clima (impacto em jogos) | (público) |
| Anthropic | Claude Sonnet 4.5 | `ANTHROPIC_API_KEY` |
| OpenAI | GPT-4o-mini | `OPENAI_API_KEY` |

---

## Crons (vercel.json)

26 crons declarados cobrindo janelas UTC 21h/23h/01h/03h (jogos do Brasileirão).
Rotas: `/api/cron/pre-round`, `/api/cron/post-round`, `/api/cron/lineup-check`, `/api/cron/simulate`, `/api/cron/calibrate`.

---

## Skill e Agente Disponíveis

- **Skill:** `apps/web/.github/skills/bob-dev/SKILL.md` — workflow de implementação protegida
- **Agente:** `apps/web/.github/agents/bob-implementor.agent.md` — implementador especializado

Ler a skill ANTES de implementar qualquer módulo do BOB.

---

<!-- BEGIN:nextjs-agent-rules -->
## Next.js 16.2 — Atenção

Esta versão tem breaking changes em relação ao treinamento do modelo. Sempre ler `node_modules/next/dist/docs/` antes de usar APIs do framework. `cookies()`, `headers()` e `params` são assíncronos.
<!-- END:nextjs-agent-rules -->
