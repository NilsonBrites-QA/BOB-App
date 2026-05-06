/**
 * BOB — Round Loader (Carregador de Rodada)
 *
 * Responsável por resolver QUAL rodada exibir e CARREGAR seus dados.
 *
 * ─── Paradigma (PRD §9 — Integração e Cache) ────────────────────────────────
 *
 * 1. RESOLUÇÃO DE RODADA — resolveCurrentRound()
 *    Cascata determinística de 3 níveis:
 *      L1: API Gated (getCurrentRound → detectNextOpenRound + ponteiro FD)
 *      L2: Banco de dados (última rodada DELIVERED ou READY no Supabase)
 *      L3: Demo mode (rodada demonstrativa com alerta transparente)
 *
 * 2. CARREGAMENTO DE DADOS — loadRoundData()
 *    Após a rodada ser resolvida, carrega fixtures via pipeline gated.
 *    Cache ISR de 5 min (unstable_cache do Next.js).
 *
 * ─── Contrato de Fallback ────────────────────────────────────────────────────
 *
 *   A UI NUNCA quebra. Se todas as fontes falharem, o sistema entra em
 *   modo demonstrativo com alerta "Sinal de calendário interrompido".
 *   O usuário vê dados de demo e sabe que não são oficiais.
 *
 * Histórico:
 *   Tarefa 1: DB-first para variações imutáveis
 *   Tarefa 2: resolveCurrentRound() com cascata L1→L2→L3
 */

import { unstable_cache } from "next/cache";
import { demoMatches } from "@/lib/bob/demo-matches";
import {
  getGatewayCurrentRound,
  getGatewayRoundDataset,
  type GatewayRoundResult,
  type FDMatch,
  type FDMatchesResponse,
} from "@/lib/data/sports-data-gateway";
import type { MatchInput } from "@/lib/bob/engine/scoring";
import { prisma } from "@/lib/db";
import { getCachedRoundDataset, getRoundDataset } from "@/lib/data/data-gateway";
import { BetMatchStatus } from "@/generated/prisma";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type RoundFallbackReason =
  | "missing-token"
  | "round-unavailable"
  | "provider-fallback"
  | "calendar-signal-interrupted";

export type RoundResolution = {
  round: number;
  /** Nível da cascata que resolveu a rodada */
  resolvedBy: "api" | "database" | "demo";
  /** Mensagem de auditoria para log/UI */
  auditMessage: string;
};

export type LoadedRoundData =
  | {
      source: "api" | "database" | "cache" | "cache_hit" | "stale_valid" | "persisted_snapshot";
      fallbackReason: null;
      matches: MatchInput[];
      assets: GatewayRoundResult["assets"];
      meta: GatewayRoundResult["meta"];
    }
  | {
      source: "demo" | "mock" | "fallback_fake" | "synthetic" | "empty" | "insufficient";
      fallbackReason: RoundFallbackReason;
      matches: MatchInput[];
      assets: GatewayRoundResult["assets"];
      meta: null;
    };

export type OfficialRoundContext =
  | {
      ok: true;
      season: number;
      round: number;
      competition: "BSA";
      source: "query_params" | "detected_open_matches" | "provider_cache" | "database" | "current_round_or_upcoming_matches";
      reason: string;
      fixturesCount: number;
      requestedRound: number | null;
      firstMatchAt: string | null;
      firstKickoffAt: string | null;
      staleOpenMatchesIgnored: number;
      candidateRounds: Array<{
        round: number;
        fixturesCount: number;
        firstKickoffAt: string | null;
        source: "database" | "provider_cache" | "current_round_cache";
        roundMode: "current" | "future" | "past";
      }>;
      roundMode: "current" | "future" | "past";
    }
  | {
      ok: false;
      season: number;
      round: null;
      competition: "BSA";
      source: "invalid" | "unresolved";
      reason: "invalid_round_context";
      fixturesCount: 0;
      requestedRound: number | null;
      receivedRound: number | null;
      firstMatchAt: null;
      firstKickoffAt: null;
      staleOpenMatchesIgnored: number;
      candidateRounds: Array<{
        round: number;
        fixturesCount: number;
        firstKickoffAt: string | null;
        source: "database" | "provider_cache" | "current_round_cache";
        roundMode: "current" | "future" | "past";
      }>;
      roundMode: null;
    };

