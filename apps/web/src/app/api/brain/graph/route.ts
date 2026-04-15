/**
 * BOB Live Brain Console — Graph Data Provider
 *
 * PRD §11 — "Observabilidade e Admin (O Cérebro Observado)":
 *   "Cada requisição de API, reflexão da LLM ou geração de bilhete 'pisca'
 *    e cria um novo nó ligado à rodada atual, permitindo que o administrador
 *    rastreie o log cognitivo visualmente."
 *
 * ─── Estrutura do Grafo ───────────────────────────────────────────────────────
 *
 * Hierarquia Visual:
 *
 *   Season (root)
 *     └─ Round (hub central de cada rodada)
 *           ├─── [sync-*]       ApiSyncLog        → Lobo de Percepção
 *           ├─── [pattern-*]    ConditionalPattern → Lobo Analítico  (Reflexões)
 *           ├─── [simulation-*] SimulationResult   → Lobo de Execução
 *           └─── [memory-*]     MemoryEvent        → Log Cognitivo Geral
 *
 * Arestas Especiais:
 *   - CORRECTS: padrão-novo → padrão-antigo (mesmo sha12, Zettelkasten PRD §5)
 *   - FEEDS:    sync → round (API alimentou esta rodada)
 *   - PATTERN_OF: pattern → round (âncora analítica da rodada)
 *   - SIMULATES: simulation → round
 *   - LOGS: memory_event → round
 *
 * ─── Autenticação ────────────────────────────────────────────────────────────
 *
 * ADMIN-only. Verificação Supabase Auth + role do banco.
 *
 * ─── Query Parameters ────────────────────────────────────────────────────────
 *
 * ?season=2026         — Temporada a visualizar (padrão: ano atual)
 * ?rounds=10           — Número de rodadas a incluir, mais recentes primeiro (padrão: 10, máx: 38)
 * ?includeMemory=true  — Incluir nós de MemoryEvent individuais (padrão: false — apenas stats)
 *
 * ─── Segurança ───────────────────────────────────────────────────────────────
 *
 * Toda consulta à `api_sync_log` usa $queryRaw com template tag do Prisma
 * (parameterização nativa do driver pg, zero interpolação de string).
 *
 * Fase 4, Passo 1 | Consumido pelo componente <BrainGraph> (Passo 2)
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";

// ─── Tipos do Grafo (compatíveis com react-force-graph-2d / ForceGraph2D) ─────

/**
 * Tipos de nós — cada tipo representa um "lobo cognitivo" do PRD §4.
 *
 * season     → nó raiz / âncora temporal
 * round      → hub central da rodada (Core)
 * sync       → evento de ingestão de dado externo (Lobo de Percepção)
 * pattern    → padrão condicional emergente / Reflexão (Lobo Analítico)
 * simulation → resultado de simulação cega (Lobo de Execução)
 * memory     → evento de memória episódica genérico (Log Cognitivo)
 */
export type GraphNodeType =
  | "season"
  | "round"
  | "sync"
  | "pattern"
  | "simulation"
  | "memory";

/**
 * Grupos visuais mapeados para cores no frontend (Glassmorphism palette).
 *
 * core        → nó central (branco/cinza claro)
 * perception  → ingestão de APIs (azul)
 * analytic    → reflexões e padrões (violeta/roxo)
 * execution   → simulações e variações (verde/âmbar)
 * event       → log genérico (cinza escuro)
 */
export type GraphNodeGroup =
  | "core"
  | "perception"
  | "analytic"
  | "execution"
  | "event";

/** Cor hex para cada grupo — usada pelo componente ForceGraph2D. */
export const NODE_COLORS: Record<GraphNodeGroup, string> = {
  core: "#e2e8f0",      // slate-200
  perception: "#38bdf8", // sky-400
  analytic: "#a78bfa",   // violet-400
  execution: "#34d399",  // emerald-400
  event: "#64748b",      // slate-500
};

/** Tamanho-base de cada tipo de nó (multiplicador de raio no renderer). */
export const NODE_SIZES: Record<GraphNodeType, number> = {
  season: 20,
  round: 14,
  sync: 5,
  pattern: 8,
  simulation: 10,
  memory: 4,
};

/**
 * Nó do grafo.
 *
 * `id` é a chave única usada para as edges. Formato: `{type}-{uuid/key}`.
 * `meta` contém dados extras renderizados no tooltip do painel lateral.
 */
