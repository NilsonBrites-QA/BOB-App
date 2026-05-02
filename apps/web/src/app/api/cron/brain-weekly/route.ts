/**
 * BOB — Cron Maestro: GET /api/cron/brain-weekly
 *
 * Executa o pipeline completo do BOB de forma autônoma:
 *   1. Detecta a rodada atual do Brasileirão
 *   2. Busca dados (football-data.org + OddsPapi/Betano)
 *   3. Pontua os jogos com o motor de 15 fatores
 *   4. Gera as 5 variações via beam-search
 *   5. Persiste no banco (idempotente)
 *   6. Gera reflexão cognitiva (Claude + GPT-4o)
 *   7. Executa calibração ABQC (se houver rodada fechada anterior)
 *
 * Chamar no cron-job.org:
 *   URL: https://bob-app-kappa.vercel.app/api/cron/brain-weekly
 *   Header: Authorization: Bearer <CRON_SECRET>
 *   Frequência: Toda terça-feira às 08:00 (pré-rodada) + após rodada
 *
 * Requer: Authorization: Bearer <CRON_SECRET>
 */

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel max para plano Hobby

import { NextResponse } from "next/server";
import { fetchRoundMatchInputs }    from "@/lib/bob/connectors";
import { scoreMatch, selectAnchorsFromScored, generateVariations } from "@/lib/bob/engine";
import { saveRound }                from "@/lib/bob/persist";
import { resolveActiveSeasonYear }  from "@/lib/bob/season";
import { selfReflect }              from "@/lib/bob/ai/self-reflection";
import { backtestRound }            from "@/lib/bob/engine/backtest";
import { selfCalibrate }            from "@/lib/bob/engine/calibrator";
import { saveFactorWeightSnapshot, getLatestWeights } from "@/lib/bob/persist-weights";
import { prisma }                   from "@/lib/db";

