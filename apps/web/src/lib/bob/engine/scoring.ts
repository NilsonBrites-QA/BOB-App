/**
 * BOB — Motor de Scoring de Âncoras
 *
 * Calcula o score (0–100) de um candidato a âncora aplicando os 8 fatores do
 * método BOB com seus pesos documentados no mock-data.ts.
 *
 * Contrato de entrada: MatchInput — snapshot normalizado de um jogo.
 * Contrato de saída:   ScoredMatch — mesmo objeto + score + reasons.
 *
 * O motor é DETERMINÍSTICO: para o mesmo MatchInput produz sempre o mesmo score.
 * Não usa LLM nem randomização. A IA entra depois, apenas para narrativa.
 */

// ─── Tipos de entrada ─────────────────────────────────────────────────────────

export type MatchInput = {
  /** Identificador único do jogo (ex: "abc123") */
  id: string;
  /** "Flamengo x Palmeiras" */
  match: string;
  homeTeam: string;
  awayTeam: string;

  // Fator 1 — Posição e contexto da tabela (peso 15)
  homePosition: number; // 1–20
  awayPosition: number;
  homeNeedsWin: boolean; // urgência real de vencer este jogo
  awayNeedsWin: boolean;

  // Fator 2 — Resultados recentes (peso 12)
  /** Últimos 5 resultados: 'W' | 'D' | 'L' */
  homeForm: string[]; // ex: ['W','W','D','W','L']
  awayForm: string[];

  // Fator 3 — Casa x fora (peso 12)
  /** Pontos conquistados como mandante nos últimos 5 jogos em casa (0–15) */
  homeHomePoints: number;
  /** Pontos conquistados como visitante nos últimos 5 jogos fora (0–15) */
  awayAwayPoints: number;

  // Fator 4 — Gols e xG recente (peso 18)
  homeGoalsScored5: number; // gols marcados nos últimos 5
  homeGoalsConceded5: number;
  awayGoalsScored5: number;
  awayGoalsConceded5: number;

  // Fator 5 — Confronto direto histórico (peso 8)
  /** Percentual de vitórias do mandante nos últimos 5 H2H (0–1) */
  h2hHomeWinRate: number;

  // Fator 6 — Desfalques e suspensões (peso 15)
  /** Desfalques que impactam o jogo como porcentagem do elenco principal (0–1) */
  homeAbsenceRate: number; // ex: 0.1 = 10% do elenco indisponível
  awayAbsenceRate: number;

  // Fator 7 — Calendário competitivo (peso 8)
  /** O mandante joga competição paralela importante nos próximos 3 dias? */
  homeBigGameAhead: boolean;
  awayBigGameAhead: boolean;

  // Fator 8 — Mercado e movimento de odd (peso 9)
  /** Odd atual da vitória do mandante na casa de aposta */
  homeOdd: number;
  drawOdd: number;
  awayOdd: number;
  /** A odd do mandante caiu (mercado comprou a vitória)? */
  homeOddDropped: boolean;

  // ── Fase 10: campos estendidos (todos opcionais para retrocompatibilidade) ──

  // Fator 9 — Momentum / tendência de forma (peso 7)
  /** Últimos 10 resultados: 'W' | 'D' | 'L' */
  homeForm10?: string[];
  awayForm10?: string[];
  /**
   * Tendência de performance: compara últimos 5 vs jogos 6-10.
   * -1 = em queda acentuada · 0 = estável · +1 = acelerando
   */
  homeMomentum?: number;
  awayMomentum?: number;

  // Fator 10 — Motivação contextual (peso 3)
  /**
   * 0 = situação normal
   * 1 = relevante (briga por G4 / Libertadores)
   * 2 = crítico (rebaixamento iminente / disputa pelo título)
   */
  motivationHome?: number;
  motivationAway?: number;

  // RN05 — Classificador de volatilidade
  /** Clássico regional (Fla×Flu, Pal×Cor, Gre×Inter…) → volatilidade imprevisível */
  isClassico?: boolean;
};

export type ScoredMatch = MatchInput & {
  score: number; // 0–100
  reasons: string[];
  suggestedResult: "1" | "X" | "2";
  isAnchorCandidate: boolean; // true se score >= ANCHOR_THRESHOLD
};

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Score mínimo para ser considerado âncora */
const ANCHOR_THRESHOLD = 60;

/** Odd máxima aceitável para o mandante ser âncora (value bet implícito) */
const MAX_ANCHOR_ODD = 2.20;

/** Pesos dos 10 fatores (somam 100) */
const WEIGHTS = {
  tableContext: 14, // era 15 (-1)
  recentForm:   10, // era 12 (-2) — forma curta (5j)
  momentum:      7, // NOVO — tendência forma curta vs estendida
  homeAway:     11, // era 12 (-1)
  goalsXg:      16, // era 18 (-2)
  h2h:           8, // mantido
  absences:     14, // era 15 (-1)
  calendar:      8, // era 10 (-2)
  market:        9, // era 10 (-1)
  motivation:    3, // NOVO — contexto de tabela (rebaixamento / título / G4)
} as const;