export type GraphNode = {
  id: string;
  label: string;
  type: GraphNodeType;
  group: GraphNodeGroup;
  /** Cor hex derivada do grupo. */
  color: string;
  /** Raio visual relativo. */
  size: number;
  /** Metadados extras para o tooltip / painel lateral. */
  meta: Record<string, unknown>;
  /** ISO 8601 — controla a animação de "piscar" no frontend. */
  createdAt: string;
};

/**
 * Tipos de aresta — descrevem a natureza da relação entre dois nós.
 *
 * ANCHORS     → round ancorado em season
 * FEEDS       → sync alimenta round (dado percebido)
 * PATTERN_OF  → padrão emergiu nesta rodada
 * SIMULATES   → simulação executada sobre esta rodada
 * LOGS        → evento de memória registrado na rodada
 * CORRECTS    → padrão novo substitui (estilo Zettelkasten) padrão antigo
 */
export type GraphLinkType =
  | "ANCHORS"
  | "FEEDS"
  | "PATTERN_OF"
  | "SIMULATES"
  | "LOGS"
  | "CORRECTS";

/** Cor hex por tipo de aresta. */
export const LINK_COLORS: Record<GraphLinkType, string> = {
  ANCHORS: "#94a3b8",    // slate-400
  FEEDS: "#38bdf8",      // sky-400 (mesmo do nó sync)
  PATTERN_OF: "#a78bfa", // violet-400 (mesmo do nó pattern)
  SIMULATES: "#34d399",  // emerald-400 (mesmo do nó simulation)
  LOGS: "#475569",       // slate-600
  CORRECTS: "#f59e0b",   // amber-400 — destaque: trilha de correção Zettelkasten
};

export type GraphLink = {
  source: string;
  target: string;
  label: string;
  type: GraphLinkType;
  color: string;
};

