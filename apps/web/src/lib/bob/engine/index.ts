/**
 * BOB Engine — barrel de exportações
 *
 * Importar por: import { scoreMatch, selectAnchors, generateVariations } from "@/lib/bob/engine"
 */

export { scoreMatch, selectAnchors, selectAnchorsFromScored } from "./scoring";
export type { MatchInput, ScoredMatch } from "./scoring";

export { selectAnchorsV2 } from "./anchor-score";
export type { AnchorSelectionResult, AnchorCandidate } from "./anchor-score";

// ─── Variações: beam-search (robusto, anti-duplicatas) ────────────────────────
// Wrapper de compatibilidade para manter API antiga ({ anchors, pool })
// enquanto usa beam-search internamente (mais robusto)

import type { AnchorSelectionResult } from "./anchor-score";
import type { MatchInput } from "./scoring";
import type { ScoredMatch } from "./scoring";
import { generateVariations as generateVariationsBeam } from "./beam-search";
import type { VariationsResult } from "./beam-search";
export type { VariationsResult, Variation, TicketLeg, PickOutcome } from "./beam-search";

/** Tipo legado para compatibilidade (formato antigo variations.ts) */
export type VariationInput = {
  /** Até 4 âncoras retornadas por selectAnchors() */
  anchors: ScoredMatch[];
  /** Demais jogos da rodada já pontuados (não-âncoras) */
  pool: ScoredMatch[];
};

/**
 * Gera 5 variações (V1–V5) usando beam search robusto.
 * 
 * MANTÉM COMPATIBILIDADE com API antiga: aceita { anchors, pool }
 * Internamente converte para formato do beam-search e executa algoritmo anti-duplicata.
 * 
 * @param input — { anchors, pool } no formato legado ou AnchorSelectionResult
 * @returns — VariationsResult com 5 variações validadas
 */
export function generateVariations(
  input: VariationInput | AnchorSelectionResult,
  poolOrMatches?: ScoredMatch[] | MatchInput[],
  options?: { targetOdd?: number; beamWidth?: number }
): VariationsResult {
  // Detectar formato de entrada
  const isLegacyFormat = "pool" in input && !("meta" in input);
  
  if (isLegacyFormat) {
    // Formato legado: { anchors, pool }
    const { anchors, pool } = input as VariationInput;
    
    // Converter para AnchorSelectionResult (formato esperado por beam-search)
    const anchorResult: AnchorSelectionResult = {
      anchors: anchors as any[], // AnchorCandidate[] compatível
      allRanked: [...anchors, ...pool] as any[],
      meta: {
        round: null,
        totalMatches: anchors.length + pool.length,
        anchorCount: anchors.length,
        selectionMode: "primary",
        formulaWeights: {} as any,
        generatedAt: new Date().toISOString(),
      },
    };
    
    // Chamar beam-search com todos os matches
    const allMatches = [...anchors, ...pool] as MatchInput[];
    return generateVariationsBeam(anchorResult, allMatches, options);
  }
  
  // Formato novo: AnchorSelectionResult
  const anchorResult = input as AnchorSelectionResult;
  const allMatches = (poolOrMatches || anchorResult.allRanked) as MatchInput[];
  return generateVariationsBeam(anchorResult, allMatches, options);
}

export { backtestRound, backtestSeason, backtestFormWindow } from "./backtest";
export type { FactorAccuracy, BacktestRoundResult, BacktestSeasonResult, FormWindowComparison } from "./backtest";

export { forensicAnalysis } from "./forensic";
export type { FactorContribution, ForensicReport } from "./forensic";

export { selfCalibrate, selfCalibrateMultiRound, DEFAULT_WEIGHTS } from "./calibrator";
export type { FactorWeights, CalibrationResult } from "./calibrator";

export { discoverAntiCorrelations, getActiveAntiCorrelations } from "./anti-correlation";
export type { AntiCorrPattern, AntiCorrAnalysisResult } from "./anti-correlation";
