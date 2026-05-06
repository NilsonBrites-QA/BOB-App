export type OfficialDataSource = string | null | undefined;

const REAL_DATA_SOURCES = new Set([
  "api",
  "database",
  "db",
  "cache",
  "cache_hit",
  "persisted_snapshot",
  "stale_valid",
  "stale",
]);

const FORBIDDEN_DATA_SOURCES = new Set([
  "mock",
  "demo",
  "fallback_fake",
  "synthetic",
  "empty",
  "insufficient",
]);

export function normalizeDataSource(source: OfficialDataSource): string {
  return String(source ?? "insufficient").trim().toLowerCase();
}

export function isRealDataSource(source: OfficialDataSource): boolean {
  return REAL_DATA_SOURCES.has(normalizeDataSource(source));
}

export function isForbiddenForOfficialGeneration(source: OfficialDataSource): boolean {
  const normalized = normalizeDataSource(source);
  return FORBIDDEN_DATA_SOURCES.has(normalized) || !REAL_DATA_SOURCES.has(normalized);
}

export function confidencePenaltyForSource(source: OfficialDataSource): number {
  const normalized = normalizeDataSource(source);
  if (normalized === "stale_valid" || normalized === "stale") return 0.25;
  if (normalized === "cache" || normalized === "cache_hit" || normalized === "database" || normalized === "db") return 0;
  if (normalized === "api" || normalized === "persisted_snapshot") return 0;
  return 1;
}
