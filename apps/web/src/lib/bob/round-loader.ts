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
      source: "query_params" | "detected_open_matches" | "provider_cache" | "database";
      reason: string;
      fixturesCount: number;
      requestedRound: number | null;
      firstMatchAt: string | null;
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

const UNKNOWN_NUMBER = Number.NaN;
const UNKNOWN_BOOLEAN = undefined as unknown as boolean;

function isValidRoundNumber(round: number | null | undefined): round is number {
  return typeof round === "number" && Number.isInteger(round) && round >= 1 && round <= 38;
}

function isOpenFdStatus(status: string | null | undefined) {
  return ["SCHEDULED", "TIMED", "IN_PLAY", "PAUSED", "POSTPONED"].includes(String(status ?? ""));
}

async function getCachedFixtureSummary(season: number, round: number) {
  const dbMatches = await prisma.betMatch.findMany({
    where: { season, round },
    orderBy: { scheduledAt: "asc" },
    select: { scheduledAt: true },
  }).catch(() => []);

  if (dbMatches.length > 0) {
    return {
      count: dbMatches.length,
      firstMatchAt: dbMatches[0]?.scheduledAt.toISOString() ?? null,
      source: "database" as const,
    };
  }

  const providerMatches = await getProviderCachedMatchesForRound(season, round);
  return {
    count: providerMatches.length,
    firstMatchAt: providerMatches.map((match) => match.utcDate).filter(Boolean).sort()[0] ?? null,
    source: providerMatches.length > 0 ? "provider_cache" as const : "database" as const,
  };
}

async function detectOpenRoundFromDb(season: number) {
  const rows = await prisma.betMatch.findMany({
    where: {
      season,
      round: { not: null },
      status: { in: OPEN_BET_MATCH_STATUSES },
    },
    orderBy: [{ round: "asc" }, { scheduledAt: "asc" }],
    select: { round: true, scheduledAt: true },
  }).catch(() => []);

  const firstRound = rows.find((row) => isValidRoundNumber(row.round))?.round ?? null;
  if (!firstRound) return null;
  const roundRows = rows.filter((row) => row.round === firstRound);
  return {
    round: firstRound,
    fixturesCount: roundRows.length,
    firstMatchAt: roundRows[0]?.scheduledAt.toISOString() ?? null,
  };
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

async function detectOpenRoundFromProviderCache(season: number) {
  const matches = (await readProviderMatchesCache(season)).filter((match) =>
    isValidRoundNumber(match.matchday) && isOpenFdStatus(match.status),
  );
  const round = matches.map((match) => match.matchday).sort((a, b) => a - b)[0] ?? null;
  if (!round) return null;
  const roundMatches = matches.filter((match) => match.matchday === round);
  return {
    round,
    fixturesCount: roundMatches.length,
    firstMatchAt: roundMatches.map((match) => match.utcDate).filter(Boolean).sort()[0] ?? null,
  };
}

async function getProviderCachedMatchesForRound(season: number, round: number) {
  return (await readProviderMatchesCache(season)).filter((match) => match.matchday === round);
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
    };
  }

  if (requestedRound !== null) {
    const summary = await getCachedFixtureSummary(args.season, requestedRound);
    return {
      ok: true,
      season: args.season,
      round: requestedRound,
      competition: "BSA",
      source: "query_params",
      reason: summary.count > 0 ? `${summary.source}_fixtures_for_requested_round` : "explicit_round_without_cached_fixtures",
      fixturesCount: summary.count,
      requestedRound,
      firstMatchAt: summary.firstMatchAt,
    };
  }

  const dbOpenRound = await detectOpenRoundFromDb(args.season);
  if (dbOpenRound) {
    return {
      ok: true,
      season: args.season,
      round: dbOpenRound.round,
      competition: "BSA",
      source: "detected_open_matches",
      reason: "database_open_matches",
      fixturesCount: dbOpenRound.fixturesCount,
      requestedRound: null,
      firstMatchAt: dbOpenRound.firstMatchAt,
    };
  }

  const providerOpenRound = await detectOpenRoundFromProviderCache(args.season);
  if (providerOpenRound) {
    return {
      ok: true,
      season: args.season,
      round: providerOpenRound.round,
      competition: "BSA",
      source: "provider_cache",
      reason: "provider_cache_open_matches",
      fixturesCount: providerOpenRound.fixturesCount,
      requestedRound: null,
      firstMatchAt: providerOpenRound.firstMatchAt,
    };
  }

  const dbRound = await getLastKnownRoundFromDb(args.season);
  if (isValidRoundNumber(dbRound)) {
    const summary = await getCachedFixtureSummary(args.season, dbRound);
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
    };
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