export function describeRoundFallback(reason: RoundFallbackReason): string {
  if (reason === "missing-token") {
    return "Painel em modo demonstrativo: a conexão principal com o provedor de rodada não está configurada.";
  }
  if (reason === "round-unavailable") {
    return "Painel em modo demonstrativo: a rodada atual não pôde ser identificada automaticamente.";
  }
  if (reason === "calendar-signal-interrupted") {
    return "Sinal de calendário interrompido — exibindo a última rodada conhecida. O BOB retomará a leitura ao vivo assim que o provedor de dados se restabelecer.";
  }
  return "Painel em modo demonstrativo: houve falha ao montar a leitura ao vivo desta rodada.";
}

// ─── Resolução Autônoma de Rodada (Cascata L1 → L2 → L3) ────────────────────

/**
 * Busca a última rodada conhecida no banco (tabela `rounds`).
 *
 * Prioridade:
 *   1. Rodada DELIVERED (congelada, pronta para o usuário) — mais recente
 *   2. Rodada READY (pronta mas não entregue) — admin ainda não aprovou
 *   3. Rodada DRAFT — em construção
 *
 * Retorna null se o banco estiver completamente vazio.
 * Usa a season atual para restringir o escopo.
 */
async function getLastKnownRoundFromDb(season: number): Promise<number | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roundDelegate = prisma.round as any;

    const row = await roundDelegate.findFirst({
      where: {
        season: { year: season },
        status: { not: "SUPERSEDED" },
      },
      orderBy: [
        { number: "desc" },
      ],
      select: { number: true, status: true },
    });

    if (row) {
      console.info(
        `[RoundLoader/L2] Última rodada no banco: ${row.number} (status: ${row.status})`,
      );
      return row.number;
    }
    return null;
  } catch (err) {
    console.error("[RoundLoader/L2] Falha ao consultar banco:", err);
    return null;
  }
}

const OPEN_BET_MATCH_STATUSES = [
  BetMatchStatus.SCHEDULED,
  BetMatchStatus.LIVE,
  BetMatchStatus.POSTPONED,
];

const PROVIDER_OPEN_MATCHES_CACHE_KEY =
  "provider:football-data:/competitions/BSA/matches?status=SCHEDULED,TIMED,IN_PLAY,PAUSED,POSTPONED&limit=200";
const PROVIDER_STANDINGS_CACHE_KEY = "provider:football-data:/competitions/BSA/standings";
const ROUND_STALE_WINDOW_MS = 24 * 60 * 60 * 1000;

const UNKNOWN_NUMBER = Number.NaN;
const UNKNOWN_BOOLEAN = undefined as unknown as boolean;

function isValidRoundNumber(round: number | null | undefined): round is number {
  return typeof round === "number" && Number.isInteger(round) && round >= 1 && round <= 38;
}

function isOpenFdStatus(status: string | null | undefined) {
  return ["SCHEDULED", "TIMED", "IN_PLAY", "PAUSED", "POSTPONED"].includes(String(status ?? ""));
}

