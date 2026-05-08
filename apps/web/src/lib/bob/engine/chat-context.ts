/**
 * BOB — Chat Context Loader (Cache Persistente)
 *
 * Responsável por carregar e persistir dados factuais no banco para que
 * o LLM receba contexto REAL e não alucine informações.
 *
 * ─── Arquitetura ──────────────────────────────────────────────────────────────
 *
 *   1. Tenta ler do BD (chat_context_cache) — ~5ms
 *   2. Se cache válido → retorna imediatamente
 *   3. Se cache expirado → busca da API, persiste, retorna
 *   4. Se API falhar → retorna cache stale (melhor que nada)
 *
 * ─── TTLs ─────────────────────────────────────────────────────────────────────
 *
 *   standings_a:       4h  (classificação muda ~1x/rodada)
 *   standings_b:       4h
 *   current_round:     1h  (rodada muda ~1x/semana)
 *   finished_recent:   4h  (resultados mudam conforme jogos terminam)
 *   round_analysis_N:  ∞   (análise por rodada é imutável)
 */

import { prisma } from "@/lib/db";
import {
  getStandings,
  getSerieBStandings,
  getFinishedMatches,
} from "@/lib/bob/connectors/football-data";
import { getCurrentRound } from "@/lib/bob/connectors";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ChatFactualContext = {
  standingsA: string | null;
  standingsB: string | null;
  currentRound: number | null;
  finishedRecent: string | null;
  /** Timestamp da última atualização do contexto */
  lastUpdated: string;
  /** Quais caches estavam frescos vs stale */
  cacheStatus: Record<string, "fresh" | "stale" | "miss">;
};

// ─── TTLs em segundos ─────────────────────────────────────────────────────────

const TTL = {
  standings_a: 4 * 3600,      // 4 horas
  standings_b: 4 * 3600,      // 4 horas
  current_round: 1 * 3600,    // 1 hora
  finished_recent: 4 * 3600,  // 4 horas
} as const;

// ─── Helpers de Cache ─────────────────────────────────────────────────────────

type CacheRow = {
  id: string;
  cacheKey: string;
  data: unknown;
  season: number | null;
  round: number | null;
  ttlSeconds: number | null;
  createdAt: Date;
  updatedAt: Date;
};

async function readCache(key: string): Promise<CacheRow | null> {
  try {
    return await prisma.chatContextCache.findUnique({
      where: { cacheKey: key },
    });
  } catch {
    return null;
  }
}

function isCacheFresh(row: CacheRow | null, ttlSeconds: number): boolean {
  if (!row) return false;
  const ageMs = Date.now() - new Date(row.updatedAt).getTime();
  return ageMs < ttlSeconds * 1000;
}

async function writeCache(
  key: string,
  data: unknown,
  ttlSeconds: number | null,
  season?: number,
  round?: number,
): Promise<void> {
  try {
    await prisma.chatContextCache.upsert({
      where: { cacheKey: key },
      update: {
        data: data as object,
        ttlSeconds,
        season: season ?? null,
        round: round ?? null,
      },
      create: {
        cacheKey: key,
        data: data as object,
        ttlSeconds,
        season: season ?? null,
        round: round ?? null,
      },
    });
  } catch (err) {
    console.error(`[ChatContext] Falha ao salvar cache ${key}:`, err);
  }
}

// ─── Loaders individuais ──────────────────────────────────────────────────────

async function loadStandingsA(): Promise<{ data: string; status: "fresh" | "stale" | "miss" }> {
  const key = "standings_a";
  const cached = await readCache(key);

  if (isCacheFresh(cached, TTL.standings_a)) {
    return { data: cached!.data as string, status: "fresh" };
  }

  // Tentar atualizar da API
  try {
    const result = await getStandings();
    const table = result.standings.find((s) => s.type === "TOTAL")?.table ?? [];
    if (table.length === 0 && cached) {
      return { data: cached.data as string, status: "stale" };
    }

    const formatted = table.map(
      (t) =>
        `${t.position}. ${t.team.name} | ${t.points}pts | ` +
        `${t.won}V ${t.draw}E ${t.lost}D | GF:${t.goalsFor} GC:${t.goalsAgainst} | ` +
        `Forma: ${t.form ?? "—"}`,
    ).join("\n");

    const text = `CLASSIFICAÇÃO BRASILEIRÃO SÉRIE A 2026 (${table.length} times):\n${formatted}`;
    await writeCache(key, text, TTL.standings_a, 2026);
    return { data: text, status: "fresh" };
  } catch {
    if (cached) return { data: cached.data as string, status: "stale" };
    return { data: "", status: "miss" };
  }
}

async function loadStandingsB(): Promise<{ data: string; status: "fresh" | "stale" | "miss" }> {
  const key = "standings_b";
  const cached = await readCache(key);

  if (isCacheFresh(cached, TTL.standings_b)) {
    return { data: cached!.data as string, status: "fresh" };
  }

  try {
    const result = await getSerieBStandings();
    if (!result) {
      if (cached) return { data: cached.data as string, status: "stale" };
      return { data: "", status: "miss" };
    }

    const table = result.standings.find((s) => s.type === "TOTAL")?.table ?? [];
    const formatted = table.map(
      (t) =>
        `${t.position}. ${t.team.name} | ${t.points}pts | ` +
        `${t.won}V ${t.draw}E ${t.lost}D`,
    ).join("\n");

    const text = `CLASSIFICAÇÃO BRASILEIRÃO SÉRIE B 2026 (${table.length} times):\n${formatted}`;
    await writeCache(key, text, TTL.standings_b, 2026);
    return { data: text, status: "fresh" };
  } catch {
    if (cached) return { data: cached.data as string, status: "stale" };
    return { data: "", status: "miss" };
  }
}

