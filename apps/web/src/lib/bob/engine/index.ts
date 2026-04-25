/**
 * BOB Engine — barrel de exportações
 *
 * Importar por: import { scoreMatch, selectAnchors, generateVariations } from "@/lib/bob/engine"
 */

export { scoreMatch, selectAnchors, selectAnchorsFromScored } from "./scoring";
export type { MatchInput, ScoredMatch } from "./scoring";

export { selectAnchorsV2 } from "./anchor-score";
export type { AnchorSelectionResult, AnchorCandidate } from "./anchor-score";

// ─── Variações: variations.ts (com min 5 jogos + odd 900) ───────────────────
// Usa variations.ts corrigido (RN Big Odds) em vez de beam-search.ts

import type { AnchorSelectionResult } from "./anchor-score";
import type { MatchInput } from "./scoring";
import type { ScoredMatch } from "./scoring";
import { generateVariations as generateVariationsCore } from "./variations";
import type { VariationInput as CoreVariationInput } from "./variations";

// Tipos de compatibilidade (de ./types.ts)
import type { Variation, VariationPick } from "../types";
export type { Variation, VariationPick };

/** Tipo legado para compatibilidade (formato antigo variations.ts) */
export type VariationInput = {
  /** Até 4 âncoras retornadas por selectAnchores() */
  anchors: ScoredMatch[];
  /** Demais jogos da rodada já pontuados (não-âncoras) */
  pool: ScoredMatch[];
};

// Tipos compatíveis para exportação (mapeamento de variations.ts → beam-search.ts)
export type TicketLeg = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  pickOutcome: "Home" | "Draw" | "Away";
  pickOdd: number;
  fairOdd: number;
  cleanProb: number;
  isAnchor: boolean;
  isMarginal?: boolean;
};

export type VariationsResult = {
  variations: Array<{
    id: "V1" | "V2" | "V3" | "V4" | "V5";
    combinedOdd: number;
    logCombinedOdd: number;
    probabilityMass: number;
    logProbabilityMass: number;
    legCount: number;
    anchorPrimaryCount: number;
    legs: TicketLeg[];
    transparencyNotes?: string[];
  }>;
};

export type PickOutcome = "Home" | "Draw" | "Away";

/**
 * Gera 5 variações (V1–V5) com garantia de mínimo 5 jogos e odd 900+.
 * 
 * REGRAS DE OURO (Big Odds — RN do Camillo):
 *   1. Mínimo 5 jogos por variação (sempre)
 *   2. Odd combinada mínima 900x (sempre)
 *   3. Sem máximo de odd — quanto maior, melhor desde que coerente
 */
export function generateVariations(
  input: VariationInput | AnchorSelectionResult,
  _poolOrMatches?: ScoredMatch[] | MatchInput[],
  _options?: { targetOdd?: number; beamWidth?: number }
): VariationsResult {
  // Detectar formato de entrada
  const isLegacyFormat = "pool" in input && !("meta" in input);
  
  let anchors: ScoredMatch[];
  let pool: ScoredMatch[];
  
  if (isLegacyFormat) {
    const legado = input as VariationInput;
    anchors = legado.anchors;
    pool = legado.pool;
  } else {
    // Formato novo: AnchorSelectionResult
    const anchorResult = input as AnchorSelectionResult;
    anchors = anchorResult.anchors as ScoredMatch[];
    pool = anchorResult.allRanked.filter(
      (m) => !anchorResult.anchors.some((a) => (a as ScoredMatch).id === (m as ScoredMatch).id)
    ) as ScoredMatch[];
  }
  
  // Chamar variations.ts (com min 5 jogos + odd 900)
  const coreResult = generateVariationsCore({ anchors, pool });
  
  // Converter para formato VariationsResult (compatível com beam-search)
  const variations: VariationsResult["variations"] = coreResult.map((v) => {
    const probMass = v.picks.reduce((acc, p) => acc * (1 / p.odd), 1);
    const logCombinedOdd = Math.log(v.projectedOdd);
    return {
    id: v.id as "V1" | "V2" | "V3" | "V4" | "V5",
    combinedOdd: v.projectedOdd,
    logCombinedOdd,
    probabilityMass: probMass,
    logProbabilityMass: Math.log(probMass || 1e-10),
    legCount: v.picks.length,
    anchorPrimaryCount: v.picks.filter((p) => p.isAnchor).length,
    legs: v.picks.map((p) => ({
      matchId: p.fixtureId ?? "",
      homeTeam: (p.match || "").split(" x ")[0] || p.match || "",
      awayTeam: (p.match || "").split(" x ")[1] || "",
      pickOutcome: (p.result === "1" ? "Home" : p.result === "2" ? "Away" : "Draw") as PickOutcome,
      pickOdd: p.odd,
      fairOdd: p.odd,
      cleanProb: 1 / p.odd,
      isAnchor: p.isAnchor ?? false,
      isMarginal: (p as any).isMarginal ?? false,
    })),
    transparencyNotes: v.picks.filter((p) => (p as any).warning).map((p) => (p as any).warning),
    };
  });
  
  return { variations };
}

export { backtestRound, backtestSeason, backtestFormWindow } from "./backtest";
export type { FactorAccuracy, BacktestRoundResult, BacktestSeasonResult, FormWindowComparison } from "./backtest";

export { forensicAnalysis } from "./forensic";
export type { FactorContribution, ForensicReport } from "./forensic";

export { selfCalibrate, selfCalibrateMultiRound, DEFAULT_WEIGHTS } from "./calibrator";
export type { FactorWeights, CalibrationResult } from "./calibrator";

export { discoverAntiCorrelations, getActiveAntiCorrelations } from "./anti-correlation";
export type { AntiCorrPattern, AntiCorrAnalysisResult } from "./anti-correlation";