function parseKickoffTime(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function classifyRoundMode(kickoffs: Array<string | Date | null | undefined>): "current" | "future" | "past" {
  const now = Date.now();
  const staleCutoff = now - ROUND_STALE_WINDOW_MS;
  const times = kickoffs
    .map(parseKickoffTime)
    .filter((time): time is number => time !== null)
    .sort((a, b) => a - b);
  if (times.length === 0) return "future";
  if (times.every((time) => time < staleCutoff)) return "past";
  if (times.some((time) => time >= staleCutoff && time <= now + ROUND_STALE_WINDOW_MS)) return "current";
  return "future";
}

function firstRelevantKickoff(kickoffs: Array<string | Date | null | undefined>) {
  const staleCutoff = Date.now() - ROUND_STALE_WINDOW_MS;
  const times = kickoffs
    .map(parseKickoffTime)
    .filter((time): time is number => time !== null)
    .filter((time) => time >= staleCutoff)
    .sort((a, b) => a - b);
  return times[0] ?? Number.POSITIVE_INFINITY;
}

type OfficialRoundCandidate = {
  round: number;
  fixturesCount: number;
  firstKickoffAt: string | null;
  kickoffDates: string[];
  source: "database" | "provider_cache" | "current_round_cache";
  reason: string;
  roundMode: "current" | "future" | "past";
};

function publicCandidate(candidate: OfficialRoundCandidate) {
  return {
    round: candidate.round,
    fixturesCount: candidate.fixturesCount,
    firstKickoffAt: candidate.firstKickoffAt,
    source: candidate.source,
    roundMode: candidate.roundMode,
  };
}

function selectBestRoundCandidate(candidates: OfficialRoundCandidate[]) {
  const viable = candidates.filter((candidate) => {
    if (candidate.roundMode !== "past") return true;
    console.info(
      `[BOB/RoundContext] ignored_stale_round round=${candidate.round} firstKickoff=${candidate.firstKickoffAt ?? "unknown"} reason=past_open_matches`,
    );
    return false;
  });
  const currentRoundCandidate = viable.find((candidate) => candidate.source === "current_round_cache");
  if (currentRoundCandidate) return currentRoundCandidate;
  return viable
    .slice()
    .sort((a, b) => {
      const aTime = firstRelevantKickoff(a.kickoffDates);
      const bTime = firstRelevantKickoff(b.kickoffDates);
      if (aTime !== bTime) return aTime - bTime;
      const sourcePriority: Record<OfficialRoundCandidate["source"], number> = {
        database: 0,
        provider_cache: 1,
        current_round_cache: 2,
      };
      return sourcePriority[a.source] - sourcePriority[b.source];
    })[0] ?? null;
}

async function getCachedFixtureSummary(season: number, round: number) {
  const dbMatches = await prisma.betMatch.findMany({
    where: { season, round },
    orderBy: { scheduledAt: "asc" },
    select: { scheduledAt: true },
  }).catch(() => []);

  if (dbMatches.length > 0) {
    const kickoffDates = dbMatches.map((match) => match.scheduledAt.toISOString());
    return {
      count: dbMatches.length,
      firstMatchAt: kickoffDates[0] ?? null,
      kickoffDates,
      source: "database" as const,
    };
  }

  const providerMatches = await getProviderCachedMatchesForRound(season, round);
  const kickoffDates = providerMatches.map((match) => match.utcDate).filter((date): date is string => Boolean(date)).sort();
  return {
    count: providerMatches.length,
    firstMatchAt: kickoffDates[0] ?? null,
    kickoffDates,
    source: providerMatches.length > 0 ? "provider_cache" as const : "database" as const,
  };
}

async function detectOpenRoundsFromDb(season: number): Promise<OfficialRoundCandidate[]> {
  const rows = await prisma.betMatch.findMany({
    where: {
      season,
      round: { not: null },
      status: { in: OPEN_BET_MATCH_STATUSES },
    },
    orderBy: [{ round: "asc" }, { scheduledAt: "asc" }],
    select: { round: true, scheduledAt: true },
  }).catch(() => []);

  const grouped = new Map<number, Date[]>();
  for (const row of rows) {
    if (!isValidRoundNumber(row.round)) continue;
    grouped.set(row.round, [...(grouped.get(row.round) ?? []), row.scheduledAt]);
  }
  return Array.from(grouped.entries()).map(([round, dates]) => {
    const kickoffDates = dates.map((date) => date.toISOString()).sort();
    return {
      round,
      fixturesCount: dates.length,
      firstKickoffAt: kickoffDates[0] ?? null,
      kickoffDates,
      source: "database",
      reason: "database_open_matches",
      roundMode: classifyRoundMode(kickoffDates),
    };
  });
}

async function readProviderMatchesCache(season: number): Promise<FDMatch[]> {
  const cacheKeys = [
    PROVIDER_OPEN_MATCHES_CACHE_KEY,
    `gateway:football-data:competition:BSA:${season}`,
  ];
  for (const cacheKey of cacheKeys) {
    const cached = await prisma.chatContextCache.findUnique({ where: { cacheKey } }).catch(() => null);
    const data = cached?.data as unknown as FDMatchesResponse | null;
    if (Array.isArray(data?.matches) && data.matches.length > 0) {
      return data.matches;
    }
  }
  return [];
}

async function detectOpenRoundsFromProviderCache(season: number): Promise<OfficialRoundCandidate[]> {
  const matches = (await readProviderMatchesCache(season)).filter((match) =>
    isValidRoundNumber(match.matchday) && isOpenFdStatus(match.status),
  );
  const grouped = new Map<number, FDMatch[]>();
  for (const match of matches) {
    grouped.set(match.matchday, [...(grouped.get(match.matchday) ?? []), match]);
  }
  return Array.from(grouped.entries()).map(([round, roundMatches]) => {
    const kickoffDates = roundMatches.map((match) => match.utcDate).filter((date): date is string => Boolean(date)).sort();
    return {
      round,
      fixturesCount: roundMatches.length,
      firstKickoffAt: kickoffDates[0] ?? null,
      kickoffDates,
      source: "provider_cache",
      reason: "provider_cache_open_matches",
      roundMode: classifyRoundMode(kickoffDates),
    };
  });
}

async function getProviderCachedMatchesForRound(season: number, round: number) {
  return (await readProviderMatchesCache(season)).filter((match) => match.matchday === round);
}

function readRoundPointerFromCachePayload(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const direct = record.currentRound ?? record.currentMatchday ?? record.matchday ?? record.round;
  if (typeof direct === "number" && isValidRoundNumber(direct)) return direct;
  const seasonRecord = record.season;
  if (seasonRecord && typeof seasonRecord === "object") {
    const seasonRound = (seasonRecord as Record<string, unknown>).currentMatchday;
    if (typeof seasonRound === "number" && isValidRoundNumber(seasonRound)) return seasonRound;
  }
  return null;
}

async function readCurrentRoundCandidateFromCache(season: number): Promise<OfficialRoundCandidate | null> {
  const cacheKeys = [
    "current_round",
    `current_round:${season}`,
    "gateway:football-data:current-round:BSA",
    PROVIDER_STANDINGS_CACHE_KEY,
    `gateway:football-data:standings:BSA:${season}`,
  ];
  for (const cacheKey of cacheKeys) {
    const cached = await prisma.chatContextCache.findUnique({ where: { cacheKey } }).catch(() => null);
    const round = readRoundPointerFromCachePayload(cached?.data);
    if (!isValidRoundNumber(round)) continue;
    const summary = await getCachedFixtureSummary(season, round);
    if (summary.count <= 0) continue;
    return {
      round,
      fixturesCount: summary.count,
      firstKickoffAt: summary.firstMatchAt,
      kickoffDates: summary.kickoffDates,
      source: "current_round_cache",
      reason: `current_round_cache:${cacheKey}`,
      roundMode: classifyRoundMode(summary.kickoffDates),
    };
  }
  return null;
}

function fdMatchToInput(match: FDMatch): MatchInput {
  const homeTeam = match.homeTeam.shortName || match.homeTeam.name;
  const awayTeam = match.awayTeam.shortName || match.awayTeam.name;
  return {
    id: String(match.id),
    match: `${homeTeam} x ${awayTeam}`,
    homeTeam,
    awayTeam,
    homePosition: UNKNOWN_NUMBER,
    awayPosition: UNKNOWN_NUMBER,
    homeNeedsWin: UNKNOWN_BOOLEAN,
    awayNeedsWin: UNKNOWN_BOOLEAN,
    homeForm: [],
    awayForm: [],
    homeHomePoints: UNKNOWN_NUMBER,
    awayAwayPoints: UNKNOWN_NUMBER,
    homeGoalsScored5: UNKNOWN_NUMBER,
    homeGoalsConceded5: UNKNOWN_NUMBER,
    awayGoalsScored5: UNKNOWN_NUMBER,
    awayGoalsConceded5: UNKNOWN_NUMBER,
    h2hHomeWinRate: UNKNOWN_NUMBER,
    homeAbsenceRate: UNKNOWN_NUMBER,
    awayAbsenceRate: UNKNOWN_NUMBER,
    homeBigGameAhead: UNKNOWN_BOOLEAN,
    awayBigGameAhead: UNKNOWN_BOOLEAN,
    homeOdd: match.odds?.homeWin ?? 0,
    drawOdd: match.odds?.draw ?? 0,
    awayOdd: match.odds?.awayWin ?? 0,
    homeOddDropped: false,
    scheduledAt: match.utcDate,
    status: match.status,
    homeCrest: match.homeTeam.crest ?? null,
    awayCrest: match.awayTeam.crest ?? null,
  };
}

function buildRoundMeta(
  season: number,
  round: number,
  matches: MatchInput[],
  firstMatchAt?: string | null,
): GatewayRoundResult["meta"] {
  return {
    season,
    round,
    fixtureCount: matches.length,
    generatedAt: new Date().toISOString(),
    source: "football-data",
    firstMatchAt: firstMatchAt ?? matches.map((match) => match.scheduledAt).filter(Boolean).sort()[0] ?? null,
    gatedHits: { standings: false, matchday: false, finished: false, injuries: false },
    integrations: {
      odds: matches.some((match) => match.homeOdd > 1 && match.drawOdd > 1 && match.awayOdd > 1) ? "partial" : "fallback",
      h2h: "fallback",
      injuries: "fallback",
      cup: "fallback",
      assets: matches.some((match) => match.homeCrest || match.awayCrest) ? "ready" : "empty",
      weather: "fallback",
    },
  };
}

export async function resolveOfficialRoundContext(args: {
  season: number;
  round?: number | null;
}): Promise<OfficialRoundContext> {
  const requestedRound = args.round ?? null;
  if (requestedRound !== null && !isValidRoundNumber(requestedRound)) {
    return {
      ok: false,
      season: args.season,
      round: null,
      competition: "BSA",
      source: "invalid",
      reason: "invalid_round_context",
      fixturesCount: 0,
      requestedRound,
      receivedRound: requestedRound,
      firstMatchAt: null,
      firstKickoffAt: null,
      staleOpenMatchesIgnored: 0,
      candidateRounds: [],
      roundMode: null,
    };
  }

  if (requestedRound !== null) {
    const summary = await getCachedFixtureSummary(args.season, requestedRound);
    const roundMode = classifyRoundMode(summary.kickoffDates);
    return {
      ok: true,
      season: args.season,
      round: requestedRound,
      competition: "BSA",
      source: "query_params",
      reason: summary.count > 0
        ? `${summary.source}_fixtures_for_requested_round`
        : "explicit_round_without_cached_fixtures",
      fixturesCount: summary.count,
      requestedRound,
      firstMatchAt: summary.firstMatchAt,
      firstKickoffAt: summary.firstMatchAt,
      staleOpenMatchesIgnored: 0,
      candidateRounds: [
        {
          round: requestedRound,
          fixturesCount: summary.count,
          firstKickoffAt: summary.firstMatchAt,
          source: summary.source === "provider_cache" ? "provider_cache" : "database",
          roundMode,
        },
      ],
      roundMode,
    };
  }

  const candidates = [
    ...await detectOpenRoundsFromDb(args.season),
    ...await detectOpenRoundsFromProviderCache(args.season),
  ];
  const currentRoundCandidate = await readCurrentRoundCandidateFromCache(args.season);
  if (currentRoundCandidate) candidates.unshift(currentRoundCandidate);
  const staleOpenMatchesIgnored = candidates.filter((candidate) => candidate.roundMode === "past").length;
  const selected = selectBestRoundCandidate(candidates);
  if (selected) {
    console.info(
      `[BOB/RoundContext] selected season=${args.season} round=${selected.round} source=current_round_or_upcoming_matches fixtures=${selected.fixturesCount}`,
    );
    return {
      ok: true,
      season: args.season,
      round: selected.round,
      competition: "BSA",
      source: selected.source === "provider_cache" ? "provider_cache" : "current_round_or_upcoming_matches",
      reason: selected.reason,
      fixturesCount: selected.fixturesCount,
      requestedRound: null,
      firstMatchAt: selected.firstKickoffAt,
      firstKickoffAt: selected.firstKickoffAt,
      staleOpenMatchesIgnored,
      candidateRounds: candidates.map(publicCandidate),
      roundMode: selected.roundMode,
    };
  }

  const dbRound = await getLastKnownRoundFromDb(args.season);
  if (isValidRoundNumber(dbRound)) {
    const summary = await getCachedFixtureSummary(args.season, dbRound);
    const roundMode = classifyRoundMode(summary.kickoffDates);
    if (roundMode !== "past") {
      return {
        ok: true,
        season: args.season,
        round: dbRound,
        competition: "BSA",
        source: "database",
        reason: "last_known_round",
        fixturesCount: summary.count,
        requestedRound: null,
        firstMatchAt: summary.firstMatchAt,
        firstKickoffAt: summary.firstMatchAt,
        staleOpenMatchesIgnored,
        candidateRounds: candidates.map(publicCandidate),
        roundMode,
      };
    }
    console.info(
      `[BOB/RoundContext] ignored_stale_round round=${dbRound} firstKickoff=${summary.firstMatchAt ?? "unknown"} reason=last_known_round_past`,
    );
  }

  return {
    ok: false,
    season: args.season,
    round: null,
    competition: "BSA",
    source: "unresolved",
    reason: "invalid_round_context",
    fixturesCount: 0,
    requestedRound: null,
    receivedRound: null,
    firstMatchAt: null,
    firstKickoffAt: null,
    staleOpenMatchesIgnored,
    candidateRounds: candidates.map(publicCandidate),
    roundMode: null,
  };
}

export async function loadOfficialRoundData(context: Extract<OfficialRoundContext, { ok: true }>): Promise<LoadedRoundData> {
  const cachedDataset = await getCachedRoundDataset(context.season, context.round);
  if (cachedDataset.ok && cachedDataset.data && cachedDataset.data.length > 0) {
    return {
      source: cachedDataset.source === "stale_valid" ? "stale_valid" : "database",
      fallbackReason: null,
      matches: cachedDataset.data,
      assets: new Map<string, never>(),
      meta: buildRoundMeta(context.season, context.round, cachedDataset.data, context.firstMatchAt),
    };
  }

  const providerMatches = await getProviderCachedMatchesForRound(context.season, context.round);
  if (providerMatches.length > 0) {
    const matches = providerMatches.map(fdMatchToInput);
    return {
      source: "cache_hit",
      fallbackReason: null,
      matches,
      assets: new Map<string, never>(),
      meta: buildRoundMeta(context.season, context.round, matches, context.firstMatchAt),
    };
  }

  return {
    source: "insufficient",
    fallbackReason: "round-unavailable",
    matches: [],
    assets: new Map<string, never>(),
    meta: null,
  };
}

/**
 * Resolve a rodada atual do Brasileirão usando cascata de 3 níveis.
 *
 * Chamada APENAS quando `paramRound` é null (entrada sem parâmetro).
 * Cada nível só é tentado se o anterior falhar.
 *
 * L1 (API Gated):
 *   - Chama getGatewayCurrentRound() do Data Gateway
 *   - Internamente usa o orquestrador autorizado de calendário
 *   - Consumo gated: football-data.org com cache ISR de 1h
 *   - Se o cache-gate bloquear (throttle 24h), Next.js serve do edge cache
 *
 * L2 (Banco de Dados):
 *   - Consulta a tabela `rounds` pela rodada mais recente não-SUPERSEDED
 *   - Zero chamadas externas — leitura instantânea (~5ms)
 *   - Garante continuidade mesmo com API offline por dias
 *
 * L3 (Demo):
 *   - Retorna null — o caller ativa modo demonstrativo
 *   - Alerta "Sinal de calendário interrompido" é exibido na UI
 *
 * @param season - Temporada (ex: 2026)
 * @returns RoundResolution com o número da rodada e a origem
 */
export async function resolveCurrentRound(season: number): Promise<RoundResolution> {
  // ── L1: API Gated (detectNextOpenRound + ponteiro FD) ──
  // getGatewayCurrentRound() já implementa a lógica de drift detection no caminho autorizado.
  // O cache ISR do Next.js (1h) evita chamadas repetidas à API.
  // Se o token não está configurado, pula direto para L2.
  if (process.env.FOOTBALL_DATA_TOKEN) {
    try {
      const apiRound = await getGatewayCurrentRound();
      if (apiRound !== null) {
        console.info(`[RoundLoader/L1] Rodada resolvida pela API: ${apiRound}`);
        return {
          round: apiRound,
          resolvedBy: "api",
          auditMessage: `Rodada ${apiRound} detectada pelo provedor de calendário (football-data.org).`,
        };
      }
      console.warn("[RoundLoader/L1] API retornou null — tentando banco...");
    } catch (err) {
      console.error("[RoundLoader/L1] Falha na API de calendário:", err);
    }
  }

  // ── L2: Banco de Dados (última rodada conhecida) ──
  const dbRound = await getLastKnownRoundFromDb(season);
  if (dbRound !== null) {
    console.info(`[RoundLoader/L2] Rodada resolvida pelo banco: ${dbRound}`);
    return {
      round: dbRound,
      resolvedBy: "database",
      auditMessage: `Sinal de calendário interrompido — exibindo rodada ${dbRound} (última conhecida no banco).`,
    };
  }

  // ── L3: Demo (nenhuma fonte disponível) ──
  console.warn("[RoundLoader/L3] Nenhuma fonte de rodada disponível — modo demo.");
  return {
    round: 0, // Sinaliza que não há rodada real
    resolvedBy: "demo",
    auditMessage: "Nenhuma fonte de calendário disponível. Painel em modo demonstrativo.",
  };
}

// ─── Carregamento de Dados da Rodada ─────────────────────────────────────────

// Tipo serializável (Map → array de tuples)
type SerializableRoundData = Omit<LoadedRoundData, "assets"> & {
  assetsEntries: Array<[string, unknown]>;
};

/**
 * Função interna cacheável: serializa o Map para o unstable_cache do Next.
 * Cache TTL 5 min — rodada raramente muda intra-dia, mas permite refresh.
 */
const fetchAndSerialize = unstable_cache(
  async (season: number, round: number | null): Promise<SerializableRoundData> => {
    if (!process.env.FOOTBALL_DATA_TOKEN) {
      return {
        source: "demo",
        fallbackReason: "missing-token",
        matches: demoMatches,
        assetsEntries: [],
        meta: null,
      };
    }

    // ── TAREFA 2: Resolução autônoma com cascata L1→L2→L3 ──
    // Antes: `round ?? getGatewayCurrentRound()` — sem fallback DB, quebrava em demo.
    // Agora: resolveCurrentRound() tenta API → banco → demo, nunca falha.
    let resolvedRound: number;
    let calendarInterrupted = false;

    if (round !== null) {
      // Rodada explícita via parâmetro — sem resolução necessária
      resolvedRound = round;
    } else {
      const resolution = await resolveCurrentRound(season);
      if (resolution.resolvedBy === "demo" || resolution.round === 0) {
        return {
          source: "demo",
          fallbackReason: "round-unavailable",
          matches: demoMatches,
          assetsEntries: [],
          meta: null,
        };
      }
      resolvedRound = resolution.round;
      calendarInterrupted = resolution.resolvedBy === "database";
    }

    const gatewayResult = await getRoundDataset(season, resolvedRound);
    if (gatewayResult.ok && gatewayResult.source !== "api") {
      const matches = gatewayResult.data ?? [];
      return {
        source: gatewayResult.source,
        fallbackReason: null,
        matches,
        assetsEntries: [],
        meta: buildRoundMeta(season, resolvedRound, matches),
      };
    }

    try {
      const result = await getGatewayRoundDataset(season, resolvedRound);
      if (!result) {
        throw new Error("insufficient:gateway-round-dataset");
      }

      // Se a rodada foi resolvida pelo banco (L2), os dados do pipeline
      // podem estar parcialmente stale. A meta reflete isso para a UI.
      if (calendarInterrupted && result.matches.length === 0) {
        // API retornou 0 matches para a rodada do banco — provável dessincronização
        console.warn(
          `[RoundLoader] Rodada ${resolvedRound} (L2) retornou 0 matches — caindo para demo.`,
        );
        return {
          source: "demo",
          fallbackReason: "calendar-signal-interrupted",
          matches: demoMatches,
          assetsEntries: [],
          meta: null,
        };
      }

      return {
        source: "api",
        fallbackReason: null,
        matches: result.matches,
        assetsEntries: Array.from(result.assets.entries()),
        meta: result.meta,
      };
    } catch (err) {
      console.error("[RoundLoader] Falha ao buscar dados reais:", err);
      return {
        source: "demo",
        fallbackReason: calendarInterrupted ? "calendar-signal-interrupted" : "provider-fallback",
        matches: demoMatches,
        assetsEntries: [],
        meta: null,
      };
    }
  },
  ["round-data-v4"],
  { revalidate: 300, tags: ["round-data"] },
);

export async function loadRoundData(
  season: number,
  round: number | null,
): Promise<LoadedRoundData> {
  const serialized = await fetchAndSerialize(season, round);
  // Reconstrói Map a partir das entries serializadas
  const assets = new Map(
    serialized.assetsEntries as Array<[string, GatewayRoundResult["assets"] extends Map<string, infer V> ? V : never]>,
  );
  if (serialized.source === "api") {
    return {
      source: "api",
      fallbackReason: null,
      matches: serialized.matches,
      assets,
      meta: serialized.meta!,
    };
  }
  if (
    serialized.source === "database" ||
    serialized.source === "cache" ||
    serialized.source === "cache_hit" ||
    serialized.source === "stale_valid" ||
    serialized.source === "persisted_snapshot"
  ) {
    return {
      source: serialized.source,
      fallbackReason: null,
      matches: serialized.matches,
      assets,
      meta: serialized.meta as GatewayRoundResult["meta"],
    };
  }
  return {
    source: "demo",
    fallbackReason: serialized.fallbackReason as RoundFallbackReason,
    matches: serialized.matches,
    assets,
    meta: null,
  };
}
