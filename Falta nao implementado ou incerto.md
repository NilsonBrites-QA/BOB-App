## ✅ Implementado (confirmado)

**Core engine**
- Motor de scoring (`scoring.ts`), variações (`variations.ts`), calibrador ABQC (`calibrator.ts`)
- Backtest engine + forensic (`backtest.ts`, `forensic.ts`)
- Memória Profunda — `003_memory_deep.sql` aplicado, cognitive-analyst, dual-mind, self-reflection
- BOB Bet Analyzer (4 perfis: Conservador/Moderado/Agressivo/Matemático) — feito nessa sessão

**Páginas**
- Dashboard, Apostas, Histórico, Estatísticas, Chat, Calendário, Classificação, Investimento-Retorno

**Admin**
- Betslips (lista + detalhe + registro de resultado), Calibração, Cérebro (Brain Observatory) — finalizado agora

**Infra**
- Crons: `pre-round`, `post-round`, `backfill`, `calibrate`, `simulate`, `lineup-check`, `import-matches`, `analyze-round`
- PWA, push notifications, auth magic link, whitelist

---

## ❌ Falta (não implementado ou incerto)

### Crítico
| Item | Sprint | Status |
|------|--------|--------|
| **V3 e V4 idênticos** quando pool pequeno | 1A | ⬜ Bug confirmado, não corrigido |
| **Chat sem Markdown** (plain text) | 1B | ⬜ `react-markdown` não instalado |
| **"T-1h do primeiro bloco" hardcoded** no dashboard | 1C | ⬜ Não corrigido |

### Dados
| Item | Sprint | Status |
|------|--------|--------|
| **15 fatores** no scoring.ts (atual: 10-12) | 2A | ⬜ Não expandido |
| **Conector de Clima** (`connectors/weather.ts`) | 2B | ⬜ Arquivo não exists |
| **Knowledge Graph** (`memory_nodes`/`memory_edges`) | 2D | ⬜ Migration 004 não aplicada |
| **`absenceRate`** sempre 0 | 2 | ⬜ Bug ativo |
| **`bigGameAhead`** sempre false | 2 | ⬜ Bug ativo |
| **Odds estimadas**, não reais via OddsPapi | 2 | ⬜ Parcial — conector existe mas wiring incerto |

### Features
| Item | Sprint | Status |
|------|--------|--------|
| **Probabilidades de Título/Rebaixamento** na tabela | 6C | ⬜ Não implementado |
| **Zebra Alert** ("⚡ Oportunidade de Zebra") | 6A | ⬜ Não implementado |
| **Chat persistência** no localStorage | 1D | ⬜ Incerto |

### Wiring e Testes
| Item | Sprint | Status |
|------|--------|--------|
| **`aberturaDiaria()`** wired no dashboard | 8B | ⬜ Componente existe, conexão real incerta |
| **dual-mind.ts** exposto no pipeline real | 8B | ⬜ Arquivo existe, wiring incerto |
| **Rate limiting** por usuário (Vercel KV) | 8A | ⬜ Não implementado |
| **Testes unitários** (scoring, variations) | 8C | ⬜ Zero testes |

---

## Prioridade sugerida

```
1. Sprint 1 bugs críticos (V3/V4, markdown, T-1h) — bloqueiam qualidade percebida
2. Odds reais via OddsPapi (absenceRate, bigGameAhead, homeOddDropped) — aumentam precisão
3. 15 fatores + clima — diferencial competitivo
4. Probabilidades de título/rebaixamento — feature visual de alto impacto
```

Quer começar pelo **Sprint 1** (bugs críticos) ou por outro ponto?