/**
 * BOB — Análise Forense de Picks
 *
 * Diagnóstico detalhado de um pick específico: o que o motor viu,
 * quais fatores influenciaram, quanto cada um pesou, e por que
 * o motor acertou ou errou.
 *
 * Lê dados do banco de dados — sem chamadas de API extras.
 * Requer que o pick tenha `fixtureId` preenchido e, idealmente,
 * `actualResult` + `correct` para diagnóstico completo.
 */

import { prisma } from "@/lib/db";

// ─── Tipos exportados ─────────────────────────────────────────────────────────

/** Contribuição de um fator do motor ao pick */
export type FactorContribution = {
  factor: string;      // ex: "tableContext"
  weight: number;      // peso configurado no motor (0–20+)
  mentioned: boolean;  // o motor gerou um reason para este fator?
  reasoning: string;   // texto exato do reason, ou string vazia se não mencionado
};

/** Relatório forense completo de um pick */
export type ForensicReport = {
  fixtureId: string;
  match: string;       // "Flamengo x Palmeiras"
  season: number;
  round: number;
  predictedResult: string;     // "HOME" | "DRAW" | "AWAY"
  actualResult: string | null; // null = ainda não registrado
  correct: boolean | null;
  motorScore: number;          // score 0–100 calculado pelo motor (do anchor)
  isAnchor: boolean;           // este pick era um pick âncora?
  isClassico: boolean;         // clássico regional foi detectado?
  factorContributions: FactorContribution[]; // um item por fator do motor
  primaryReasons: string[];   // principais reasons do motor (até 3)
  verdict: string;             // resumo textual do diagnóstico
};

// ─── Constantes (espelham scoring.ts) ────────────────────────────────────────

/** Pesos dos fatores — espelho de WEIGHTS em scoring.ts. Manter sincronizado. */
const WEIGHTS_MIRROR: Record<string, number> = {
  tableContext: 14,
  recentForm:   10,
  momentum:      7,
  homeAway:     11,
  goalsXg:      16,
  h2h:           8,
  absences:     14,
  calendar:      8,
  market:        9,
  motivation:    3,
};

/**
 * Palavras-chave para mapear reasons gerados por scoreMatch() a fatores.
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

/** Retorna o texto do reason que contém uma das keywords do fator, ou undefined */
function findReason(reasons: string[], factor: string): string | undefined {
  const keywords = FACTOR_KEYWORDS[factor] ?? [];
  return reasons.find((r) => keywords.some((kw) => r.includes(kw)));
}

// ─── forensicAnalysis ──────────────────────────────────────────────────────────

/**
 * Retorna análise forense de um pick pelo fixtureId da API-Football.
 *
 * O pick é localizado pelo campo `fixture_id` na tabela picks.
 * O anchor correspondente é encontrado pelo nome do jogo (match) na
 * mesma rodada, para obter o score e os reasons do motor.
 *
 * Retorna null se o pick não for encontrado no banco.
 *
 * @param fixtureId - ID numérico da fixture na API-Football, como string
 */
export async function forensicAnalysis(fixtureId: string): Promise<ForensicReport | null> {
  // 1. Localizar o pick (com cadeia variation → round → season → anchors)
  const pick = await prisma.pick.findFirst({
    where: { fixtureId },
    include: {
      variation: {
        include: {
          round: {
            include: {
              season:  true,
              anchors: true,
            },
          },
        },
      },
    },
  });

  if (!pick) return null;

  const round  = pick.variation.round;
  const season = round.season;

  // 2. Encontrar o anchor correspondente pelo match name
  const matchingAnchor = round.anchors.find(
    (a) => `${a.team} x ${a.opponent}` === pick.match,
  );

  const reasons: string[] = Array.isArray(matchingAnchor?.reasons)
    ? (matchingAnchor?.reasons as string[])
    : [];

  const motorScore     = matchingAnchor?.score ?? 0;
  const isClassico     = reasons.some((r) => r.includes("Clássico regional"));

  // 3. Construir FactorContribution[] — um item por fator, ordenado por peso desc
  const factorContributions: FactorContribution[] = Object.entries(WEIGHTS_MIRROR)
    .map(([factor, weight]) => {
      const matchedReason = findReason(reasons, factor);
      return {
        factor,
        weight,
        mentioned: !!matchedReason,
        reasoning: matchedReason ?? "",
      };
    })
    .sort((a, b) => {
      // Fatores mencionados primeiro, depois por peso descendente
      if (a.mentioned !== b.mentioned) return a.mentioned ? -1 : 1;
      return b.weight - a.weight;
    });

  // 4. Gerar veredicto textual
  const correct        = pick.correct;
  const predictedResult = pick.result;
  const actualResult   = pick.actualResult;

  let verdict: string;

  if (correct === null) {
    verdict =
      "Resultado ainda não registrado. Execute markPickResult() para diagnóstico completo.";
  } else if (correct) {
    const topReason = reasons[0] ?? "combinação de fatores";
    verdict = `Acerto — Motor identificou corretamente. Fator decisivo: "${topReason}".`;
  } else {
    const mentionedFactors = factorContributions
      .filter((f) => f.mentioned)
      .map((f) => f.factor)
      .slice(0, 2)
      .join(" + ");

    if (isClassico) {
      verdict = `Erro — Clássico regional com volatilidade estrutural. RN05 deveria ter bloqueado este pick. Predito: ${predictedResult}. Real: ${actualResult ?? "?"}`;
    } else {
      verdict = `Erro — Predito ${predictedResult}, resultado real ${actualResult ?? "?"}. Fatores que puxaram a predição: ${mentionedFactors || "não identificados"}.`;
    }
  }

  return {
    fixtureId,
    match:           pick.match,
    season:          season.year,
    round:           round.number,
    predictedResult: pick.result,
    actualResult:    pick.actualResult,
    correct:         pick.correct,
    motorScore,
    isAnchor:        pick.isAnchor,
    isClassico,
    factorContributions,
    primaryReasons:  reasons.slice(0, 3),
    verdict,
  };
}
