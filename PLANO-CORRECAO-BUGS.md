# Plano de Correção de Bugs BOB — Completo

## Grupo 4 — Migrations Faltando no Supabase (PRÉ-REQUISITO DE TUDO)

### Admin "Aprovar e Entregar" retorna 500
- **Causa raiz:** Migrations 005–013 (ou parte) nunca foram aplicadas no Supabase. O schema Prisma evoluiu mas o banco real ficou desatualizado.
- **Sintoma imediato:** `round-actions.ts` ~L103 usa `status: { not: "SUPERSEDED" }`. Postgres não reconhece `'SUPERSEDED'` no enum `round_status` (adicionado pela migration 011) → `invalid input value for enum` → 500.
- **Outras colunas faltando confirmadas:** `frozen_at`, `version`, `previous_round_id` na tabela `rounds` (migration 011).
- **Fix:**
  1. Listar arquivos em `apps/web/prisma/migrations/`
  2. Acessar o Supabase SQL Editor: `https://supabase.com/dashboard/project/zravuslhqluaxjuakecp/sql/new`
  3. Aplicar em ordem numérica todas as migrations a partir de `004` (última confirmada aplicada: 003)
  4. Verificar que `round_status` enum contém: `DRAFT`, `READY`, `DELIVERED`, `SUPERSEDED`, `CLOSED`
  5. Verificar que tabela `rounds` tem: `frozen_at`, `version`, `previous_round_id`, `superseded_at`

---

## Grupo 0 — Página /variacoes (BLOQUEADOR IMEDIATO)

### Bug A — "0 âncoras · 0 variações" (rodadas READY nunca são exibidas)
- **Arquivo:** `apps/web/src/app/api/cron/pre-round/route.ts` + `apps/web/src/app/variacoes/page.tsx` (~L549)
- **Causa raiz:** O cron `pre-round` salva rodada com `status: "READY"` mas nunca chama `freezeRound()`. A página em `page.tsx` só exibe do banco rodadas com `status === "DELIVERED"`. Resultado: a rodada existe no banco mas é ignorada → pipeline ao vivo é chamado → sem dados reais → "0 âncoras · 0 variações".
- **Fix (opção A — recomendada):** Chamar `freezeRound(roundDbId)` logo após `saveRound()` no `pre-round/route.ts`.
- **Fix (opção B — menos invasivo):** Mudar condição em `page.tsx` linha ~549 de `status === "DELIVERED"` para `status !== "SUPERSEDED"`.

### Bug B — React Error #418 (hydration mismatch em /variacoes)
- **Arquivo:** `apps/web/src/app/variacoes/page.tsx` (~L96)
- **Causa raiz:** Função `formatFirstMatch` usa `toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })`. No Vercel (Node com `small-icu`), o output da data é diferente do browser do usuário → RSC payload calculado no servidor ≠ o que o browser renderizaria → Error #418.
- **Fix:** Substituir `toLocaleString` por `Intl.DateTimeFormat.formatToParts()`:
  ```ts
  const fmt = new Intl.DateTimeFormat("pt-BR", { weekday:"short", day:"numeric", month:"short", hour:"2-digit", minute:"2-digit", timeZone:"America/Sao_Paulo" });
  const parts = (v: Date) => Object.fromEntries(fmt.formatToParts(v).map(p => [p.type, p.value]));
  const mkLabel = (v: Date) => { const p = parts(v); return `${p.weekday} ${p.day} ${p.month} · ${p.hour}:${p.minute}`; };
  ```

---

## Grupo 1 — Auth/Login/PWA (CRÍTICO — bloqueia acesso)

### Fase 5 — manifest.json Syntax Error
- **Arquivo:** `apps/web/src/utils/supabase/proxy.ts`
- **Bug:** `PUBLIC_PATHS` não inclui `/manifest.json`. Proxy redireciona para `/login` → browser recebe HTML → "Syntax error".
- **Fix:** Adicionar `"/manifest.json"` à `PUBLIC_PATHS`.

### Fase 6 — Service Worker: "script resource is behind a redirect"
- **Arquivo:** `apps/web/public/sw.js`
- **Bug:** `SHELL_ASSETS` contém `/dashboard` e `/investimento-retorno`. Rotas protegidas redirecionam para `/login` → SW não pode cachear redirects.
- **Fix 6A:** Remover rotas protegidas do `SHELL_ASSETS` (manter só `/manifest.json`, `/icons/icon-192.png`, `/icons/icon-512.png`).
- **Fix 6B:** Adicionar `"/sw.js"` à `PUBLIC_PATHS` do proxy.

### Fase 7 — "Esqueci minha senha" não funciona (3 sub-bugs)

**7A — /auth/recover não acessível sem sessão**
- **Arquivo:** `apps/web/src/utils/supabase/proxy.ts`
- **Bug:** `/auth/recover` não está em `PUBLIC_PATHS`. Usuário é redirecionado para `/login` ao tentar recuperar senha.
- **Fix:** Adicionar `"/auth/recover"` à `PUBLIC_PATHS`.