export async function GET(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("Authorization");
  const secret     = process.env.CRON_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const log: string[] = [];

  const info = (msg: string) => {
    console.info(`[brain-weekly] ${msg}`);
    log.push(msg);
  };

  try {
    // ── 1. Detectar temporada e rodada ──────────────────────────────────────
    const season = await resolveActiveSeasonYear();
    info(`Temporada ativa: ${season}`);

    // Garantir que a Season exista no banco (upsert seguro)
    await prisma.season.upsert({
      where: { year: season },
      create: { year: season, active: true },
      update: {},
    });

    const { searchParams } = new URL(request.url);
    const roundParam = searchParams.get("round");

    // Se rodada foi passada explicitamente, usar; senão detectar automaticamente
    let targetRound: number;
    if (roundParam) {
      targetRound = parseInt(roundParam, 10);
      info(`Rodada explícita: ${targetRound}`);
    } else {
      // Buscar a próxima rodada READY ou DRAFT no banco
      const nextRound = await prisma.round.findFirst({
        where: {
          season: { year: season },
          status: { in: ["READY", "DRAFT"] },
        },
        orderBy: { number: "asc" },
        select:  { number: true },
      }).catch(() => null);

      if (nextRound) {
        targetRound = nextRound.number;
        info(`Rodada detectada do banco: ${targetRound}`);
      } else {
        // Fallback: perguntar à API qual é a rodada atual
        const { getCurrentRound } = await import("@/lib/bob/connectors");
        const apiRound = await getCurrentRound().catch(() => null);
        if (apiRound) {
          targetRound = apiRound;
          info(`Rodada detectada via API: ${targetRound}`);
        } else {
          // Último recurso: última rodada + 1
          const lastRound = await prisma.round.findFirst({
            where:   { season: { year: season } },
            orderBy: { number: "desc" },
            select:  { number: true },
          }).catch(() => null);
          targetRound = (lastRound?.number ?? 0) + 1;
          if (targetRound > 38) targetRound = 1;
          info(`Rodada inferida: ${targetRound}`);
        }
      }
    }

    // ── 2. Checar se a rodada já foi entregue (idempotência) ─────────────────
    const existingRound = await prisma.round.findFirst({
      where: {
        season: { year: season },
        number: targetRound,
        status: { notIn: ["SUPERSEDED"] },
      },
      select: { id: true, status: true },
    });

    if (existingRound && existingRound.status === "DELIVERED") {
      info(`Rodada ${targetRound} já entregue. Pulando geração.`);
      // Mesmo assim, executar reflexão e calibração se tiver nova rodada fechada
    }

    // ── 3. Fetch de dados (football-data + odds) ──────────────────────────────
    let roundDbId: string | null = existingRound?.id ?? null;
    let anchorsCount = 0;

    if (!existingRound || existingRound.status === "READY") {
      info(`Buscando dados da rodada ${season}/${targetRound}...`);

      const { matches, meta } = await fetchRoundMatchInputs(season, targetRound);
      info(`${matches.length} jogos carregados. Odds source: ${meta.integrations.odds}`);

      if (matches.length === 0) {
        info("Nenhum jogo encontrado — abortando geração.");
        return NextResponse.json({
          ok: false,
          reason: "no_matches",
          season,
          round: targetRound,
          log,
        });
      }

      // ── 4. Pontuar e selecionar âncoras ──────────────────────────────────
      const scored    = matches.map((m) => scoreMatch(m));
      const anchors   = selectAnchorsFromScored(scored);
      anchorsCount    = anchors.length;
      info(`${anchorsCount} âncoras selecionadas`);

      const anchorSet = new Set(anchors.map((a) => a.id));
      const pool      = scored.filter((m) => !anchorSet.has(m.id));
      const variationsResult = generateVariations({ anchors, pool });
      const variations = variationsResult.variations ?? [];
      info(`${variations.length} variações geradas`);

      // ── 6. Persistir no banco ──────────────────────────────────────────────
      const saved = await saveRound({
        season,
        round:      targetRound,
        anchors,
        variations,
        source:     "football-data",
      });
      roundDbId = saved.roundDbId;
      info(`Rodada salva: ${roundDbId}`);
    } else {
      info(`Rodada ${targetRound} já no banco (${existingRound.status}). Pulando geração.`);
    }

    // ── 7. Reflexão cognitiva (Claude + GPT-4o) ───────────────────────────────
    // Executa sobre a rodada ANTERIOR (que já foi jogada e tem resultados)
    const prevRound = targetRound - 1;
    let reflectionResult = null;

    if (prevRound >= 1) {
      info(`Iniciando auto-reflexão da rodada ${season}/${prevRound}...`);
      try {
        reflectionResult = await selfReflect(season, prevRound);
        if (reflectionResult) {
          info(`Reflexão gerada (source: ${reflectionResult.source}) — acurácia: ${(reflectionResult.accuracy * 100).toFixed(1)}%`);
        } else {
          info(`Sem dados suficientes para reflexão da rodada ${prevRound}.`);
        }
      } catch (err) {
        info(`Reflexão falhou: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ── 8. Calibração ABQC automática ─────────────────────────────────────────
    let calibrationResult = null;

    if (prevRound >= 1) {
      info(`Iniciando calibração ABQC da rodada ${season}/${prevRound}...`);
      try {
        const roundResult = await backtestRound(season, prevRound);
        if (roundResult && roundResult.totalPicks > 0) {
          const currentWeights = await getLatestWeights(season);
          const calibration    = selfCalibrate(roundResult, currentWeights);
          await saveFactorWeightSnapshot(season, prevRound, calibration);
          calibrationResult    = {
            wasAdjusted:     calibration.wasAdjusted,
            overallAccuracy: calibration.overallAccuracy,
            anchorAccuracy:  calibration.anchorAccuracy,
          };
          info(`ABQC: wasAdjusted=${calibration.wasAdjusted} | acc=${(calibration.overallAccuracy * 100).toFixed(1)}%`);
        } else {
          info(`Sem picks com resultado para calibrar rodada ${prevRound}.`);
        }
      } catch (err) {
        info(`Calibração falhou: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const elapsedMs = Date.now() - startedAt;
    info(`Pipeline completo em ${elapsedMs}ms`);

    return NextResponse.json({
      ok:      true,
      season,
      round:   targetRound,
      roundId: roundDbId,
      anchors: anchorsCount,
      reflection: reflectionResult
        ? {
            accuracy:  reflectionResult.accuracy,
            source:    reflectionResult.source,
            publicText: reflectionResult.publicText.slice(0, 120),
          }
        : null,
      calibration: calibrationResult,
      elapsedMs,
      log,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[brain-weekly]", err);
    return NextResponse.json(
      { ok: false, error: message, log },
      { status: 500 }
    );
  }
}
