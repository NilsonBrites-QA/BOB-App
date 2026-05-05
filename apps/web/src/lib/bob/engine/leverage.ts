/**
 * BOB — Motor de Alavancagem Autônoma (15 Passos)
 *
 * Paradigma: Event Sourcing / Append-Only.
 * O sistema NUNCA deleta histórico. Cada evento (GREEN/RED) é um registro
 * imutável. O "passo atual" é derivado da leitura dos eventos.
 *
 * Fluxo:
 *   1. BOB busca na rodada do dia jogos com odd entre 1.80–2.00
 *   2. Monta um bilhete simples ou múltipla curta (max 2 jogos)
 *   3. Se GREEN → avança para passo N+1
 *   4. Se RED   → reseta para passo 1 (append novo evento, não deleta)
 *   5. Se chega ao passo 15 → ciclo completo. Reinicia ou congela.
 *
 * A tabela de alavancagem segue composição geométrica:
 *   Passo 1:  R$ 10.00 (entrada base)
 *   Passo 2:  lucro do passo 1 reinvestido
 *   ...
 *   Passo 15: ~R$ 37.000+ acumulados
 */

import type { ScoredMatch } from "./scoring";

// ─── Constantes ──────────────────────────────────────────────────────────────

export const LEVERAGE_TOTAL_STEPS = 15;
export const LEVERAGE_ODD_MIN = 1.80;
export const LEVERAGE_ODD_MAX = 2.00;
export const LEVERAGE_BASE_STAKE = 10.00; // R$ entrada do passo 1

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type LeverageResult = "GREEN" | "RED" | "PENDING" | "RESOLVED";

/** Evento imutável (append-only). Cada GREEN/RED gera um registro. */
export type LeverageEvent = {
  id: string;
  userId: string;
  cycleId: string;       // UUID do ciclo atual (resetado no RED)
  step: number;          // 1–15
  result: LeverageResult;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  pickLabel: string;
  pickOdd: number;
  stake: number;         // valor apostado neste passo
  payout: number;        // retorno (stake × odd se GREEN, 0 se RED)
  createdAt: Date;
};

/** Snapshot derivado dos eventos — NÃO é persistido, é calculado. */
export type LeverageState = {
  currentStep: number;           // 1–15
  currentCycleId: string;
  currentStake: number;          // quanto apostar neste passo
  targetOdd: { min: number; max: number };
  projectedPayout: number;       // payout se GREEN
  cycleHistory: LeverageEvent[]; // eventos do ciclo atual
  allTimeStats: {
    totalCycles: number;
    completedCycles: number;     // chegaram ao 15
    totalGreens: number;
    totalReds: number;
    longestStreak: number;
    totalProfit: number;
  };
};

/** Pick do dia: o bilhete que o BOB entrega pronto. */
export type LeveragePick = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  pickOutcome: "Home" | "Draw" | "Away";
  pickLabel: string;
  pickOdd: number;
  score: number;            // confiança do BOB (0–100)
  homeBadge: string | null;
  awayBadge: string | null;
  reason: string;           // justificativa curta
};

export type LeverageTicket = {
  picks: LeveragePick[];
  combinedOdd: number;
  stake: number;
  projectedPayout: number;
  step: number;
  bobMessage: string;
};

// ─── Tabela de Stakes (Composição Geométrica) ────────────────────────────────

/**
 * Calcula o stake para um dado passo.
 * Cada passo reinveste 100% do retorno anterior.
 *
 * Passo 1: R$ 10.00
 * Passo 2: R$ 10.00 × 1.90 (odd média) = R$ 19.00
 * Passo 3: R$ 19.00 × 1.90 = R$ 36.10
 * ...
 * Passo 15: R$ 10.00 × 1.90^14 ≈ R$ 37.000+
 */
export function calculateStake(step: number, avgOdd: number = 1.90): number {
  if (step < 1) return LEVERAGE_BASE_STAKE;
  return Number((LEVERAGE_BASE_STAKE * Math.pow(avgOdd, step - 1)).toFixed(2));
}

/**
 * Gera a tabela completa de 15 passos para exibição na UI.
 */
export function buildStakeTable(avgOdd: number = 1.90): Array<{
  step: number;
  stake: number;
  projectedPayout: number;
}> {
  return Array.from({ length: LEVERAGE_TOTAL_STEPS }, (_, i) => {
    const step = i + 1;
    const stake = calculateStake(step, avgOdd);
    return {
      step,
      stake,
      projectedPayout: Number((stake * avgOdd).toFixed(2)),
    };
  });
}

// ─── Derivação de Estado (Event Sourcing) ────────────────────────────────────

