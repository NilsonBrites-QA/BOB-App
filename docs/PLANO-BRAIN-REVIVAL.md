# BOB Brain Revival — Plano de Implementação Completo

> **Data de criação:** 13 de abril de 2026  
> **Status:** ✅ CONCLUÍDO — Fases 0, 1, 2 e 3 implementadas  
> **Objetivo:** Reconectar todos os módulos cerebrais do BOB, eliminar código morto, dar ao BOB memória real de 4 dias, personalidade persistente e Dual-Mind funcional.

---

## Problema Identificado

Auditoria completa of code revelou que o cérebro do BOB foi construído em módulos isolados que nunca foram conectados entre si:

| Módulo | Status | Problema |
|--------|--------|---------|
| `dual-mind.ts` | ✅ Conectado | `post-round/route.ts` agora invoca `analyzeDualMind()` |
| `narrative.ts` | ✅ Conectado | Via `analyzeDualMind` internamente |
| `enrichMatchContext()` | ✅ Conectado | `pre-round/route.ts` chama para zona cinza (score 50–69) |
| `MemoryEvent` table | ✅ Alimentada | reflection + dual-analysis persistidos |
| Chat persistence | ✅ DB real | `chat_messages` table, TTL 4 dias |
| `selfReflect()` | ✅ Await + persistido | MemoryEvent type="reflection" criado |
| `max_tokens` chat | ✅ 2000 tokens | Claude e GPT-4o-mini |

---

## Fases de Implementação

### FASE 0 — Infraestrutura de Desenvolvimento ✅

| Step | Arquivo | Status |
|------|---------|--------|
| 0.1 | `.vscode/mcp.json` — OpenAI + Supabase MCP | ✅ Existia de sessão anterior |
| 0.2 | `apps/web/AGENTS.md` — reescrito completo | ✅ Concluído |
| 0.3 | `apps/web/.github/skills/bob-dev/SKILL.md` | ✅ Concluído |
| 0.4 | `apps/web/.github/agents/bob-implementor.agent.md` | ✅ Concluído |

---

### FASE 1 — Chat com Memória DB + Personalidade Viva

| Step | Descrição | Status |
|------|-----------|--------|
| 1.1 | Model `ChatMessage` em `schema.prisma` | ✅ Concluído |
| 1.2 | `prisma/migrations/006_chat_messages.sql` | ✅ Concluído |
| 1.3 | `npx prisma generate` | ✅ Concluído |
| 1.4 | `GET /api/bob/chat/history/route.ts` | ✅ Concluído |
| 1.5 | Reescrever `POST /api/bob/chat/route.ts` | ✅ Concluído |
| 1.6 | Reescrever `chat-widget.tsx` | ✅ Concluído |

**Detalhes:**

**Step 1.1 — ChatMessage model** (adicionar ao final do `schema.prisma`):
```prisma
model ChatMessage {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  role      String   // "user" | "assistant"
  content   String   @db.Text
  model     String?  // "claude-sonnet" | "gpt-4o-mini" | "offline"
  createdAt DateTime @default(now()) @map("created_at")

  @@index([userId, createdAt(sort: Desc)])
  @@map("chat_messages")
}
```

**Step 1.5 — Chat route reescrito:**
- `max_tokens: 600 → 2000` (Claude e GPT-4o-mini)
- Persistir user message antes de chamar LLM
- Persistir assistant reply após LLM responder
- TTL 4 dias: filtro por query (`created_at > NOW() - '4 days'`)
- Prompt reestruturado com blocos delimitados:
  ```
  <identidade>BOB_FAITH + BOB_QUANTUM compact</identidade>
  <dados_rodada>standings, anchors, variations, difficulty</dados_rodada>
  <memoria_rodadas>últimas 3 reflexões MemoryEvent type="reflection"</memoria_rodadas>
  <instrucoes>regras de tom, proibições, formato</instrucoes>
  ```

**Step 1.6 — chat-widget.tsx reescrito:**
- Carregar histórico via `GET /api/bob/chat/history` (não localStorage)
- localStorage como fallback offline apenas
- Timestamps relativos ("há 2h") + tooltip com hora absoluta
- Bolhas: usuário direita (accent), BOB esquerda (surface-strong)

