import { unstable_cache } from "next/cache";
import { demoMatches } from "@/lib/bob/demo-matches";
import { fetchRoundMatchInputs, getCurrentRound } from "@/lib/bob/connectors";
import type { FetchRoundResult } from "@/lib/bob/connectors";
import type { MatchInput } from "@/lib/bob/engine/scoring";

export type RoundFallbackReason =
  | "missing-token"
  | "round-unavailable"
  | "provider-fallback";

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
  return "Painel em modo demonstrativo: houve falha ao montar a leitura ao vivo desta rodada.";
}

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

    const resolvedRound = round ?? (await getCurrentRound().catch(() => null));
    if (!resolvedRound) {
      return {
        source: "demo",
        fallbackReason: "round-unavailable",
        matches: demoMatches,
        assetsEntries: [],
        meta: null,
      };
    }

    try {
      const result = await fetchRoundMatchInputs(season, resolvedRound);
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
        fallbackReason: "provider-fallback",
        matches: demoMatches,
        assetsEntries: [],
        meta: null,
      };
    }
  },
  ["round-data-v1"],
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
