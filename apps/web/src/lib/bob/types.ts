export type Integration = {
  name: string;
  role: string;
  quota: string;
  cachePolicy: string;
  status: "connected" | "planned";
};

export type AnchorFactor = {
  label: string;
  weight: number;
  description: string;
};

export type AnchorCandidate = {
  team: string;
  opponent: string;
  score: number;
  reasons: string[];
};

export type VariationPick = {
  fixtureId?: string; // ID da fixture na API-Football (ex: "1234567")
  match: string;
  result: "1" | "X" | "2";
  odd: number;
  isAnchor?: boolean;
  /** true quando âncora foi selecionada via fallback L1/L2 (marginal) */
  isMarginal?: boolean;
};

/**
 * Classificação da postura do bilhete com base na odd final.
 * - 'big-odds':       odd ≥ 1000 — objetivo Big Odds cumprido.
 * - 'short-multiple': 100 ≤ odd < 1000 — pool insuficiente, mas minimamente aceitável.
 * - 'below-minimum':  odd < 100 — bilhete NÃO é Big Odds; nunca exibir como "aprovado".
 */
export type OddsClass = "big-odds" | "short-multiple" | "below-minimum";

export type Variation = {
  id: string;
  title: string;
  posture: string;
  projectedOdd: number;
  gameCount: number;
  anchorsTogether: boolean;
  summary: string;
  picks: VariationPick[];
  /** Classificação da postura — definida pelo motor após boostToFloor. */
  oddsClass: OddsClass;
  /** Rótulo legível para exibição no UI e nos logs. */
  oddsClassLabel: string;
};

export type MemoryLayer = {
  name: string;
  retention: string;
  purpose: string;
  motorUsage: string;
};

export type RoundSnapshot = {
  label: string;
  firstMatchWindow: string;
  cutoffLabel: string;
  deliveryRule: string;
  confirmedLineupPolicy: string;
  anchorRule: string;
};

export type AdminControl = {
  title: string;
  value: string;
  note: string;
};

export type FeatureFlag = {
  name: string;
  enabled: boolean;
  note: string;
};

export type DailyManifesto = {
  dailyOpening: string;
  deliverySignature: string;
};