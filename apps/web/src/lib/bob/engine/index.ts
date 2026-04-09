/**
 * BOB Engine — barrel de exportações
 *
 * Importar por: import { scoreMatch, selectAnchors, generateVariations } from "@/lib/bob/engine"
 */

export { scoreMatch, selectAnchors } from "./scoring";
export type { MatchInput, ScoredMatch } from "./scoring";

export { generateVariations } from "./variations";
export type { VariationInput } from "./variations";
