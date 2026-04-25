/**
 * BOB — Gerador de "Criar Apostas" por partida (single-match coherent bets)
 *
 * Conforme PRD `criar-apostas.md`:
 *   - O BOB ENTREGA apostas prontas (não permite o usuário criar)
 *   - Uma "Criar Aposta" por partida, combinando mercados COERENTES da mesma narrativa
 *   - Odds típicas: 1.28 a 2.00 (alavancagem) até no máximo ~30x em single-match
 *   - Big Odds 100x+ NÃO são single-match, são variações combinadas (módulo separado)
 *
 * Estratégia:
 *   - Analisa a narrativa dominante da partida (favorito claro? equilíbrio? zebra justificada?)
 *   - Constrói 1 "ticket" combinando 1-3 picks COERENTES (resultado + over/under + BTTS)
 *   - Calcula a odd combinada projetada (estimativa baseada nas odds 1X2 e probabilidades)
 *   - Gera análise narrativa estilo BOB
 */

import type { ScoredMatch } from "./scoring";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type CriarApostaPick = {
  /** Mercado: "1X2", "DC" (dupla chance), "OU" (over/under), "BTTS", "DNB" */
  market: string;
  /** Label legível: "Vitória mandante", "Mais de 2.5 gols", "Ambas marcam: Sim" */
  label: string;
  /** Odd estimada deste pick (decimal) */
  odd: number;
  /** Probabilidade de acerto estimada deste pick (0-1) */
  probability: number;
};

export type CriarApostaProfile = "ALAVANCAGEM" | "MODERADA" | "AGRESSIVA";