**7B — Login com senha redireciona para /auth/confirm desnecessariamente**
- **Arquivo:** `apps/web/src/app/login/page.tsx` (linha ~43)
- **Bug:** Após `signInWithPassword` bem-sucedido, faz `window.location.assign("/auth/confirm?next=/dashboard")`. `/auth/confirm` sem code/token_hash chama `getUser()`, mas o cookie pode não ter propagado entre requests.
- **Fix:** Substituir por `window.location.assign("/dashboard")` direto após login por senha.

**7C — Cookies de sessão perdidos no redirect do recovery**
- **Arquivo:** `apps/web/src/utils/supabase/auth-route.ts`
- **Bug (CONFIRMADO):** `setAll` seta cookies na `response` atual. Porém `authClient.setResponse(newResponse)` troca a response por um novo objeto que NÃO herda os cookies já setados. Sessão não propaga → usuário chega em `/conta` sem sessão → "Sessão expirada".
- **Fix:**
  ```ts
  setResponse(nextResponse: NextResponse) {
    response.cookies.getAll().forEach(c => nextResponse.cookies.set(c.name, c.value));
    response = nextResponse;
  }
  ```

---

## Grupo 2 — Motor de Variações

### Fase 1 — Variações V3/V4 Idênticas
- **Arquivo:** `apps/web/src/lib/bob/engine/beam-search.ts`
- **Bug:** Quando `isDuplicate === true` (~L681), apenas loga warning. Não tenta gerar bilhete distinto.
- **Fix:** Refatorar `runBeamSearch` para aceitar `forbiddenFingerprints: Set<string>`. Se duplicata, chamar novamente com fingerprint proibido. Máx 2 retentativas.

---

## Grupo 3 — Scoring/Dados (valores hardcoded)

### Fase 2 — absenceRate sempre 0.08
- **Arquivo:** `apps/web/src/lib/data/data-gateway.ts` (linhas 120-121)
- **Bug:** `homeAbsenceRate: 0.08` e `awayAbsenceRate: 0.08` hardcoded.
- **Fix:** Criar helper `getAbsenceRates(homeTeam, awayTeam, matchDate)` que lê `MemoryEvent` com type `injury` e calcula taxa.

### Fase 3 — bigGameAhead sempre false
- **Arquivo:** `apps/web/src/lib/data/data-gateway.ts` (linhas 122-123)
- **Bug:** Calendário não é consultado para detectar jogos próximos de Copa/Libertadores.
- **Fix:** Criar helper `hasBigGameAhead(teamName, afterDate)` usando `BetMatch` ou API-Football cache.

### Fase 4 — homeOddDropped sempre false
- **Arquivo:** `apps/web/src/lib/data/data-gateway.ts` (linha 129) + `apps/web/prisma/schema.prisma`
- **Bug:** Sem histórico de odds, impossível detectar queda.
- **Fix:** Adicionar campo `initial_odd Float?` no modelo `BetOdds`, nova migration, e calcular `homeOddDropped = initialOdd != null && currentOdd < initialOdd * 0.90`.

---

## Ordem de implementação
1. **Grupo 4** — Aplicar migrations pendentes no Supabase *(pré-requisito físico)*
2. **Grupo 0 Bug A** — `freezeRound()` em `pre-round/route.ts` *(desbloqueador das variações)*
3. **Grupo 0 Bug B** — `formatFirstMatch` com `formatToParts` *(elimina Error #418)*
4. **Fase 5** — `manifest.json` em `PUBLIC_PATHS` (1 linha)
5. **Fases 6A+6B** — `sw.js` + `PUBLIC_PATHS`
6. **Fase 7A** — `/auth/recover` em `PUBLIC_PATHS` (1 linha)
7. **Fase 7C** — `auth-route.ts` (cookies)
8. **Fase 7B** — login redirect
9. **Fase 1** — beam-search duplicatas
10. **Fases 2, 3, 4** — data-gateway hardcoded

## Arquivos-chave
- `apps/web/src/utils/supabase/proxy.ts` — Fases 5, 6B, 7A
- `apps/web/public/sw.js` — Fase 6A
- `apps/web/src/utils/supabase/auth-route.ts` — Fase 7C
- `apps/web/src/app/login/page.tsx` — Fase 7B
- `apps/web/src/lib/bob/engine/beam-search.ts` — Fase 1
- `apps/web/src/lib/data/data-gateway.ts` — Fases 2, 3, 4
- `apps/web/prisma/schema.prisma` + nova migration — Fase 4

## Verificação final
1. `/auth/recover` sem estar logado → deve abrir a página (não redirecionar)
2. `/manifest.json` deve retornar JSON (não HTML)
3. Console do browser na `/login` não deve ter erro de SW/redirect
4. Recovery: clicar link do email → `/conta?forced=1` → sessão presente → troca senha → redireciona ao dashboard
5. V1-V5 com pool pequeno → fingerprints distintos
