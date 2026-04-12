/**
 * BOB — Detector de Oportunidades de Zebra (Sprint 6A)
 *
 * Identifica jogos onde o VISITANTE FORTE pode ser surpreendido pelo mandante fraco.
 * NÃO é uma âncora — é um alerta informativo para o usuário decidir.
 *
 * Critério BOB para zebra:
 *   - Visitante está no TOP 6 da tabela
 *   - Mandante está no BOTTOM 6 (posição 15–20)
 *   - Mandante tem boa performance em casa (homeHomePoints ≥ 7 de 15)
 *   - Visitante tem pelo menos UMA condição desfavorável:
 *       a) Copa/Libertadores na semana (awayCupCompetition !== "none")
 *       b) Desfalques acima de 20% (awayAbsenceRate > 0.20)
 *       c) Forma recente ruim fora de casa (awayForm com ≤ 1W nos últimos 5)
 *       d) Calendário saturado (awayBigGameAhead === true)
 *
 * Score de zebra: 0–100. Quanto maior, mais interessante a oportunidade.
 */

import type { MatchInput } from "./scoring";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ZebraOpportunity = {
  matchId:      string;
  match:        string;   // "Mandante x Visitante"
  homeTeam:     string;
  awayTeam:     string;
  zebraScore:   number;   // 0–100 (quanto maior, mais interessante)
  reasons:      string[]; // fatores que favorecem a zebra
  homeOdd:      number;   // odd do mandante (referência para o usuário)
  awayPosition: number;   // posição do visitante na tabela (evidência da força)
  homePosition: number;   // posição do mandante (evidência da fraqueza)
};

// ─── detectZebras ────────────────────────────────────────────────────────────

/**
 * Analisa uma lista de jogos e retorna os que têm potencial de zebra.
 * Retorna ordenado por zebraScore decrescente.
 *
 * @param matches - Lista de partidas normalizadas (MatchInput[])
 * @param maxResults - Máximo de zebras retornadas (padrão: 3)
 */
export function detectZebras(
  matches: MatchInput[],
  maxResults = 3,
): ZebraOpportunity[] {
  const opportunities: ZebraOpportunity[] = [];

  for (const m of matches) {
    // ── Pré-requisito estrutural ──────────────────────────────────────────
    // Visitante forte (top 6) jogando contra mandante fraco (bottom 6)
    const isAwayStrong = m.awayPosition <= 6;
    const isHomeWeak   = m.homePosition >= 15;

    if (!isAwayStrong || !isHomeWeak) continue;

    // ── Verificar condições favoráveis para zebra ─────────────────────────
    const reasons: string[] = [];
    let score = 30; // base: estrutura de zebra já vale 30pts

    // Mandante forte em casa
    if (m.homeHomePoints >= 9) {
      reasons.push(`${m.homeTeam} é difícil de bater em casa (${m.homeHomePoints} pontos nos últimos 5 jogos em casa)`);
      score += 20;
    } else if (m.homeHomePoints >= 7) {
      reasons.push(`${m.homeTeam} tem razoável desempenho em casa (${m.homeHomePoints} pts)`);
      score += 10;
    }

    // Copa/Libertadores na semana do visitante
    if (m.awayCupCompetition && m.awayCupCompetition !== "none") {
      const cupName: Record<string, string> = {
        "libertadores": "Libertadores",
        "copa-br":      "Copa do Brasil",
        "sulamericana": "Sulamericana",
      };
      reasons.push(`${m.awayTeam} joga ${cupName[m.awayCupCompetition] ?? m.awayCupCompetition} na mesma semana — rotação provável`);
      score += m.awayCupCompetition === "libertadores" ? 25 : 15;
    }

    // Desfalques acima de 20%
    if (m.awayAbsenceRate > 0.20) {
      reasons.push(`${m.awayTeam} com ${Math.round(m.awayAbsenceRate * 100)}% do elenco indisponível`);
      score += 15;
    }

    // Forma ruim fora de casa
    const awayWins = m.awayForm.filter((r) => r === "W").length;
    if (awayWins <= 1) {
      reasons.push(`${m.awayTeam} venceu apenas ${awayWins} dos últimos 5 jogos (forma ruim)`);
      score += 15;
    }

    // Calendário saturado do visitante
    if (m.awayBigGameAhead) {
      reasons.push(`${m.awayTeam} tem jogo decisivo nos próximos dias — pode poupar titulares`);
      score += 10;
    }

    // Mandante com urgência de resultado extra
    if (m.homeNeedsWin) {
      reasons.push(`${m.homeTeam} PRECISA vencer — motivação máxima em casa`);
      score += 10;
    }

    // Odd do mandante confirma ineficiência do mercado (odd alta = mercado não acredita)
    if (m.homeOdd > 2.80) {
      reasons.push(`Mercado não acredita no mandante (odd ${m.homeOdd.toFixed(2)}) — value potencial`);
      score += 5;
    }

    // Precisa de pelo menos 2 condições além do pré-requisito estrutural
    if (reasons.length < 2) continue;

    opportunities.push({
      matchId:      m.id,
      match:        m.match,
      homeTeam:     m.homeTeam,
      awayTeam:     m.awayTeam,
      zebraScore:   Math.min(100, score),
      reasons,
      homeOdd:      m.homeOdd,
      awayPosition: m.awayPosition,
      homePosition: m.homePosition,
    });
  }

  return opportunities
    .sort((a, b) => b.zebraScore - a.zebraScore)
    .slice(0, maxResults);
}