/**
 * Deriva o estado atual da alavancagem a partir do log de eventos.
 *
 * REGRA CORE:
 *   - GREEN → avança step (step + 1)
 *   - RED   → reseta step para 1, novo cycleId
 *   - Step 15 GREEN → ciclo completo, novo cycleId, step 1
 *
 * @param events Todos os eventos do usuário, ordenados por createdAt ASC
 */
export function deriveState(events: LeverageEvent[]): LeverageState {
  let currentStep = 1;
  let currentCycleId = "";
  let totalCycles = 1;
  let completedCycles = 0;
  let totalGreens = 0;
  let totalReds = 0;
  let longestStreak = 0;
  let currentStreak = 0;
  let totalProfit = 0;

  const cycleEvents: LeverageEvent[] = [];

  for (const event of events) {
    if (event.result === "GREEN") {
      totalGreens++;
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
      totalProfit += event.payout - event.stake;
      currentStep = event.step + 1;
      currentCycleId = event.cycleId;

      // Ciclo completo (passo 15 GREEN)
      if (event.step >= LEVERAGE_TOTAL_STEPS) {
        completedCycles++;
        currentStep = 1;
        totalCycles++;
      }
    } else if (event.result === "RED") {
      totalReds++;
      currentStreak = 0;
      totalProfit -= event.stake;
      currentStep = 1; // RESET
      currentCycleId = event.cycleId;
      totalCycles++;
    }
  }

  // Eventos do ciclo atual
  if (currentCycleId) {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].cycleId === currentCycleId) {
        cycleEvents.unshift(events[i]);
      } else {
        break;
      }
    }
  }

  // Se não há cycleId (primeiro acesso), gera um
  if (!currentCycleId) {
    currentCycleId = crypto.randomUUID();
  }

  const currentStake = calculateStake(currentStep);

  return {
    currentStep,
    currentCycleId,
    currentStake,
    targetOdd: { min: LEVERAGE_ODD_MIN, max: LEVERAGE_ODD_MAX },
    projectedPayout: Number((currentStake * 1.90).toFixed(2)),
    cycleHistory: cycleEvents,
    allTimeStats: {
      totalCycles,
      completedCycles,
      totalGreens,
      totalReds,
      longestStreak,
      totalProfit: Number(totalProfit.toFixed(2)),
    },
  };
}

// ─── Seleção do Bilhete do Dia (Motor Autônomo) ─────────────────────────────

/**
 * Seleciona o melhor jogo/bilhete da rodada para a alavancagem.
 *
 * Critérios (em ordem de prioridade):
 *   1. Odd do resultado sugerido entre 1.80–2.00
 *   2. Score de confiança mais alto
 *   3. Se nenhum jogo individual encaixa, combina 2 jogos curtos
 *
 * @param matches  Jogos da rodada já scorados
 * @param step     Passo atual (para calcular stake)
 * @returns Picks selecionados ou null se não houver jogo viável
 */
