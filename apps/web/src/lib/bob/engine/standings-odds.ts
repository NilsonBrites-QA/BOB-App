/**
 * BOB — Cálculo de Probabilidades de Título e Rebaixamento (Sprint 6C)
 *
 * Estimativa simples baseada em:
 *   - Pontos atuais
 *   - Rodadas restantes
 *   - Pontos máximos possíveis
 *   - Referência histórica (70 pts para título, 45 pts para escapar do Z4 no BSA)
 *
 * Sem simulação Monte Carlo — apenas comparação linear com thresholds históricos.
 * Atualiza automaticamente com a tabela da API (standings).
 */

import type { FDStandingEntry } from "@/lib/bob/connectors/football-data";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type TitleProb   = "Campeão confirmado" | "Alta" | "Média" | "Baixa" | "Eliminado";
export type RelegProb   = "Rebaixado confirmado" | "Crítico" | "Risco real" | "Atenção" | "Seguro";

export type TeamOdds = {
  teamId:     number;
  teamName:   string;
  points:     number;
  position:   number;
  roundsDone: number;
  maxPoints:  number; // pontos + (rodadas_restantes × 3)
  titleProb:  TitleProb;
  relegProb:  RelegProb;
  // Contexto legível ("Precisa de X em 10 rodadas")
  titleNote:  string;
  relegNote:  string;
};

// ─── Thresholds históricos (BSA) ─────────────────────────────────────────────

const TITLE_THRESHOLD    = 70; // mínimo histórico para título no BSA
const SAFE_THRESHOLD     = 45; // mínimo histórico para escapar do Z4
const TOTAL_ROUNDS       = 38;
const POINTS_PER_WIN     = 3;

// ─── Funções de classificação ─────────────────────────────────────────────────

function calcTitleProb(points: number, maxPoints: number, position: number, ppg: number): TitleProb {
  // Líder com mais de 85% da temporada feita e projeção suficiente
  if (position === 1 && ppg >= 2.0 && points >= 55) return "Campeão confirmado";
  if (maxPoints < TITLE_THRESHOLD) return "Eliminado";
  // Projeção PPG — se o time mantiver o ritmo, chegará ao título?
  const projectedFinal = ppg * TOTAL_ROUNDS;
  if (position <= 2 && projectedFinal >= TITLE_THRESHOLD - 3) return "Alta";
  const gap = TITLE_THRESHOLD - points;
  if (gap <= 5)  return "Alta";
  if (gap <= 15) return "Média";
  return "Baixa";
}

function calcRelegProb(points: number, maxPoints: number, position: number, roundsDone: number): RelegProb {
  const remaining       = Math.max(1, TOTAL_ROUNDS - roundsDone);
  const ppg             = roundsDone > 0 ? points / roundsDone : 1.0;
  const projectedPoints = Math.round(points + ppg * remaining);

  // Matematicamente impossível escapar
  if (maxPoints < SAFE_THRESHOLD - 5) return "Rebaixado confirmado";

  // Top 6 é seguro para rebaixamento
  if (position <= 6) return "Seguro";

  // Pontos suficientes por folga confortável
  if (points >= SAFE_THRESHOLD + 10) return "Seguro";

  // Projeção confortavelmente acima do threshold com margem
  if (projectedPoints >= SAFE_THRESHOLD + 10) return "Seguro";

  // Zona de rebaixamento (17–20): nunca pode ser "Seguro" — está na zona por definição
  if (position >= 17) {
    if (projectedPoints < SAFE_THRESHOLD - 5) return "Crítico";    // trajetória aponta rebaixamento
    if (projectedPoints < SAFE_THRESHOLD + 3) return "Risco real"; // na corda-bamba
    return "Atenção";                                               // na zona mas projeção aponta escapar
  }

  // Posições 7–16: risco progressivo baseado em projeção de pontos finais
  if (projectedPoints < SAFE_THRESHOLD)     return "Risco real";
  if (projectedPoints < SAFE_THRESHOLD + 5) return "Atenção";
  return "Seguro";
}

function titleNote(points: number, roundsDone: number): string {
  const remaining = TOTAL_ROUNDS - roundsDone;
  const maxPts    = points + remaining * POINTS_PER_WIN;
  const needed    = Math.max(0, TITLE_THRESHOLD - points);
  if (needed === 0) return `${points} pts — pode fechar o título`;
  return `Precisa de ${needed} em ${remaining} rodadas (máx ${maxPts} pts)`;
}

function relegNote(points: number, roundsDone: number): string {
  const remaining = TOTAL_ROUNDS - roundsDone;
  const needed    = Math.max(0, SAFE_THRESHOLD - points);
  if (needed === 0) return `${points} pts — matematicamente seguro`;
  if (remaining === 0) return `${points} pts — temporada encerrada`;
  return `Precisa de ${needed} em ${remaining} rodadas para escapar do Z4`;
}

// ─── calcTeamOdds ─────────────────────────────────────────────────────────────

/**
 * Calcula probabilidades de título/rebaixamento para todos os times da tabela.
 *
 * @param standings - Array da tabela TOTAL do football-data.org
 */
export function calcTeamOdds(standings: FDStandingEntry[]): TeamOdds[] {
  return standings.map((entry) => {
    const roundsDone  = entry.playedGames;
    const remaining   = Math.max(0, TOTAL_ROUNDS - roundsDone);
    const maxPoints   = entry.points + remaining * POINTS_PER_WIN;
    const ppg         = roundsDone > 0 ? entry.points / roundsDone : 0;

    return {
      teamId:    entry.team.id,
      teamName:  entry.team.shortName || entry.team.name,
      points:    entry.points,
      position:  entry.position,
      roundsDone,
      maxPoints,
      titleProb: calcTitleProb(entry.points, maxPoints, entry.position, ppg),
      relegProb: calcRelegProb(entry.points, maxPoints, entry.position, roundsDone),
      titleNote: titleNote(entry.points, roundsDone),
      relegNote: relegNote(entry.points, roundsDone),
    };
  });
}
