/**
 * BOB — Motor de Scoring de Âncoras
 *
 * Calcula o score (0–100) de um candidato a âncora aplicando os 8 fatores do
 * método Camillo com seus pesos documentados no mock-data.ts.
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

  // Fator 7 — Calendário competitivo (peso 10)
  /** O mandante joga competição paralela importante nos próximos 3 dias? */
  homeBigGameAhead: boolean;
  awayBigGameAhead: boolean;

  // Fator 8 — Mercado e movimento de odd (peso 10)
  /** Odd atual da vitória do mandante na casa de aposta */
  homeOdd: number;
  drawOdd: number;
  awayOdd: number;
  /** A odd do mandante caiu (mercado comprou a vitória)? */
  homeOddDropped: boolean;
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

/** Pesos dos 8 fatores (somam 100) */
const WEIGHTS = {
  tableContext: 15,
  recentForm: 12,
  homeAway: 12,
  goalsXg: 18,
  h2h: 8,
  absences: 15,
  calendar: 10,
  market: 10,
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

  // ── Fator 8: Mercado e movimento de odd (peso 10) ─────────────────────────
  const impliedHome = oddToImpliedProb(input.homeOdd);
  const marketFactor = Math.min(1, impliedHome * 1.5); // normaliza ~0.4–0.9 para 0–1
  const dropBonus = input.homeOddDropped ? 0.1 : 0;
  const f8 = Math.min(1, Math.max(0, marketFactor + dropBonus));
  total += f8 * WEIGHTS.market;

  if (impliedHome > 0.55) reasons.push(`Mercado precifica vitória do mandante (odd ${input.homeOdd})`);
  if (input.homeOddDropped) reasons.push("Odd do mandante em queda — mercado comprou a vitória");

  // ── Score final ───────────────────────────────────────────────────────────
  const score = Math.round(Math.min(100, Math.max(0, total)));

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

  const isAnchorCandidate =
    score >= ANCHOR_THRESHOLD &&
    suggestedResult === "1" &&
    input.homeOdd <= MAX_ANCHOR_ODD;

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
