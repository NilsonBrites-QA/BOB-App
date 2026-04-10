/**
 * BOB — Anti-Correlation Discovery (ABQC 12.6)
 *
 * Identifica combinações de fatores que sistematicamente erram,
 * mesmo quando individualmente cada fator parece forte.
 *
 * Exemplo clássico de anti-correlação:
 *   "tableContext ALTO + absences ALTO" → pick âncora erra 80% das vezes
 *   (time favorito na tabela mas sem seus titulares → armadilha frequente)
 *
 * Como funciona:
 *   1. Percorre picks com resultado registrado no banco
 *   2. Para cada pick, extrai os fatores mencionados pelo motor (via reasons)
 *   3. Gera combinações de 2 fatores (pares) presentes no mesmo pick
 *   4. Acumula estatísticas por par: quantas vezes apareceu, quantas acertou
 *   5. Pares com acurácia < ANTI_CORR_THRESHOLD e ≥ MIN_OCCURRENCES viram padrões
 *   6. Salva/atualiza na tabela conditional_patterns
 *
 * Os padrões descobertos são usados em:
 *   - selfCalibrate() (fase futura): penalizar picks com anti-correlação ativa
 *   - forensicAnalysis(): destacar se o pick foi vítima de anti-padrão
 */

import { prisma } from "@/lib/db";

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Padrão de anti-correlação identificado */
export type AntiCorrPattern = {
  factors:     string[];    // ex: ["tableContext", "absences"]
  condition:   string;      // ex: "tableContext + absences simultâneos"
  occurrences: number;
  correct:     number;
  accuracy:    number;      // 0–1
  isAntiCorr:  boolean;     // accuracy < ANTI_CORR_THRESHOLD
};

/** Resultado da análise semanal */
export type AntiCorrAnalysisResult = {
  pairsAnalyzed:   number;
  antiCorrFound:   number;   // novos padrões marcados como anti-correlação
  updatedPatterns: number;   // padrões existentes atualizados
  newPatterns:     number;   // padrões inseridos pela primeira vez
  season:          number;
  round:           number;   // rodada mais recente analisada
};

// ─── Constantes ───────────────────────────────────────────────────────────────

/**
 * Acurácia abaixo desta → padrão marcado como anti-correlação.
 * 0.40 = par de fatores acerta menos de 40% — pior que um chute aleatório (33%)
 * com margem de segurança.
 */
const ANTI_CORR_THRESHOLD = 0.40;

/** Mínimo de ocorrências para considerar o par estatisticamente relevante */
const MIN_OCCURRENCES = 4;

/**
 * Palavras-chave para mapear reasons → fatores.
 * Espelho exato de FACTOR_KEYWORDS em backtest.ts e forensic.ts.
 * Manter sincronizado com scoring.ts.
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

// ─── discoverAntiCorrelations ──────────────────────────────────────────────────

/**
 * Analisa os picks de um season/round recente e atualiza a tabela
 * conditional_patterns com padrões de anti-correlação descobertos.
 *
 * Deve ser chamado após cada rodada ser fechada (CLOSED).
 * É idempotente: rodar duas vezes na mesma rodada não duplica dados.
 *
 * @param season - Ano da temporada a analisar
 * @param round  - Rodada mais recente a incluir
 * @param lookback - Quantas rodadas anteriores incluir (padrão: 10 — ~2 meses)
 */