export type CriarAposta = {
  /** ID do jogo */
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  scheduledAt: string;
  competition: string;

  /** Perfil deste ticket */
  profile: CriarApostaProfile;

  /** Picks coerentes da narrativa (1 a 3 mercados) */
  picks: CriarApostaPick[];

  /** Odd combinada do ticket (produto das odds dos picks) */
  combinedOdd: number;

  /** Probabilidade de acerto combinada (produto das probs) */
  combinedProbability: number;

  /** Confiança 0-100 */
  confidence: number;

  /** Narrativa do BOB sobre a partida e a escolha */
  bobNarrative: string;

  /** Risco textual: "Baixo", "Médio", "Alto" */
  riskLabel: "Baixo" | "Médio" | "Alto";

  /** Alertas de risco específicos */
  alerts: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function oddToProb(odd: number): number {
  if (!odd || odd <= 1) return 0;
  return 1 / odd;
}

function probToOdd(prob: number): number {
  if (prob <= 0) return 99;
  if (prob >= 0.99) return 1.01;
  return 1 / prob;
}

/**
 * Estima probabilidade de Over 2.5 gols com base nas odds 1X2
 * Heurística: jogos com favorito claro + odd 2 alta tendem a ter mais gols
 */
function estimateOver25Prob(homeOdd: number, drawOdd: number, awayOdd: number): number {
  const totalImplied = oddToProb(homeOdd) + oddToProb(drawOdd) + oddToProb(awayOdd);
  const homeProb = oddToProb(homeOdd) / totalImplied;
  const drawProb = oddToProb(drawOdd) / totalImplied;
  const awayProb = oddToProb(awayOdd) / totalImplied;

  // Disparidade: jogos desbalanceados tendem a ter mais gols
  const disparity = Math.abs(homeProb - awayProb);
  // Empate baixo (drawProb < 0.25) sugere jogo aberto
  const openness = 1 - drawProb;

  // Probabilidade base ~0.50, ajusta por disparidade e abertura
  const prob = Math.min(0.78, Math.max(0.32, 0.40 + disparity * 0.4 + (openness - 0.7) * 0.3));
  return prob;
}

/** Probabilidade Ambas Marcam (BTTS) */
function estimateBttsProb(homeOdd: number, drawOdd: number, awayOdd: number): number {
  const totalImplied = oddToProb(homeOdd) + oddToProb(drawOdd) + oddToProb(awayOdd);
  const homeProb = oddToProb(homeOdd) / totalImplied;
  const awayProb = oddToProb(awayOdd) / totalImplied;
  const disparity = Math.abs(homeProb - awayProb);

  // BTTS é menor quando há disparidade grande (favoritão tende a fazer 1 a 0)
  const prob = Math.min(0.72, Math.max(0.28, 0.55 - disparity * 0.5));
  return prob;
}

// ─── Gerador principal ────────────────────────────────────────────────────────

export function buildCriarAposta(match: ScoredMatch): CriarAposta {
  const totalImplied = oddToProb(match.homeOdd) + oddToProb(match.drawOdd) + oddToProb(match.awayOdd);
  const homeProb = oddToProb(match.homeOdd) / totalImplied;
  const drawProb = oddToProb(match.drawOdd) / totalImplied;
  const awayProb = oddToProb(match.awayOdd) / totalImplied;
  const bobScore = match.score; // 0-100

  const picks: CriarApostaPick[] = [];
  const alerts: string[] = [];
  let profile: CriarApostaProfile = "MODERADA";
  let narrative = "";

  // ── Cenário 1: Favorito mandante FORTE (homeOdd ≤ 1.45 e bobScore ≥ 70)
  if (match.homeOdd <= 1.45 && bobScore >= 70 && !match.isClassico) {
    // Combinar resultado + over 1.5 (quase certo em jogo desbalanceado)
    picks.push({
      market: "1X2",
      label: `Vitória ${match.homeTeam}`,
      odd: match.homeOdd,
      probability: homeProb,
    });

    const over15Prob = Math.min(0.85, 0.65 + (1 - homeProb) * 0.3 + estimateOver25Prob(match.homeOdd, match.drawOdd, match.awayOdd) * 0.3);
    const over15Odd = probToOdd(over15Prob);
    if (over15Odd >= 1.20 && over15Odd <= 1.80) {
      picks.push({
        market: "OU",
        label: "Mais de 1.5 gols",
        odd: over15Odd,
        probability: over15Prob,
      });
    }

    profile = "ALAVANCAGEM";
    narrative = `${match.homeTeam} entra como favorito sólido (odd ${match.homeOdd.toFixed(2)}). A combinação resultado + over 1.5 captura a narrativa esperada: time superior dominando e construindo o placar sem sustos.`;
  }
  // ── Cenário 2: Favorito mandante MODERADO (1.45 < homeOdd ≤ 2.00)
  else if (match.homeOdd <= 2.00 && bobScore >= 55 && !match.isClassico) {
    picks.push({
      market: "1X2",
      label: `Vitória ${match.homeTeam}`,
      odd: match.homeOdd,
      probability: homeProb,
    });
    profile = "ALAVANCAGEM";
    narrative = `${match.homeTeam} é favorito justificado pelos dados (score BOB ${bobScore}/100). Aposta de alavancagem: odd justa, contexto favorável, sem complicações.`;
  }
  // ── Cenário 3: Favorito visitante CLARO
  else if (match.awayOdd <= 1.80 && awayProb > homeProb + 0.15) {
    picks.push({
      market: "1X2",
      label: `Vitória ${match.awayTeam}`,
      odd: match.awayOdd,
      probability: awayProb,
    });
    profile = match.awayOdd <= 1.50 ? "ALAVANCAGEM" : "MODERADA";
    narrative = `${match.awayTeam} entra como favorito mesmo fora de casa (odd ${match.awayOdd.toFixed(2)}). Mando do mandante não é vantagem suficiente — visitante tem qualidade superior.`;
  }
  // ── Cenário 4: Equilibrado / Empate provável
  else if (drawProb > 0.30 || (Math.abs(homeProb - awayProb) < 0.10 && match.drawOdd <= 3.50)) {
    // Dupla chance: cobre mandante OU empate
    if (homeProb >= awayProb) {
      const dcProb = homeProb + drawProb;
      const dcOdd = probToOdd(dcProb);
      picks.push({
        market: "DC",
        label: `${match.homeTeam} ou Empate (1X)`,
        odd: dcOdd,
        probability: dcProb,
      });
      narrative = `Jogo equilibrado. Dupla chance ${match.homeTeam}/Empate captura ${(dcProb * 100).toFixed(0)}% de cobertura — proteção contra o cenário menos provável (vitória visitante).`;
    } else {
      const dcProb = awayProb + drawProb;
      const dcOdd = probToOdd(dcProb);
      picks.push({
        market: "DC",
        label: `${match.awayTeam} ou Empate (X2)`,
        odd: dcOdd,
        probability: dcProb,
      });
      narrative = `Jogo equilibrado com leve favoritismo do visitante. Dupla chance ${match.awayTeam}/Empate cobre ${(dcProb * 100).toFixed(0)}% das possibilidades.`;
    }
    profile = "ALAVANCAGEM";
    if (match.isClassico) alerts.push("Clássico regional — volatilidade alta, redução do tamanho da aposta");
  }
  // ── Cenário 5: Caos / clássico — over/under defensivo
  else {
    const over25Prob = estimateOver25Prob(match.homeOdd, match.drawOdd, match.awayOdd);
    if (over25Prob >= 0.55) {
      picks.push({
        market: "OU",
        label: "Mais de 2.5 gols",
        odd: probToOdd(over25Prob),
        probability: over25Prob,
      });
      narrative = "Cenário caótico — picks 1X2 instáveis. Aposta em volume de gols: ambas as equipes têm propensão ofensiva pelos dados.";
    } else {
      picks.push({
        market: "OU",
        label: "Menos de 2.5 gols",
        odd: probToOdd(1 - over25Prob),
        probability: 1 - over25Prob,
      });
      narrative = "Cenário fechado — sem favorito claro. Aposta em jogo travado, sub 2.5 gols: padrão histórico em confrontos equilibrados.";
    }
    profile = "MODERADA";
    if (match.isClassico) alerts.push("Clássico regional — alta volatilidade");
  }

  // ── Ajuste agressivo: se ainda há margem para combinar BTTS coerente, opcional
  const hasMainResult = picks.some((p) => p.market === "1X2");
  if (hasMainResult && picks.length === 1 && bobScore >= 65) {
    const bttsProb = estimateBttsProb(match.homeOdd, match.drawOdd, match.awayOdd);
    // Combina BTTS Não em jogos desbalanceados (favoritão fecha o resultado)
    if (bttsProb < 0.45) {
      picks.push({
        market: "BTTS",
        label: "Ambas marcam: Não",
        odd: probToOdd(1 - bttsProb),
        probability: 1 - bttsProb,
      });
    }
    // Combina BTTS Sim em jogos abertos
    else if (bttsProb > 0.60) {
      picks.push({
        market: "BTTS",
        label: "Ambas marcam: Sim",
        odd: probToOdd(bttsProb),
        probability: bttsProb,
      });
    }
  }

  // Cálculos finais
  const combinedOdd = picks.reduce((acc, p) => acc * p.odd, 1);
  const combinedProbability = picks.reduce((acc, p) => acc * p.probability, 1);

  // Confiança = combinedProbability * 100, ajustada
  const confidence = Math.min(95, Math.max(15, Math.round(combinedProbability * 100 + bobScore * 0.15)));

  // Risk label
  let riskLabel: "Baixo" | "Médio" | "Alto" = "Médio";
  if (combinedOdd <= 1.50 && confidence >= 65) riskLabel = "Baixo";
  else if (combinedOdd > 2.50 || confidence < 45) riskLabel = "Alto";

  // Profile rebalance
  if (combinedOdd <= 2.00) profile = "ALAVANCAGEM";
  else if (combinedOdd <= 5.00) profile = "MODERADA";
  else profile = "AGRESSIVA";

  // Alertas de risco
  if (match.isClassico && !alerts.length) alerts.push("Clássico regional — volatilidade elevada");
  if (combinedOdd > 10) alerts.push("Odd combinada > 10x: aposta de alta convicção, valide narrativa");
  if (confidence < 35) alerts.push("Confiança baixa — leia a análise antes de copiar");

  return {
    matchId: match.id,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    scheduledAt: "",
    competition: "Brasileirão",
    profile,
    picks,
    combinedOdd,
    combinedProbability,
    confidence,
    bobNarrative: narrative,
    riskLabel,
    alerts,
  };
}

/**
 * Gera uma "Criar Aposta" por partida da rodada.
 * Filtra partidas com odds inválidas.
 */
export function buildCriarApostasForRound(matches: ScoredMatch[]): CriarAposta[] {
  return matches
    .filter((m) => m.homeOdd > 0 && m.drawOdd > 0 && m.awayOdd > 0)
    .map(buildCriarAposta);
}