export function selectLeveragePicks(
  matches: ScoredMatch[],
  step: number,
): LeveragePick[] | null {
  if (matches.length === 0) return null;

  const stake = calculateStake(step);

  // ── Tentativa 1: Jogo simples com odd na faixa ──────────────────────────
  type Candidate = {
    match: ScoredMatch;
    outcome: "Home" | "Draw" | "Away";
    label: string;
    odd: number;
  };

  const singles: Candidate[] = [];

  for (const m of matches) {
    // Verifica cada resultado possível
    const outcomes: Array<{ outcome: "Home" | "Draw" | "Away"; odd: number; label: string }> = [
      { outcome: "Home", odd: m.homeOdd, label: m.homeTeam },
      { outcome: "Draw", odd: m.drawOdd, label: "Empate" },
      { outcome: "Away", odd: m.awayOdd, label: m.awayTeam },
    ];

    for (const o of outcomes) {
      if (o.odd >= LEVERAGE_ODD_MIN && o.odd <= LEVERAGE_ODD_MAX) {
        singles.push({ match: m, outcome: o.outcome, label: o.label, odd: o.odd });
      }
    }
  }

  // Ordena por score (maior confiança primeiro), depois pela odd mais próxima de 1.90
  singles.sort((a, b) => {
    const scoreDiff = b.match.score - a.match.score;
    if (Math.abs(scoreDiff) > 5) return scoreDiff;
    return Math.abs(a.odd - 1.90) - Math.abs(b.odd - 1.90);
  });

  if (singles.length > 0) {
    const best = singles[0];
    return [{
      matchId: best.match.id,
      homeTeam: best.match.homeTeam,
      awayTeam: best.match.awayTeam,
      pickOutcome: best.outcome,
      pickLabel: best.label,
      pickOdd: best.odd,
      score: best.match.score,
      homeBadge: null, // hidratado depois pelo badge-service
      awayBadge: null,
      reason: buildPickReason(best.match, best.outcome, best.odd),
    }];
  }

  // ── Tentativa 2: Múltipla curta (2 jogos com odds curtas) ───────────────
  // Busca 2 jogos com odds ~1.35–1.45 que combinadas deem ~1.80–2.00
  const shortOdds: Candidate[] = [];
  for (const m of matches) {
    const outcomes: Array<{ outcome: "Home" | "Draw" | "Away"; odd: number; label: string }> = [
      { outcome: "Home", odd: m.homeOdd, label: m.homeTeam },
      { outcome: "Away", odd: m.awayOdd, label: m.awayTeam },
    ];
    for (const o of outcomes) {
      if (o.odd >= 1.20 && o.odd <= 1.50 && m.score >= 40) {
        shortOdds.push({ match: m, outcome: o.outcome, label: o.label, odd: o.odd });
      }
    }
  }

  shortOdds.sort((a, b) => b.match.score - a.match.score);

  for (let i = 0; i < shortOdds.length - 1; i++) {
    for (let j = i + 1; j < shortOdds.length; j++) {
      if (shortOdds[i].match.id === shortOdds[j].match.id) continue;
      const combined = shortOdds[i].odd * shortOdds[j].odd;
      if (combined >= LEVERAGE_ODD_MIN && combined <= LEVERAGE_ODD_MAX + 0.10) {
        return [
          {
            matchId: shortOdds[i].match.id,
            homeTeam: shortOdds[i].match.homeTeam,
            awayTeam: shortOdds[i].match.awayTeam,
            pickOutcome: shortOdds[i].outcome,
            pickLabel: shortOdds[i].label,
            pickOdd: shortOdds[i].odd,
            score: shortOdds[i].match.score,
            homeBadge: null,
            awayBadge: null,
            reason: `Favorito forte, odd curta combinada para atingir a faixa 1.80–2.00.`,
          },
          {
            matchId: shortOdds[j].match.id,
            homeTeam: shortOdds[j].match.homeTeam,
            awayTeam: shortOdds[j].match.awayTeam,
            pickOutcome: shortOdds[j].outcome,
            pickLabel: shortOdds[j].label,
            pickOdd: shortOdds[j].odd,
            score: shortOdds[j].match.score,
            homeBadge: null,
            awayBadge: null,
            reason: `Complemento para a múltipla — alta confiança e odd curta.`,
          },
        ];
      }
    }
  }

  return null; // Nenhum jogo viável
}

/**
 * Monta o ticket completo para o dia.
 */
export function buildLeverageTicket(
  picks: LeveragePick[],
  step: number,
): LeverageTicket {
  const combinedOdd = picks.reduce((acc, p) => acc * p.pickOdd, 1);
  const stake = calculateStake(step);
  const projectedPayout = Number((stake * combinedOdd).toFixed(2));

  const stepMessages: Record<number, string> = {
    1: "Passo 1 — hora de plantar a semente. R$ 10 com fé no processo.",
    2: "Passo 2 — o motor já mostrou que funciona. Mantém a frequência.",
    3: "Passo 3 — três seguidos. A disciplina tá virando hábito.",
    5: "Passo 5 — um terço do caminho. O método não falha, só precisa de tempo.",
    7: "Passo 7 — metade. Daqui pra frente é altitude.",
    10: "Passo 10 — dois terços. A banca já sente o peso da consistência.",
    12: "Passo 12 — falta pouco. A pressão é real, mas o processo segura.",
    14: "Passo 14 — penúltimo. Um green separa você do ciclo completo.",
    15: "Passo 15 — o topo. Se chegar aqui, o método provou tudo.",
  };

  const bobMessage = stepMessages[step] ??
    `Passo ${step} de 15. Stake de R$ ${stake.toFixed(2)} reinvestido do green anterior. Confia no processo.`;

  return {
    picks,
    combinedOdd: Number(combinedOdd.toFixed(2)),
    stake,
    projectedPayout,
    step,
    bobMessage,
  };
}

// ─── Helpers internos ────────────────────────────────────────────────────────

function buildPickReason(match: ScoredMatch, outcome: "Home" | "Draw" | "Away", odd: number): string {
  const team = outcome === "Home" ? match.homeTeam : outcome === "Away" ? match.awayTeam : "empate";
  if (odd <= 1.85) {
    return `${team} com odd ${odd.toFixed(2)} — preço curto e leitura limpa. Entrada de alta probabilidade.`;
  }
  if (odd >= 1.95) {
    return `${team} com odd ${odd.toFixed(2)} — valor justo, cenário favorável. Boa relação risco/retorno.`;
  }
  return `${team} com odd ${odd.toFixed(2)} — exatamente na zona ideal da alavancagem. Score ${match.score}/100.`;
}
