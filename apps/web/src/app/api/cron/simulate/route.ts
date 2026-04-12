/**
 * BOB — Cron endpoint: GET /api/cron/simulate
 *
 * Executa UMA simulação retroativa cega por chamada (Sprint 4).
 * Processa rodadas do mais antigo para o mais recente, em ordem.
 *
 * Autonomia: BOB decide qual rodada simular — busca automaticamente
 * a próxima rodada com picks marcados que ainda não tem simulation_result.
 *
 * Pipeline por execução:
 *   1. Autenticação via Bearer token
 *   2. findNextRoundToSimulate() — descobre a próxima rodada pendente
 *   3. Recupera pesos ativos mais recentes do banco
 *   4. blindSimulateRound() — calcula métricas, calibra pesos, persiste resultado
 *   5. Retorna resumo da simulação (para log do Vercel/cron scheduler)
 *
 * Pode ser chamado sem parâmetros (modo autônomo) OU com ?season=&round=
 * para forçar uma rodada específica.
 *
 * Requer: header Authorization: Bearer <CRON_SECRET>
 */

import { NextResponse } from "next/server";
import {
  blindSimulateRound,
  findNextRoundToSimulate,
  getSimulationProgress,
} from "@/lib/bob/engine/blind-simulation";
import { getLatestWeights } from "@/lib/bob/persist-weights";

export async function GET(request: Request) {
  // ── 1. Autenticação ──────────────────────────────────────────────────────
  const authHeader = request.headers.get("Authorization");
  const secret     = process.env.CRON_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Parâmetros (opcionais) ────────────────────────────────────────────
  const { searchParams } = new URL(request.url);
  const seasonParam = searchParams.get("season");
  const roundParam  = searchParams.get("round");

  let targetSeason: number | null = null;
  let targetRound:  number | null = null;

  if (seasonParam && roundParam) {
    const s = parseInt(seasonParam, 10);
    const r = parseInt(roundParam, 10);

    if (isNaN(s) || isNaN(r) || s < 2020 || r < 1 || r > 38) {
      return NextResponse.json(
        { error: "Parâmetros inválidos. season ≥ 2020 e 1 ≤ round ≤ 38." },
        { status: 400 },
      );
    }

    targetSeason = s;
    targetRound  = r;
  }

  try {
    // ── 3. Descobrir rodada a simular ─────────────────────────────────────
    let season: number;
    let round:  number;

    if (targetSeason !== null && targetRound !== null) {
      // Modo forçado — simula a rodada especificada
      season = targetSeason;
      round  = targetRound;
    } else {
      // Modo autônomo — próxima rodada pendente
      const next = await findNextRoundToSimulate();

      if (!next) {
        const progress = await getSimulationProgress();
        return NextResponse.json({
          status:  "idle",
          message: "Nenhuma rodada pendente de simulação.",
          progress,
        });
      }

      season = next.season;
      round  = next.round;
    }

    // ── 4. Carregar pesos ativos mais recentes ────────────────────────────
    const currentWeights = await getLatestWeights(season);

    // ── 5. Executar simulação cega ────────────────────────────────────────
    const result = await blindSimulateRound(season, round, currentWeights);

    // ── 6. Progresso geral atualizado ─────────────────────────────────────
    const progress = await getSimulationProgress(season);

    // ── 7. Resposta ───────────────────────────────────────────────────────
    return NextResponse.json({
      status:   result.alreadyExists ? "skipped" : "simulated",
      season,
      round,
      summary: {
        totalPicks:    result.totalPicks,
        correctPicks:  result.correctPicks,
        accuracy:      result.totalPicks > 0
          ? Math.round((result.correctPicks / result.totalPicks) * 1000) / 10
          : 0,
        anchorCount:    result.anchorCount,
        anchorsCorrect: result.anchorsCorrect,
        variationsWon:  result.variations.filter((v) => v.won).length,
        bestOddProjected: result.bestOddProj,
        bestOddReal:      result.bestOddReal,
      },
      notes:    result.notes,
      progress,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno desconhecido.";
    console.error("[cron/simulate]", message);

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