export async function discoverAntiCorrelations(
  season: number,
  round: number,
  lookback = 10,
): Promise<AntiCorrAnalysisResult> {
  // 1. Buscar picks com resultado registrado do período
  const fromRound = Math.max(1, round - lookback + 1);

  const picks = await prisma.pick.findMany({
    where: {
      correct: { not: null },
      isAnchor: true, // focar nos picks âncora — são os que o motor mais "confia"
      variation: {
        round: {
          number: { gte: fromRound, lte: round },
          season: { year: season },
        },
      },
    },
    include: {
      variation: {
        include: {
          round: {
            include: { anchors: true },
          },
        },
      },
    },
  });

  if (picks.length === 0) {
    return {
      pairsAnalyzed:   0,
      antiCorrFound:   0,
      updatedPatterns: 0,
      newPatterns:     0,
      season,
      round,
    };
  }

  // 2. Para cada pick, extrair fatores e acumular estatísticas por par
  const pairStats = new Map<string, { factors: string[]; hits: number; total: number }>();

  for (const pick of picks) {
    // Encontrar o anchor correspondente pelo match name
    const anchor = pick.variation.round.anchors.find(
      (a) => `${a.team} x ${a.opponent}` === pick.match,
    );
    if (!anchor) continue;

    const reasons = Array.isArray(anchor.reasons) ? (anchor.reasons as string[]) : [];
    const factors = inferFactors(reasons);

    // Gerar pares (combinações de 2 fatores)
    const pairs = combinePairs(factors);
    for (const pair of pairs) {
      const key = pair.join("|");
      const existing = pairStats.get(key) ?? { factors: pair, hits: 0, total: 0 };
      existing.total++;
      if (pick.correct) existing.hits++;
      pairStats.set(key, existing);
    }
  }

  // 3. Filtrar pares com evidência suficiente
  let antiCorrFound   = 0;
  let updatedPatterns = 0;
  let newPatterns     = 0;

  for (const [, stats] of pairStats) {
    if (stats.total < MIN_OCCURRENCES) continue;

    const accuracy   = stats.hits / stats.total;
    const isAntiCorr = accuracy < ANTI_CORR_THRESHOLD;
    const patternKey = stats.factors.slice().sort().join("|"); // canônico
    const condition  = `${stats.factors.join(" + ")} simultâneos em pick âncora`;

    // Upsert no banco
    const existing = await prisma.conditionalPattern.findUnique({
      where: { patternKey },
    });

    if (existing) {
      await prisma.conditionalPattern.update({
        where: { patternKey },
        data: {
          occurrences:    stats.total,
          correct:        stats.hits,
          isAntiCorr,
          lastSeenRound:  round,
          lastSeenSeason: season,
        },
      });
      updatedPatterns++;
    } else {
      await prisma.conditionalPattern.create({
        data: {
          patternKey,
          factors:        stats.factors,
          condition,
          occurrences:    stats.total,
          correct:        stats.hits,
          isAntiCorr,
          lastSeenRound:  round,
          lastSeenSeason: season,
        },
      });
      newPatterns++;
    }

    if (isAntiCorr) antiCorrFound++;
  }

  return {
    pairsAnalyzed:   pairStats.size,
    antiCorrFound,
    updatedPatterns,
    newPatterns,
    season,
    round,
  };
}

// ─── getActiveAntiCorrelations ────────────────────────────────────────────────

/**
 * Retorna padrões de anti-correlação ativos (não suprimidos manualmente).
 * Usado pelo painel admin e futuramente pelo motor para penalizar picks.
 */
export async function getActiveAntiCorrelations(): Promise<AntiCorrPattern[]> {
  const patterns = await prisma.conditionalPattern.findMany({
    where:   { isAntiCorr: true, isSuppressed: false },
    orderBy: { occurrences: "desc" },
  });

  return patterns.map((p) => ({
    factors:     p.factors,
    condition:   p.condition,
    occurrences: p.occurrences,
    correct:     p.correct,
    accuracy:    p.occurrences > 0 ? p.correct / p.occurrences : 0,
    isAntiCorr:  p.isAntiCorr,
  }));
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

/** Mapeia reasons[] para os nomes dos fatores que os originaram */
function inferFactors(reasons: string[]): string[] {
  const factors: string[] = [];
  for (const reason of reasons) {
    if (typeof reason !== "string") continue;
    for (const [factor, keywords] of Object.entries(FACTOR_KEYWORDS)) {
      if (keywords.some((kw) => reason.includes(kw))) {
        factors.push(factor);
        break;
      }
    }
  }
  // Remover duplicatas
  return [...new Set(factors)];
}

/** Gera todas as combinações de 2 elementos de um array (sem repetição de ordem) */
function combinePairs(items: string[]): string[][] {
  const pairs: string[][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      pairs.push([items[i]!, items[j]!]);
    }
  }
  return pairs;
}
