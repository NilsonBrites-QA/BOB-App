/**
 * BOB — Backtesting Engine
 *
 * Analisa rodadas históricas para medir acurácia do motor por fator,
 * permitindo calibração científica dos pesos.
 *
 * Tudo baseado em dados já persistidos no banco — sem chamadas de API extras.
 * Sem risco de data leakage: as predições foram feitas antes dos resultados.
 *
 * Funções exportadas:
 *   backtestRound()      — acurácia de uma rodada específica (DB-only)
 *   backtestSeason()     — agrega múltiplas rodadas de uma temporada
 *   backtestFormWindow() — valida qual janela de forma performa melhor (sem DB)
 */

import { prisma } from "@/lib/db";
import type { MatchInput } from "@/lib/bob/engine/scoring";
import { scoreMatch } from "@/lib/bob/engine/scoring";

// ─── Tipos exportados ─────────────────────────────────────────────────────────

/** Acurácia de um fator específico do motor de scoring */
export type FactorAccuracy = {
  factor: string;    // ex: "tableContext"
  mentioned: number; // em quantos picks (âncora) este fator apareceu nos reasons
  correct: number;   // destes, quantos picks acertaram
  accuracy: number;  // correct / mentioned (0–1)
};

/** Resultado do backtest de uma única rodada */
export type BacktestRoundResult = {
  season: number;
  round: number;
  totalPicks: number;    // picks com actualResult registrado
  correctPicks: number;
  accuracy: number;      // 0–1
  anchorAccuracy: number; // acurácia apenas nos picks marcados como âncora
  factorAccuracy: FactorAccuracy[];
};

/** Resultado agregado de múltiplas rodadas de uma temporada */
export type BacktestSeasonResult = {
  season: number;
  rounds: BacktestRoundResult[];
  totalPicks: number;
  correctPicks: number;
  overallAccuracy: number;
  anchorAccuracy: number;
  factorAccuracy: FactorAccuracy[]; // agregado por temporada, ordenado por acurácia
};

/** Comparação de acurácia do motor para diferentes tamanhos de janela de forma */
export type FormWindowComparison = {
  window: number;      // tamanho da janela testada (ex: 5, 7, 10, 15)
  totalMatches: number;
  averageScore: number; // score médio de todos os jogos da amostra
  anchorCount: number;  // quantos resultaram em âncoras candidatas
};

// ─── Mapeamento de reasons → fatores ──────────────────────────────────────────

/**
 * Palavras-chave para mapear each reason gerado por scoreMatch()
 * ao fator do motor que o originou.
 * Espelho exato dos textos em scoring.ts — manter sincronizado.
 */
const FACTOR_KEYWORDS: Record<string, string[]> = {
  tableContext: ["Posição na tabela", "urgência de resultado"],
  recentForm:   ["Forma recente", "má fase"],
  momentum:     ["trajetória ascendente", "queda de rendimento", "sequência de queda"],
  homeAway:     ["forte em casa", "rendimento fora de casa"],
  goalsXg:      ["Produção ofensiva", "desequilíbrio gols", "gols nos últimos 5"],
  h2h:          ["Histórico de confrontos"],
  absences:     ["elenco indisponível", "desfalques"],
  calendar:     ["poupar titulares", "desgaste de calendário"],
  market:       ["Mercado precifica", "Odd do mandante em queda"],
  motivation:   ["situação crítica", "motivação máxima", "brigando por G4/Libertadores"],
};

/** Mapeia reasons[] para os nomes dos fatores que os originaram */
function inferFactors(reasons: unknown): string[] {
  if (!Array.isArray(reasons)) return [];
  const factors: string[] = [];
  for (const reason of reasons as string[]) {
    if (typeof reason !== "string") continue;
    for (const [factor, keywords] of Object.entries(FACTOR_KEYWORDS)) {
      if (keywords.some((kw) => reason.includes(kw))) {
        factors.push(factor);
        break; // cada reason mapeia para no máximo um fator
      }
    }
  }
  return factors;
}

// ─── backtestRound ────────────────────────────────────────────────────────────