/** Payload completo retornado pela rota. */
export type BrainGraphPayload = {
  nodes: GraphNode[];
  links: GraphLink[];
  meta: {
    season: number;
    roundsIncluded: number;
    generatedAt: string;
    nodeCounts: Record<GraphNodeType, number>;
  };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extrai o número de rodada de um `cache_key` do `api_sync_log`.
 * Padrões suportados: "fixtures-round-10", "odds-round-10", "lineup-round-10-*"
 * Retorna null se o padrão não for reconhecido (sync geral — ex: standings).
 */
function extractRoundFromCacheKey(cacheKey: string): number | null {
  const match = /round-(\d+)/i.exec(cacheKey);
  if (match?.[1]) return parseInt(match[1], 10);
  return null;
}

/**
 * Extrai o fingerprint semântico (sha12) de um `patternKey`.
 * Formato: `{sha12}_r{round}s{season}_t{ts_b36}`
 * O sha12 agrupa padrões que descrevem a mesma condição (trilha Zettelkasten).
 */
function extractSha12(patternKey: string): string {
  return patternKey.split("_")[0] ?? patternKey;
}

/**
 * Trunca um texto longo para uso como label de nó no grafo.
 * O tooltip (painel lateral) exibe o texto completo.
 */
function truncate(text: string, max: number = 40): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

// ─── Tipos internos das queries raw ──────────────────────────────────────────

type RawSyncRow = {
  id: string;
  source: string;
  cache_key: string;
  window_label: string | null;
  synced_at: Date;
  status_code: number | null;
  record_count: number | null;
  notes: string | null;
};

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  // ── Autenticação (ADMIN-only) ──────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const dbUser = await prisma.user
    .findUnique({
      where: { email: user.email!.toLowerCase() },
      select: { active: true, role: true },
    })
    .catch(() => null);

  if (!dbUser?.active) {
    return NextResponse.json({ error: "Acesso inativo." }, { status: 403 });
  }

  if (dbUser.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Apenas administradores podem acessar o Brain Console." },
      { status: 403 },
    );
  }

  // ── Query params ───────────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url);

  const rawSeason = searchParams.get("season");
  const season = rawSeason
    ? Math.max(2020, Math.min(2035, parseInt(rawSeason, 10)))
    : new Date().getFullYear();

  const rawRounds = searchParams.get("rounds");
  const roundsLimit = rawRounds
    ? Math.max(1, Math.min(38, parseInt(rawRounds, 10)))
    : 10;

  const includeMemory = searchParams.get("includeMemory") === "true";

  if (isNaN(season) || isNaN(roundsLimit)) {
    return NextResponse.json(
      { error: "Parâmetros inválidos." },
      { status: 400 },
    );
  }

  // ── Consultas paralelas ao banco ───────────────────────────────────────────
  const [rounds, seasonRow, patterns, simulations, memoryEvents, syncLogs] =
    await Promise.all([
      // Rodadas da temporada (hub central)
      prisma.round.findMany({
        where: { season: { year: season } },
        orderBy: { number: "desc" },
        take: roundsLimit,
        select: {
          id: true,
          number: true,
          status: true,
          firstMatchAt: true,
          createdAt: true,
          _count: {
            select: { anchors: true, variations: true, memoryEvents: true },
          },
        },
      }),

      // Temporada (nó raiz)
      prisma.season.findFirst({
        where: { year: season },
        select: { id: true, year: true, league: true, active: true },
      }),

      // Padrões condicionais — Lobo Analítico (sem embedding, não necessário para grafo)
      prisma.conditionalPattern.findMany({
        where: {
          lastSeenSeason: season,
        },
        orderBy: { createdAt: "desc" },
        take: roundsLimit * 4, // até 4 reflexões por rodada
        select: {
          id: true,
          patternKey: true,
          condition: true,
          factors: true,
          occurrences: true,
          correct: true,
          isAntiCorr: true,
          isSuppressed: true,
          lastSeenRound: true,
          lastSeenSeason: true,
          createdAt: true,
        },
      }),

      // Simulações cegas — Lobo de Execução
      prisma.simulationResult.findMany({
        where: { season },
        orderBy: { round: "desc" },
        take: roundsLimit,
        select: {
          id: true,
          season: true,
          round: true,
          anchorCount: true,
          anchorsCorrect: true,
          totalPicks: true,
          correctPicks: true,
          calibrated: true,
          simulatedAt: true,
        },
      }),

      // Eventos de memória — Log Cognitivo (seletivo por tipo se !includeMemory)
      prisma.memoryEvent.findMany({
        where: {
          ...(includeMemory
            ? {}
            : { layer: { in: ["PATTERNS", "DECISIONS"] } }),
          round: {
            season: { year: season },
          },
        },
        orderBy: { createdAt: "desc" },
        take: roundsLimit * 5,
        select: {
          id: true,
          roundId: true,
          layer: true,
          type: true,
          source: true,
          relevanceScore: true,
          createdAt: true,
          content: true,
        },
      }),

      // api_sync_log — Lobo de Percepção (tabela fora do schema Prisma → $queryRaw)
      // Parâmetros: season (int), limit (int) — ambos passados via template tag
      // para parameterização nativa do driver pg (zero SQL injection).
      prisma.$queryRaw<RawSyncRow[]>`
        SELECT
          id::text,
          source,
          cache_key,
          window_label,
          synced_at,
          status_code,
          record_count,
          notes
        FROM api_sync_log
        WHERE
          -- Filtra registros do ano da temporada consultada.
          -- EXTRACT usa função nativa do PostgreSQL, não dado externo.
          EXTRACT(YEAR FROM synced_at) = ${season}
        ORDER BY synced_at DESC
        LIMIT ${roundsLimit * 6}
      `,
    ]);

  // ── Construção do Grafo ────────────────────────────────────────────────────

  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  // Índice de rodada número → id do nó, para ligação eficiente
  const roundNodeIdByNumber = new Map<number, string>();

  // ── [1] Nó Season (raiz) ──────────────────────────────────────────────────
  const seasonNodeId = `season-${season}`;
  nodes.push({
    id: seasonNodeId,
    label: `Temporada ${season}`,
    type: "season",
    group: "core",
    color: NODE_COLORS["core"],
    size: NODE_SIZES["season"],
    meta: {
      league: seasonRow?.league ?? "Brasileirão Série A",
      active: seasonRow?.active ?? false,
      roundsLoaded: rounds.length,
    },
    createdAt: seasonRow
      ? new Date(season, 0, 1).toISOString()
      : new Date().toISOString(),
  });

  // ── [2] Nós Round (hubs centrais) ─────────────────────────────────────────
  for (const round of rounds) {
    const nodeId = `round-${round.id}`;
    roundNodeIdByNumber.set(round.number, nodeId);

    nodes.push({
      id: nodeId,
      label: `Rodada ${round.number}`,
      type: "round",
      group: "core",
      color: NODE_COLORS["core"],
      size: NODE_SIZES["round"],
      meta: {
        number: round.number,
        status: round.status,
        firstMatchAt: round.firstMatchAt?.toISOString() ?? null,
        anchorsCount: round._count.anchors,
        variationsCount: round._count.variations,
        memoryEventsCount: round._count.memoryEvents,
      },
      createdAt: round.createdAt.toISOString(),
    });

    // Aresta: round → season
    links.push({
      source: nodeId,
      target: seasonNodeId,
      label: `R${round.number}`,
      type: "ANCHORS",
      color: LINK_COLORS["ANCHORS"],
    });
  }

  // ── [3] Nós ApiSyncLog (Lobo de Percepção) ────────────────────────────────
  for (const sync of syncLogs) {
    const nodeId = `sync-${sync.id}`;
    const syncedAt = sync.synced_at instanceof Date
      ? sync.synced_at
      : new Date(sync.synced_at);

    const windowLabel = sync.window_label ?? "geral";
    const label = `${sync.source} · ${windowLabel}`;

    nodes.push({
      id: nodeId,
      label: truncate(label, 40),
      type: "sync",
      group: "perception",
      color: NODE_COLORS["perception"],
      size: NODE_SIZES["sync"],
      meta: {
        source: sync.source,
        cacheKey: sync.cache_key,
        windowLabel: sync.window_label,
        statusCode: sync.status_code,
        recordCount: sync.record_count,
        notes: sync.notes,
        syncedAt: syncedAt.toISOString(),
      },
      createdAt: syncedAt.toISOString(),
    });

    // Determina o nó alvo: round específico (se cache_key referencia uma rodada)
    // ou o nó Season (sync global, ex: standings)
    const syncRound = extractRoundFromCacheKey(sync.cache_key);
    const targetNodeId = syncRound
      ? (roundNodeIdByNumber.get(syncRound) ?? seasonNodeId)
      : seasonNodeId;

    links.push({
      source: nodeId,
      target: targetNodeId,
      label: windowLabel,
      type: "FEEDS",
      color: LINK_COLORS["FEEDS"],
    });
  }

  // ── [4] Nós ConditionalPattern (Lobo Analítico) ───────────────────────────
  // Agrupa padrões pelo sha12 para construir arestas CORRECTS (Zettelkasten)
  const patternsBySha12 = new Map<string, typeof patterns>();
  for (const pattern of patterns) {
    const sha12 = extractSha12(pattern.patternKey);
    if (!patternsBySha12.has(sha12)) patternsBySha12.set(sha12, []);
    patternsBySha12.get(sha12)!.push(pattern);
  }

  for (const pattern of patterns) {
    const nodeId = `pattern-${pattern.id}`;

    const accuracyPct =
      pattern.occurrences > 0
        ? Math.round((pattern.correct / pattern.occurrences) * 100)
        : null;

    nodes.push({
      id: nodeId,
      label: truncate(pattern.condition, 45),
      type: "pattern",
      group: "analytic",
      color: pattern.isAntiCorr
        ? "#f87171" // red-400 — padrão anti-correlação (alerta)
        : NODE_COLORS["analytic"],
      size: NODE_SIZES["pattern"],
      meta: {
        patternKey: pattern.patternKey,
        factors: pattern.factors,
        condition: pattern.condition,
        occurrences: pattern.occurrences,
        correct: pattern.correct,
        accuracyPct,
        isAntiCorr: pattern.isAntiCorr,
        isSuppressed: pattern.isSuppressed,
        lastSeenRound: pattern.lastSeenRound,
        lastSeenSeason: pattern.lastSeenSeason,
        createdAt: pattern.createdAt.toISOString(),
      },
      createdAt: pattern.createdAt.toISOString(),
    });

    // Aresta: pattern → round da rodada em que foi observado
    if (pattern.lastSeenRound) {
      const targetNodeId =
        roundNodeIdByNumber.get(pattern.lastSeenRound) ?? seasonNodeId;
      links.push({
        source: nodeId,
        target: targetNodeId,
        label: "PADRÃO",
        type: "PATTERN_OF",
        color: NODE_COLORS["analytic"],
      });
    }
  }

  // Arestas CORRECTS entre padrões do mesmo sha12 (trilha Zettelkasten — PRD §5)
  // Ordena por createdAt (mais antigo primeiro) e liga em cadeia: novo → antigo
  for (const [, group] of patternsBySha12) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    for (let i = 1; i < sorted.length; i++) {
      const newerNode = `pattern-${sorted[i]!.id}`;
      const olderNode = `pattern-${sorted[i - 1]!.id}`;
      links.push({
        source: newerNode,
        target: olderNode,
        label: "ATUALIZAÇÃO/CORREÇÃO",
        type: "CORRECTS",
        color: LINK_COLORS["CORRECTS"],
      });
    }
  }

  // ── [5] Nós SimulationResult (Lobo de Execução) ───────────────────────────
  for (const sim of simulations) {
    const nodeId = `simulation-${sim.id}`;

    const anchorAcc =
      sim.anchorCount > 0
        ? Math.round((sim.anchorsCorrect / sim.anchorCount) * 100)
        : null;
    const pickAcc =
      sim.totalPicks > 0
        ? Math.round((sim.correctPicks / sim.totalPicks) * 100)
        : null;

    nodes.push({
      id: nodeId,
      label: `Simulação R${sim.round}`,
      type: "simulation",
      group: "execution",
      color: sim.calibrated
        ? NODE_COLORS["execution"] // verde — já calibrada
        : "#fbbf24", // amber-400 — aguardando calibração
      size: NODE_SIZES["simulation"],
      meta: {
        season: sim.season,
        round: sim.round,
        anchorCount: sim.anchorCount,
        anchorsCorrect: sim.anchorsCorrect,
        anchorAccuracyPct: anchorAcc,
        totalPicks: sim.totalPicks,
        correctPicks: sim.correctPicks,
        pickAccuracyPct: pickAcc,
        calibrated: sim.calibrated,
        simulatedAt: sim.simulatedAt.toISOString(),
      },
      createdAt: sim.simulatedAt.toISOString(),
    });

    // Aresta: simulation → round correspondente
    const targetNodeId =
      roundNodeIdByNumber.get(sim.round) ?? seasonNodeId;
    links.push({
      source: nodeId,
      target: targetNodeId,
      label: `Simulação Cega`,
      type: "SIMULATES",
      color: LINK_COLORS["SIMULATES"],
    });
  }

  // ── [6] Nós MemoryEvent (Log Cognitivo) ───────────────────────────────────
  for (const evt of memoryEvents) {
    const nodeId = `memory-${evt.id}`;

    // Label contextual baseado no tipo do evento
    const labelMap: Record<string, string> = {
      reflexao: "Reflexão LLM",
      lineup: "Escalação",
      injury: "Lesão/Desfalque",
      result: "Resultado",
      form: "Forma",
      narrative: "Narrativa",
      dual_mind: "Análise Dual Mind",
    };
    const label = labelMap[evt.type] ?? evt.type;

    nodes.push({
      id: nodeId,
      label: truncate(`${label} · ${evt.source ?? evt.layer}`, 40),
      type: "memory",
      group: "event",
      color: NODE_COLORS["event"],
      size: NODE_SIZES["memory"],
      meta: {
        layer: evt.layer,
        type: evt.type,
        source: evt.source,
        relevanceScore: evt.relevanceScore,
        createdAt: evt.createdAt.toISOString(),
        // Extrai campos de conteúdo relevantes para o tooltip sem expor o JSON completo
        contentSummary: extractMemoryContentSummary(evt.content),
      },
      createdAt: evt.createdAt.toISOString(),
    });

    // Aresta: memory → round via roundId
    if (evt.roundId) {
      const targetRoundNodeId = nodes.find(
        (n) => n.type === "round" && n.meta.number !== undefined && n.id === `round-${evt.roundId}`,
      )?.id ?? seasonNodeId;

      links.push({
        source: nodeId,
        target: targetRoundNodeId === `round-${evt.roundId}` ? targetRoundNodeId : seasonNodeId,
        label: label,
        type: "LOGS",
        color: LINK_COLORS["LOGS"],
      });
    }
  }

  // ── Contagem por tipo ──────────────────────────────────────────────────────
  const nodeCounts: Record<GraphNodeType, number> = {
    season: 0,
    round: 0,
    sync: 0,
    pattern: 0,
    simulation: 0,
    memory: 0,
  };
  for (const node of nodes) {
    nodeCounts[node.type] = (nodeCounts[node.type] ?? 0) + 1;
  }

  const payload: BrainGraphPayload = {
    nodes,
    links,
    meta: {
      season,
      roundsIncluded: rounds.length,
      generatedAt: new Date().toISOString(),
      nodeCounts,
    },
  };

  return NextResponse.json(payload, {
    headers: {
      // Cache curto: o grafo muda conforme novos eventos chegam
      "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
    },
  });
}

// ─── Utilitário privado ───────────────────────────────────────────────────────

/**
 * Extrai um resumo legível do campo `content` (Json) de um MemoryEvent
 * para exibição no tooltip do grafo — sem expor dados internos completos.
 */
function extractMemoryContentSummary(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const c = content as Record<string, unknown>;

  // Reflexão (reflection-agent.ts)
  if (typeof c["condition"] === "string") {
    return truncate(c["condition"], 80);
  }
  // Narrativa
  if (typeof c["narrative"] === "string") {
    return truncate(c["narrative"], 80);
  }
  // Genérico: tenta extrair qualquer campo de texto
  if (typeof c["title"] === "string") return truncate(c["title"], 80);
  if (typeof c["publicText"] === "string") return truncate(c["publicText"], 80);
  return "";
}