---

### FASE 2 — Dual-Mind Real + Self-Reflection Persistida

| Step | Descrição | Status |
|------|-----------|--------|
| 2.1 | `self-reflection.ts` → persistir no DB como `MemoryEvent` | ✅ Concluído |
| 2.2 | `post-round/route.ts` → trocar fire-and-forget por `await` | ✅ Concluído |
| 2.3 | `chat/route.ts` → injetar MemoryEvent reflections no prompt | ✅ Concluído (Fase 1.5) |
| 2.4 | `post-round/route.ts` → wiring `analyzeDualMind()` | ✅ Concluído |

**Detalhes:**

**Step 2.1 — self-reflection.ts:**
Após retorno de `selfReflect()`, criar `MemoryEvent`:
```typescript
await prisma.memoryEvent.create({
  data: {
    roundId: ..., // buscar Round pelo season+round
    layer: "DECISIONS",
    type: "reflection",
    content: { publicText, adminText, accuracy, anchorAcc },
    source: "bob-self-reflection",
  }
});
```

**Step 2.4 — analyzeDualMind() wiring:**
- Só executa se `ANTHROPIC_API_KEY && OPENAI_API_KEY` ambos presentes
- Persiste resultado como `MemoryEvent` com `type="dual-analysis"`

---

### FASE 3 — Código Morto Ressuscitado

| Step | Descrição | Status |
|------|-----------|--------|
| 3.1 | `enrichMatchContext()` → wiring no pipeline de scoring | ✅ Concluído — `pre-round/route.ts` zona cinza 50–69 |
| 3.2 | `generateRoundNarrative()` → wiring no post-round cron | ✅ Via `analyzeDualMind` (GPT narrative interna) |
| 3.3 | `ConditionalPattern` anti-correlações → penalizar score | ⬜ Pendente (pós-MVP) |

---

### FASE 4 — Dev Infrastructure (paralela) ✅

Coberta na Fase 0.

---

### FASE 5 — Verificação Final

| Step | Descrição | Status |
|------|-----------|--------|
| 5.1 | `get_errors` em todos arquivos modificados | ✅ Zero erros TypeScript |
| 5.2 | `cd apps/web && npx next build` | ⬜ A executar |
| 5.3 | SQL migration executada no Supabase SQL Editor | ⬜ Manual (usuário) |
| 5.4 | Confirmar imports: dual-mind, narrative, enrichMatchContext | ✅ Verificado |

---

## Convenções do Projeto

- **Stack:** Next.js 16.2 App Router, Prisma 6, Supabase PostgreSQL, Vercel
- **LLMs:** `claude-sonnet-4-5` (primário), `gpt-4o-mini` (fallback + narrativa)
- **Projeto Supabase:** `zravuslhqluaxjuakecp` (sa-east-1)
- **Personalidade:** BOB_FAITH é IRREVOGÁVEL — nunca robótico, nunca corporativo
- **Build:** `cd apps/web && npx next build`

## Regras de Desenvolvimento

1. **Nunca código morto** — todo módulo criado deve ter ≥1 import no codebase
2. **Nunca inventar dados** — todos os dados vêm das APIs reais ou do DB
3. **Nunca fire-and-forget crítico** — sempre `await` em operações de persistência
4. **Nunca localStorage como fonte de verdade** — apenas fallback offline
5. **max_tokens mínimo** — 2000 para chat (Claude e GPT-4o-mini)

---

## Arquivos de Referência

| Arquivo | Propósito |
|---------|-----------|
| `apps/web/AGENTS.md` | Regras completas do projeto para agentes |
| `apps/web/.github/skills/bob-dev/SKILL.md` | Skill de dev protegido do BOB |
| `apps/web/.github/agents/bob-implementor.agent.md` | Agente implementador especializado |
| `.vscode/mcp.json` | MCP: OpenAI docs + Supabase |
| `apps/web/prisma/schema.prisma` | Schema do banco de dados |
| `apps/web/src/lib/bob/personality.ts` | BOB_FAITH, BOB_QUANTUM, BOB_TRAITS |