/**
 * Analisa uma rodada específica e retorna métricas de acurácia por fator.
 *
 * Lê exclusivamente o banco de dados — zero chamadas de API.
 * Requer que os picks tenham `actualResult` e `correct` preenchidos
 * (via markPickResult() no painel admin pós-rodada).
 *
 * Retorna null se a rodada não existir no banco ou não tiver resultados.
 */
export async function backtestRound(
  season: number,
  round: number,
): Promise<BacktestRoundResult | null> {
  // 1. Buscar a rodada com anchors e picks
  const roundDb = await prisma.round.findFirst({
    where: {
      number: round,
      season: { year: season },
    },
    include: {
      anchors: true,
      variations: {
        include: { picks: true },
      },
    },
  });

  if (!roundDb) return null;

  // 2. Flattening de picks com resultado registrado
  const allPicks = roundDb.variations.flatMap((v) =>
    v.picks.filter((p) => p.correct !== null),
  );
  if (allPicks.length === 0) return null;

  // 3. Mapa: match name → reasons do anchor correspondente
  const anchorReasonsByMatch = new Map<string, unknown[]>();
  for (const anchor of roundDb.anchors) {
    const matchKey = `${anchor.team} x ${anchor.opponent}`;
    const reasons = Array.isArray(anchor.reasons) ? anchor.reasons : [];
    anchorReasonsByMatch.set(matchKey, reasons);
  }

  // 4. Acumuladores
  let correctTotal = 0;
  let anchorTotal = 0;
  let anchorCorrect = 0;
  const factorStats: Record<string, { mentioned: number; correct: number }> = {};

  for (const pick of allPicks) {
    if (pick.correct) correctTotal++;

    if (pick.isAnchor) {
      anchorTotal++;
      if (pick.correct) anchorCorrect++;

      // Inferir fatores a partir dos reasons do anchor correspondente
      const reasons = anchorReasonsByMatch.get(pick.match) ?? [];
      const factors = inferFactors(reasons);
      for (const factor of factors) {
        if (!factorStats[factor]) factorStats[factor] = { mentioned: 0, correct: 0 };
        factorStats[factor].mentioned++;
        if (pick.correct) factorStats[factor].correct++;
      }
    }
  }

  // 5. Montar FactorAccuracy[] ordenado do mais acurado para menos
  const factorAccuracy: FactorAccuracy[] = Object.entries(factorStats)
    .map(([factor, stats]) => ({
      factor,
      mentioned: stats.mentioned,
      correct:   stats.correct,
      accuracy:  stats.mentioned > 0 ? stats.correct / stats.mentioned : 0,
    }))
    .sort((a, b) => b.accuracy - a.accuracy);

  return {
    season,
    round,
    totalPicks:    allPicks.length,
    correctPicks:  correctTotal,
    accuracy:      correctTotal / allPicks.length,
    anchorAccuracy: anchorTotal > 0 ? anchorCorrect / anchorTotal : 0,
    factorAccuracy,
  };
}

// ─── backtestSeason ───────────────────────────────────────────────────────────

/**
 * Executa backtestRound() para um intervalo de rodadas e agrega os resultados.
 *
 * @param season - Ano da temporada (ex: 2025)
 * @param from   - Rodada inicial (inclusive)
 * @param to     - Rodada final (inclusive)
 */
