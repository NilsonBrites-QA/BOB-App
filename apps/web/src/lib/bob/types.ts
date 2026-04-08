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
  match: string;
  result: "1" | "X" | "2";
  odd: number;
  isAnchor?: boolean;
};

export type Variation = {
  id: string;
  title: string;
  posture: string;
  projectedOdd: number;
  gameCount: number;
  anchorsTogether: boolean;
  summary: string;
  picks: VariationPick[];
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