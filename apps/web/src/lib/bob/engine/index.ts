/**
 * BOB Engine — barrel de exportações
 *
 * Importar por: import { scoreMatch, selectAnchors, generateVariations } from "@/lib/bob/engine"
 */

export { scoreMatch, selectAnchors } from "./scoring";
export type { MatchInput, ScoredMatch } from "./scoring";

export { generateVariations } from "./variations";
export type { VariationInput } from "./variations";

export { backtestRound, backtestSeason, backtestFormWindow } from "./backtest";
export type { FactorAccuracy, BacktestRoundResult, BacktestSeasonResult, FormWindowComparison } from "./backtest";

export { forensicAnalysis } from "./forensic";
export type { FactorContribution, ForensicReport } from "./forensic";

export { selfCalibrate, selfCalibrateMultiRound, DEFAULT_WEIGHTS } from "./calibrator";
export type { FactorWeights, CalibrationResult } from "./calibrator";

export { discoverAntiCorrelations, getActiveAntiCorrelations } from "./anti-correlation";
export type { AntiCorrPattern, AntiCorrAnalysisResult } from "./anti-correlation";