export async function backtestSeason(
  season: number,
  from: number,
  to: number,
): Promise<BacktestSeasonResult> {
  // Executar em série para não saturar o pool de conexões do BD
  const rounds: BacktestRoundResult[] = [];
  for (let round = from; round <= to; round++) {
    const result = await backtestRound(season, round);
    if (result) rounds.push(result);
  }

  // Totais globais
  const totalPicks    = rounds.reduce((s, r) => s + r.totalPicks, 0);
  const correctPicks  = rounds.reduce((s, r) => s + r.correctPicks, 0);

  // anchorAccuracy como média ponderada das rodadas que tiveram âncoras
  const roundsWithAnchors = rounds.filter((r) => r.anchorAccuracy > 0);
  const anchorAccuracy =
    roundsWithAnchors.length > 0
      ? roundsWithAnchors.reduce((s, r) => s + r.anchorAccuracy, 0) / roundsWithAnchors.length
      : 0;

  // Agregar FactorAccuracy por temporada completa
  const aggregated: Record<string, { mentioned: number; correct: number }> = {};
  for (const round of rounds) {
    for (const fa of round.factorAccuracy) {
      if (!aggregated[fa.factor]) aggregated[fa.factor] = { mentioned: 0, correct: 0 };
      aggregated[fa.factor].mentioned += fa.mentioned;
      aggregated[fa.factor].correct   += fa.correct;
    }
  }

  const factorAccuracy: FactorAccuracy[] = Object.entries(aggregated)
    .map(([factor, stats]) => ({
      factor,
      mentioned: stats.mentioned,
      correct:   stats.correct,
      accuracy:  stats.mentioned > 0 ? stats.correct / stats.mentioned : 0,
    }))
    .sort((a, b) => b.accuracy - a.accuracy);

  return {
    season,
    rounds,
    totalPicks,
    correctPicks,
    overallAccuracy: totalPicks > 0 ? correctPicks / totalPicks : 0,
    anchorAccuracy,
    factorAccuracy,
  };
}

// ─── backtestFormWindow ───────────────────────────────────────────────────────

/**
 * Compara o comportamento do motor com diferentes tamanhos de janela de forma.
 *
 * Valida cientificamente o insight Camillo: janela de 10 jogos performa
 * melhor do que 5, 7 ou 15 para identificar âncoras.
 *
 * NÃO usa o banco de dados — recebe MatchInput[] com homeForm10/awayForm10
 * já preenchidos (ex: da etapa de normalização pré-jogo) e re-pontua
 * cada jogo fatiando a forma para cada janela.
 *
 * @param matchInputs - Partidas com homeForm10 e awayForm10 preenchidos
 * @param windows     - Tamanhos de janela a comparar (padrão: [5, 7, 10, 15])
 */
export function backtestFormWindow(
  matchInputs: MatchInput[],
  windows: number[] = [5, 7, 10, 15],
): FormWindowComparison[] {
  return windows.map((n) => {
    const rescored = matchInputs.map((m) => {
      // Fatiar a forma para a janela n (homeForm10 tem até 10 elementos)
      const homeFormN = (m.homeForm10 ?? m.homeForm).slice(0, n);
      const awayFormN = (m.awayForm10 ?? m.awayForm).slice(0, n);

      const rescaledInput: MatchInput = {
        ...m,
        homeForm:     homeFormN.slice(0, 5),  // forma curta = primeiros 5 do window
        awayForm:     awayFormN.slice(0, 5),
        homeForm10:   homeFormN,
        awayForm10:   awayFormN,
        homeMomentum: computeMomentum(homeFormN),
        awayMomentum: computeMomentum(awayFormN),
      };

      return scoreMatch(rescaledInput);
    });

    const anchorCount  = rescored.filter((m) => m.isAnchorCandidate).length;
    const totalScore   = rescored.reduce((s, m) => s + m.score, 0);
    const averageScore = rescored.length > 0 ? totalScore / rescored.length : 0;

    return {
      window:       n,
      totalMatches: matchInputs.length,
      averageScore: Math.round(averageScore * 10) / 10,
      anchorCount,
    };
  });
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

/** Recalcula momentum para um array de forma de tamanho n */
function computeMomentum(form: string[]): number {
  const form5 = form.slice(0, 5);
  const older  = form.slice(5);
  if (form5.length === 0 || older.length === 0) return 0;
  const recentPpg = formPoints(form5) / form5.length;
  const olderPpg  = formPoints(older) / older.length;
  return Math.max(-1, Math.min(1, (recentPpg - olderPpg) / 3));
}

/** Soma de pontos de uma sequência de resultados (W=3, D=1, L=0) */
function formPoints(form: string[]): number {
  return form.reduce((acc, r) => acc + (r === "W" ? 3 : r === "D" ? 1 : 0), 0);
}
