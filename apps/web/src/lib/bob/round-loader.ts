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
import { fetchRoundMatchInputs, getCurrentRound } from "@/lib/bob/connectors";
import type { FetchRoundResult } from "@/lib/bob/connectors";
import type { MatchInput } from "@/lib/bob/engine/scoring";
import { prisma } from "@/lib/db";

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
      source: "api";
      fallbackReason: null;
      matches: MatchInput[];
      assets: FetchRoundResult["assets"];
      meta: FetchRoundResult["meta"];
    }
  | {
      source: "demo";
      fallbackReason: RoundFallbackReason;
      matches: MatchInput[];
      assets: FetchRoundResult["assets"];
      meta: null;
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

/**
 * Resolve a rodada atual do Brasileirão usando cascata de 3 níveis.
 *
 * Chamada APENAS quando `paramRound` é null (entrada sem parâmetro).
 * Cada nível só é tentado se o anterior falhar.
 *
 * L1 (API Gated):
 *   - Chama getCurrentRound() do connectors/index.ts
 *   - Internamente usa detectNextOpenRound() + ponteiro getCurrentMatchday()
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
  // getCurrentRound() já implementa a lógica de drift detection.
  // O cache ISR do Next.js (1h) evita chamadas repetidas à API.
  // Se o token não está configurado, pula direto para L2.
  if (process.env.FOOTBALL_DATA_TOKEN) {
    try {
      const apiRound = await getCurrentRound();
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
    // Antes: `round ?? getCurrentRound()` — sem fallback DB, quebrava em demo.
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

    try {
      const result = await fetchRoundMatchInputs(season, resolvedRound);

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
    serialized.assetsEntries as Array<[string, FetchRoundResult["assets"] extends Map<string, infer V> ? V : never]>,
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
  return {
    source: "demo",
    fallbackReason: serialized.fallbackReason as RoundFallbackReason,
    matches: serialized.matches,
    assets,
    meta: null,
  };
}
