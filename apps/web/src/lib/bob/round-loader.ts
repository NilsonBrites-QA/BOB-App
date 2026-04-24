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

export async function loadRoundData(
  season: number,
  round: number | null,
): Promise<LoadedRoundData> {
  if (!process.env.FOOTBALL_DATA_TOKEN) {
    return {
      source: "demo",
      fallbackReason: "missing-token",
      matches: demoMatches,
      assets: new Map(),
      meta: null,
    };
  }

  const resolvedRound = round ?? (await getCurrentRound().catch(() => null));
  if (!resolvedRound) {
    return {
      source: "demo",
      fallbackReason: "round-unavailable",
      matches: demoMatches,
      assets: new Map(),
      meta: null,
    };
  }

  try {
    const result = await fetchRoundMatchInputs(season, resolvedRound);
    return {
      source: "api",
      fallbackReason: null,
      matches: result.matches,
      assets: result.assets,
      meta: result.meta,
    };
  } catch (err) {
    console.error("[RoundLoader] Falha ao buscar dados reais:", err);
    return {
      source: "demo",
      fallbackReason: "provider-fallback",
      matches: demoMatches,
      assets: new Map(),
      meta: null,
    };
  }
}
