---
name: bob-dev
description: "Use when implementing, modifying, or debugging any BOB module: chat, engine, AI brain, crons, scoring, calibration, Prisma schema, API routes. Workflow obrigatório para garantir zero código morto, integração completa e regras de personalidade respeitadas."
---

# BOB Dev — Workflow de Implementação Protegida

## Quando Usar Esta Skill
- Implementar qualquer módulo do BOB (engine, AI, chat, crons, UI)
- Modificar Prisma schema ou criar migrações
- Conectar módulos existentes (eliminar código morto)
- Revisar se há código morto ou integração faltando
- Criar novos endpoints de API do BOB

## Pré-requisitos Obrigatórios

Antes de qualquer implementação, leia:
1. `apps/web/AGENTS.md` — regras do projeto, stack, módulos ativos vs mortos
2. Arquivo alvo atual (nunca edite sem ler antes)
3. Arquivos que importam o módulo alvo (para entender impacto)

## Workflow Passo a Passo

### 1. Leitura Completa

```
- Ler o arquivo que será modificado (completo, não parcial)
- Buscar todos os imports do arquivo (grep pelo nome do módulo)
- Confirmar se é código morto ou código ativo
```

### 2. Checklist Anti-Código-Morto

Antes de criar qualquer arquivo/função/export:
- [ ] Onde este código será chamado? (listar o caminho completo)
- [ ] Qual arquivo importa esta função?
- [ ] O import já existe ou precisa ser adicionado?
- [ ] Se novo arquivo: há pelo menos 1 import confirmado?

**Se você criar um módulo e não conseguir identificar onde ele será importado, NÃO o crie.**

### 3. Schema Prisma

Ao modificar `schema.prisma`:
1. Adicionar o novo model respeitando o padrão do arquivo (uuid, snake_case, `@@map`)
2. Criar arquivo SQL em `prisma/migrations/00N_nome.sql`
3. Executar `cd apps/web && npx prisma generate` — obrigatório
4. Validar que o novo model está acessível via `prisma.<model>`

Padrão de model:
```prisma
model NomeModel {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  campo     String
  createdAt DateTime @default(now()) @map("created_at")

  @@map("nome_model")
}
```

### 4. Módulos de IA (ai/)

Ao trabalhar com módulos em `src/lib/bob/ai/`:

- **cognitive-analyst.ts**: generateReflection(), suggestWeightAdjustments(), enrichMatchContext()
- **self-reflection.ts**: selfReflect() — orquestra calibração + reflexão → persiste MemoryEvent
- **dual-mind.ts**: analyzeDualMind() — Claude + GPT em paralelo → persiste MemoryEvent
- **narrative.ts**: generateRoundNarrative() → persiste MemoryEvent

Regra: toda reflexão gerada DEVE ser persistida como `MemoryEvent` no DB:
```typescript
await prisma.memoryEvent.create({
  data: {
    roundId: round.id,
    layer: "DECISIONS",
    type: "reflection" | "narrative" | "dual-analysis",
    content: { publicText, adminText, ... },
    source: "bob-self-reflection" | "dual-mind" | "narrative",
  }
});
```

### 5. Chat

O chat usa dois provedores em cascata:
1. Claude Sonnet 4.5 (`ANTHROPIC_API_KEY`) — primário
2. GPT-4o-mini (`OPENAI_API_KEY`) — fallback

Regras do chat:
- `max_tokens: 2000` mínimo (ambos os provedores)
- Toda mensagem (user + assistant) persiste em `ChatMessage` no DB
- TTL 4 dias: filtrar com `WHERE created_at > NOW() - INTERVAL '4 days'`
- Prompt estruturado com `<identidade>`, `<dados_rodada>`, `<memoria_rodadas>`, `<instrucoes>`
- Personalidade BOB_FAITH é IRREVOGÁVEL — nunca robótico

### 6. Crons (post-round)

Ao modificar `api/cron/post-round/route.ts`:
- `selfReflect()` DEVE ser `await` — nunca fire-and-forget
- Após `selfReflect()`: chamar `analyzeDualMind()` se ambas API keys disponíveis
- Após `selfReflect()`: chamar `generateRoundNarrative()` se OpenAI key disponível
- Chamar `enrichMatchContext()` no pipeline antes do scoring responder

### 7. Validação Final

Após qualquer implementação:
1. `get_errors` nos arquivos modificados
2. Verificar que zero código morto permanece (grep pelo nome dos exports)
3. `cd apps/web && npx next build` (opcional mas recomendado)

## Padrões de Código

### API Route (server, autenticada)
```typescript
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  
  // lógica aqui
}
```

### Persistir MemoryEvent
```typescript
await prisma.memoryEvent.create({
  data: {
    roundId: dbRound?.id ?? null,
    layer: "DECISIONS",
    type: "reflection",
    content: result as object,
    source: "bob-self-reflection",
    relevanceScore: result.accuracy,
  }
});
```

### Buscar reflexões para o chat
```typescript
const reflections = await prisma.memoryEvent.findMany({
  where: { type: "reflection" },
  orderBy: { createdAt: "desc" },
  take: 3,
  select: { content: true, createdAt: true },
});
```

## Proibições Absolutas

- ❌ Criar módulo sem import ativo no codebase
- ❌ `max_tokens` < 2000 no chat
- ❌ fire-and-forget em operações críticas (selfReflect, persistência)
- ❌ localStorage como fonte de verdade
- ❌ Comentários `//` em arquivos JSON
- ❌ Expor lógica de scoring no client (server-only)
- ❌ Inventar dados — sempre DB ou APIs reais
- ❌ Modificar schema sem rodar `prisma generate`