async function loadCurrentRound(): Promise<{ data: number | null; status: "fresh" | "stale" | "miss" }> {
  const key = "current_round";
  const cached = await readCache(key);

  if (isCacheFresh(cached, TTL.current_round)) {
    return { data: cached!.data as number, status: "fresh" };
  }

  try {
    const round = await getCurrentRound();
    if (round !== null) {
      await writeCache(key, round, TTL.current_round, 2026, round);
      return { data: round, status: "fresh" };
    }
    if (cached) return { data: cached.data as number, status: "stale" };
    return { data: null, status: "miss" };
  } catch {
    if (cached) return { data: cached.data as number, status: "stale" };
    return { data: null, status: "miss" };
  }
}

async function loadFinishedRecent(): Promise<{ data: string; status: "fresh" | "stale" | "miss" }> {
  const key = "finished_recent";
  const cached = await readCache(key);

  if (isCacheFresh(cached, TTL.finished_recent)) {
    return { data: cached!.data as string, status: "fresh" };
  }

  try {
    const result = await getFinishedMatches(60);
    const rows = result.matches
      .filter((m) => m.score.fullTime.home !== null)
      .slice(0, 60)
      .map((m) => {
        const scoreStr =
          m.score.fullTime.home !== null
            ? `${m.score.fullTime.home}–${m.score.fullTime.away}`
            : "—";
        const date = new Date(m.utcDate).toLocaleDateString("pt-BR");
        return `${m.homeTeam.shortName ?? m.homeTeam.name} ${scoreStr} ${m.awayTeam.shortName ?? m.awayTeam.name} (${date} | R${m.matchday})`;
      });

    const text = `RESULTADOS RECENTES (${rows.length} jogos):\n${rows.join("\n")}`;
    await writeCache(key, text, TTL.finished_recent, 2026);
    return { data: text, status: "fresh" };
  } catch {
    if (cached) return { data: cached.data as string, status: "stale" };
    return { data: "", status: "miss" };
  }
}

// ─── Loader principal ─────────────────────────────────────────────────────────

/**
 * Carrega TODOS os contextos factuais necessários para o chat.
 * Usa cache persistente do BD — chamadas às APIs só ocorrem quando o TTL expira.
 *
 * Performance esperada:
 *   - Cache fresh: ~10ms (3 queries BD em paralelo)
 *   - Cache miss:  ~3-5s (primeira vez — busca das APIs e persiste)
 *   - Cache stale: ~10ms (retorna dado antigo, atualiza em background)
 */
export async function loadChatContext(): Promise<ChatFactualContext> {
  const now = new Date().toISOString();
  const cacheStatus: Record<string, "fresh" | "stale" | "miss"> = {};

  // Carregar tudo em paralelo
  const [standingsA, standingsB, currentRound, finishedRecent] = await Promise.all([
    loadStandingsA().catch(() => ({ data: "", status: "miss" as const })),
    loadStandingsB().catch(() => ({ data: "", status: "miss" as const })),
    loadCurrentRound().catch(() => ({ data: null, status: "miss" as const })),
    loadFinishedRecent().catch(() => ({ data: "", status: "miss" as const })),
  ]);

  cacheStatus.standings_a = standingsA.status;
  cacheStatus.standings_b = standingsB.status;
  cacheStatus.current_round = currentRound.status;
  cacheStatus.finished_recent = finishedRecent.status;

  return {
    standingsA: standingsA.data || null,
    standingsB: standingsB.data || null,
    currentRound: currentRound.data,
    finishedRecent: finishedRecent.data || null,
    lastUpdated: now,
    cacheStatus,
  };
}

/**
 * Formata o contexto factual como bloco de texto para injeção no system prompt.
 * O LLM recebe esses dados como FATOS — não como sugestões.
 */
export function formatContextForPrompt(ctx: ChatFactualContext): string {
  const parts: string[] = [];
  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const timeStr = now.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

  parts.push(`DATA ATUAL: ${dateStr} às ${timeStr} (horário de Brasília)`);
  parts.push(`TEMPORADA: Brasileirão 2026`);

  if (ctx.currentRound !== null) {
    parts.push(`RODADA ATUAL: ${ctx.currentRound}`);
  }

  if (ctx.standingsA) {
    parts.push("");
    parts.push(ctx.standingsA);
  }

  if (ctx.standingsB) {
    parts.push("");
    parts.push(ctx.standingsB);
  }

  if (ctx.finishedRecent) {
    parts.push("");
    parts.push(ctx.finishedRecent);
  }

  // Indicadores de qualidade do cache
  const staleKeys = Object.entries(ctx.cacheStatus)
    .filter(([, v]) => v === "stale")
    .map(([k]) => k);
  if (staleKeys.length > 0) {
    parts.push(`\n⚠️ Dados possivelmente desatualizados: ${staleKeys.join(", ")}. Informe o usuário se relevante.`);
  }

  return parts.join("\n");
}