// ─── Funções auxiliares ───────────────────────────────────────────────────────

function formScore(form: string[]): number {
  // W=3, D=1, L=0 — normalizado para 0–1 sobre máximo possível (5×3=15)
  const pts = form.reduce((acc, r) => acc + (r === "W" ? 3 : r === "D" ? 1 : 0), 0);
  return pts / 15;
}

function positionScore(position: number): number {
  // Posição 1 = 1.0, posição 20 = 0.0
  return (20 - position) / 19;
}

function absencePenalty(rate: number): number {
  // 0% ausências = 1.0; 100% = 0.0
  return Math.max(0, 1 - rate * 3); // penaliza 3× a taxa
}

function oddToImpliedProb(odd: number): number {
  return odd > 0 ? 1 / odd : 0;
}

// ─── Motor principal ──────────────────────────────────────────────────────────

export function scoreMatch(input: MatchInput): ScoredMatch {
  const reasons: string[] = [];
  let total = 0;

  // ── Fator 1: Posição e contexto da tabela (peso 15) ──────────────────────
  const homePosFactor = positionScore(input.homePosition);
  const awayPosFactor = positionScore(input.awayPosition);
  const tableDiff = homePosFactor - awayPosFactor;
  const tableScore = Math.min(1, Math.max(0, 0.5 + tableDiff * 0.8));
  const tableBonus = input.homeNeedsWin ? 0.15 : input.awayNeedsWin ? -0.1 : 0;
  const f1 = Math.min(1, Math.max(0, tableScore + tableBonus));
  total += f1 * WEIGHTS.tableContext;

  if (f1 > 0.7)
    reasons.push(
      `Posição na tabela favorece o mandante (${input.homePosition}º vs ${input.awayPosition}º)`,
    );
  if (input.homeNeedsWin) reasons.push("Mandante com urgência de resultado");

  // ── Fator 2: Resultados recentes (peso 12) ────────────────────────────────
  const homeFormScore = formScore(input.homeForm);
  const awayFormScore = formScore(input.awayForm);
  const f2 = Math.min(1, Math.max(0, 0.5 + (homeFormScore - awayFormScore)));
  total += f2 * WEIGHTS.recentForm;

  const homeFormStr = input.homeForm.join("");
  if (homeFormScore > 0.6)
    reasons.push(`Forma recente forte do mandante (${homeFormStr})`);
  if (awayFormScore < 0.3)
    reasons.push(`Visitante em má fase (${input.awayForm.join("")})`);

  // ── Fator 3: Casa x fora (peso 12) ───────────────────────────────────────
  // homeHomePoints e awayAwayPoints em escala 0–15
  const homeHomeFactor = input.homeHomePoints / 15;
  const awayAwayFactor = input.awayAwayPoints / 15;
  const f3 = Math.min(1, Math.max(0, homeHomeFactor - awayAwayFactor * 0.5 + 0.3));
  total += f3 * WEIGHTS.homeAway;

  if (homeHomeFactor > 0.6)
    reasons.push(`Mandante forte em casa (${input.homeHomePoints} pts últimos 5 jogos em casa)`);
  if (awayAwayFactor < 0.3)
    reasons.push("Visitante com rendimento fora de casa abaixo da média");

  // ── Fator 4: Gols e xG recente (peso 18) ─────────────────────────────────
  const homeAttack = input.homeGoalsScored5 / 10; // normalizado por 10 gols
  const homeDefense = 1 - input.homeGoalsConceded5 / 10;
  const awayAttack = input.awayGoalsScored5 / 10;
  const awayDefense = 1 - input.awayGoalsConceded5 / 10;
  const homeGoalAdv = (homeAttack + homeDefense) / 2;
  const awayGoalAdv = (awayAttack + awayDefense) / 2;
  const f4 = Math.min(1, Math.max(0, 0.5 + (homeGoalAdv - awayGoalAdv)));
  total += f4 * WEIGHTS.goalsXg;

  if (homeAttack > 0.6)
    reasons.push(`Produção ofensiva elevada do mandante (${input.homeGoalsScored5} gols nos últimos 5)`);
  if (awayGoalAdv < 0.4)
    reasons.push(`Visitante com desequilíbrio gols/defesa nos últimos jogos`);

  // ── Fator 5: H2H (peso 8) ─────────────────────────────────────────────────
  const f5 = input.h2hHomeWinRate;
  total += f5 * WEIGHTS.h2h;

  if (f5 > 0.6)
    reasons.push(
      `Histórico de confrontos favorece o mandante (${Math.round(f5 * 100)}% de vitórias nos últimos 5 H2H)`,
    );

  // ── Fator 6: Desfalques e suspensões (peso 15) ────────────────────────────
  const homeAbsFactor = absencePenalty(input.homeAbsenceRate);
  const awayAbsFactor = absencePenalty(input.awayAbsenceRate);
  const f6 = Math.min(1, Math.max(0, 0.5 + (homeAbsFactor - awayAbsFactor) * 0.5));
  total += f6 * WEIGHTS.absences;

  if (input.homeAbsenceRate > 0.2)
    reasons.push(
      `Atenção: mandante com ${Math.round(input.homeAbsenceRate * 100)}% do elenco indisponível`,
    );
  if (input.awayAbsenceRate > 0.2)
    reasons.push(
      `Visitante reduzido (${Math.round(input.awayAbsenceRate * 100)}% de desfalques)`,
    );

  // ── Fator 7: Calendário competitivo (peso 10) ─────────────────────────────
  const calHome = input.homeBigGameAhead ? 0.3 : 1.0; // risco de poupar
  const calAway = input.awayBigGameAhead ? 0.3 : 1.0;
  const f7 = Math.min(1, Math.max(0, 0.5 + (calHome - calAway) * 0.4));
  total += f7 * WEIGHTS.calendar;

  if (input.homeBigGameAhead)
    reasons.push("Mandante pode poupar titulares antes de jogo decisivo");
  if (input.awayBigGameAhead)
    reasons.push("Visitante com desgaste de calendário — menos motivação fora");

  // ── Fator 8: Mercado e movimento de odd (peso 9) ─────────────────────────
  const impliedHome = oddToImpliedProb(input.homeOdd);
  const marketFactor = Math.min(1, impliedHome * 1.5); // normaliza ~0.4–0.9 para 0–1
  const dropBonus = input.homeOddDropped ? 0.1 : 0;
  const f8 = Math.min(1, Math.max(0, marketFactor + dropBonus));
  total += f8 * WEIGHTS.market;

  if (impliedHome > 0.55) reasons.push(`Mercado precifica vitória do mandante (odd ${input.homeOdd})`);
  if (input.homeOddDropped) reasons.push("Odd do mandante em queda — mercado comprou a vitória");

  // ── Fator 9: Momentum / tendência de forma (peso 7) ─────────────────────
  const hMomentum = input.homeMomentum ?? 0;
  const aMomentum = input.awayMomentum ?? 0;
  const f9 = Math.min(1, Math.max(0, 0.5 + (hMomentum - aMomentum) * 0.5));
  total += f9 * WEIGHTS.momentum;

  if (hMomentum > 0.3) reasons.push("Mandante em trajetória ascendente nas últimas rodadas");
  if (aMomentum < -0.3) reasons.push("Visitante em queda de rendimento recente");
  if (hMomentum < -0.3) reasons.push("Atenção: mandante em sequência de queda recente");

  // ── Fator 10: Motivação contextual (peso 3) ──────────────────────────────
  const mHome = input.motivationHome ?? 0;
  const mAway = input.motivationAway ?? 0;
  const f10 = Math.min(1, Math.max(0, 0.5 + (mHome - mAway) * 0.25));
  total += f10 * WEIGHTS.motivation;

  if (mHome >= 2) reasons.push("Mandante em situação crítica — motivação máxima garantida");
  if (mAway >= 2) reasons.push("Visitante com pressão extrema — jogo de alto risco");
  if (mHome === 1) reasons.push("Mandante brigando por G4/Libertadores — motivação elevada");

  // ── Score final ───────────────────────────────────────────────────────────
  const rawScore = Math.round(Math.min(100, Math.max(0, total)));

  // RN05: Clássico regional → cap no score (imprevisibilidade estrutural)
  const isClassico = input.isClassico === true;
  const score = isClassico ? Math.min(rawScore, 55) : rawScore;

  if (isClassico) reasons.push("Clássico regional — volatilidade elevada, score limitado");

  // Resultado sugerido
  const homeProb = oddToImpliedProb(input.homeOdd);
  const drawProb = oddToImpliedProb(input.drawOdd);
  const awayProb = oddToImpliedProb(input.awayOdd);
  const suggestedResult: "1" | "X" | "2" =
    homeProb >= drawProb && homeProb >= awayProb
      ? "1"
      : drawProb >= awayProb
        ? "X"
        : "2";

  // RN10: Value Edge — score do algoritmo deve superar a probabilidade implícita do mercado
  const algoProb = score / 100;
  const marketImplied = input.homeOdd > 0 ? 1 / input.homeOdd : 0;
  const hasValueEdge = algoProb > marketImplied;

  const isAnchorCandidate =
    !isClassico &&                        // RN05: clássico nunca é âncora
    score >= ANCHOR_THRESHOLD &&
    suggestedResult === "1" &&
    input.homeOdd <= MAX_ANCHOR_ODD &&
    hasValueEdge;                         // RN10: Value Edge obrigatório

  return {
    ...input,
    score,
    reasons: reasons.slice(0, 5), // máximo 5 razões por âncora
    suggestedResult,
    isAnchorCandidate,
  };
}

// ─── Selecionar as 4 âncoras a partir de uma lista de jogos ─────────────────

export function selectAnchors(matches: MatchInput[]): ScoredMatch[] {
  const scored = matches.map(scoreMatch);

  // Filtra candidatos válidos e ordena por score decrescente
  const candidates = scored
    .filter((m) => m.isAnchorCandidate)
    .sort((a, b) => b.score - a.score);

  // Retorna até 4 âncoras
  return candidates.slice(0, 4);
}
