/**
 * BOB — Cron endpoint: GET /api/cron/calibrate
 *
 * Executa a calibração de pesos pós-rodada (ABQC — Fase 12).
 * Deve ser chamado APÓS o backfill da rodada e o registro de resultados.
 *
 * Pipeline completo:
 *   1. Busca o resultado de backtest da rodada (backtestRound)
 *   2. Recupera os pesos ativos mais recentes do banco
 *   3. Aplica selfCalibrate() — algoritmo ABQC bayesiano
 *   4. Persiste novo snapshot de pesos (saveFactorWeightSnapshot)
 *   5. Executa Anti-Correlation Discovery (discoverAntiCorrelations)
 *
 * Query params:
 *   season (number, opcional) — ex: 2025
 *   round  (number, opcional) — ex: 10
 *
 * Requer: header Authorization: Bearer <CRON_SECRET>
 */

import { NextResponse }   from "next/server";
import { backtestRound }  from "@/lib/bob/engine/backtest";
import { selfCalibrate }  from "@/lib/bob/engine/calibrator";
import { discoverAntiCorrelations } from "@/lib/bob/engine/anti-correlation";
import { prisma } from "@/lib/db";
import { resolveActiveSeasonYear } from "@/lib/bob/season";
import {
  saveFactorWeightSnapshot,
  getLatestWeights,
} from "@/lib/bob/persist-weights";

export async function GET(request: Request) {
  // 1. Autenticação
  const authHeader = request.headers.get("Authorization");
  const secret     = process.env.CRON_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parâmetros
  const { searchParams } = new URL(request.url);
  const seasonParam = searchParams.get("season");
  const roundParam  = searchParams.get("round");

  const fallbackSeason = await resolveActiveSeasonYear();
  const season = seasonParam ? parseInt(seasonParam, 10) : fallbackSeason;

  if (Number.isNaN(season) || season < 2020) {
    return NextResponse.json(
      { error: "Temporada inválida." },
      { status: 400 },
    );
  }

  let round = roundParam ? parseInt(roundParam, 10) : NaN;

  if (!roundParam) {
    const latestClosedRound = await prisma.round.findFirst({
      where: {
        season: { year: season },
        status: "CLOSED",
      },
      orderBy: { number: "desc" },
      select: { number: true },
    });

    if (!latestClosedRound) {
      return NextResponse.json({
        ok: false,
        season,
        message: "Nenhuma rodada fechada disponível para calibração automática.",
      });
    }

    round = latestClosedRound.number;
  }

  if (Number.isNaN(round) || round < 1 || round > 38) {
    return NextResponse.json(
      { error: "Rodada inválida." },
      { status: 400 },
    );
  }

  try {
    // 3. Backtest da rodada (lê do banco — zero req de API)
    const roundResult = await backtestRound(season, round);

    if (!roundResult) {
      return NextResponse.json(
        {
          error: `Rodada ${season}/${round} não encontrada no banco ou sem picks com resultado registrado.`,
          hint:  "Execute /api/cron/backfill primeiro para popular a rodada.",
        },
        { status: 404 },
      );
    }

    // 4. Pesos ativos mais recentes
    const currentWeights = await getLatestWeights(season);

    // 5. Calibração ABQC
    const calibration = selfCalibrate(roundResult, currentWeights);

    // 6. Persistir snapshot (mesmo sem ajuste — registra a acurácia da rodada)
    await saveFactorWeightSnapshot(season, round, calibration);

    // 7. Anti-Correlation Discovery (lookback padrão: 10 rodadas)
    const antiCorrResult = await discoverAntiCorrelations(season, round);

    return NextResponse.json({
      ok:             true,
      season,
      round,
      wasAdjusted:    calibration.wasAdjusted,
      overallAccuracy: calibration.overallAccuracy,
      anchorAccuracy:  calibration.anchorAccuracy,
      samples:         calibration.samples,
      calibrationNotes: calibration.calibrationNotes,
      adjustments:     calibration.adjustments,
      newWeights:      calibration.newWeights,
      antiCorr: {
        pairsAnalyzed:   antiCorrResult.pairsAnalyzed,
        antiCorrFound:   antiCorrResult.antiCorrFound,
        updatedPatterns: antiCorrResult.updatedPatterns,
        newPatterns:     antiCorrResult.newPatterns,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno do servidor";
    console.error(`[calibrate] ${season}/R${round}:`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
