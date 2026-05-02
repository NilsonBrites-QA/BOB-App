/**
 * BOB — Cron Maestro: GET /api/cron/brain-weekly
 *
 * Executa o pipeline completo do BOB de forma autônoma.
 * GARANTIA: nunca retorna 500. Cada etapa falha individualmente com log.
 *
 * Chamar no cron-job.org:
 *   URL: https://bob-app-kappa.vercel.app/api/cron/brain-weekly
 *   Header: Authorization: Bearer <CRON_SECRET>
 *
 * Diagnóstico rápido (sem rodar pipeline):
 *   ?ping=1  → testa apenas DB + variáveis de ambiente
 *   ?round=N → força rodada específica
 */

export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("Authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const log: string[] = [];
  const errors: string[] = [];

  const info = (msg: string) => { console.info(`[brain-weekly] ${msg}`); log.push(msg); };
  const warn = (msg: string) => { console.warn(`[brain-weekly] WARN: ${msg}`); errors.push(msg); };

  const { searchParams } = new URL(request.url);

  // ── Ping mode: diagnóstico sem pipeline ─────────────────────────────────
  if (searchParams.get("ping") === "1") {
    let dbOk = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
      info("DB ping OK");
    } catch (e) {
      warn(`DB ping falhou: ${e instanceof Error ? e.message : String(e)}`);
    }
    return NextResponse.json({
      ok: dbOk,
      ping: true,
      env: {
        CRON_SECRET:            !!secret,
        DATABASE_URL:           !!process.env.DATABASE_URL,
        ANTHROPIC_API_KEY:      !!process.env.ANTHROPIC_API_KEY,
        FOOTBALL_DATA_API_KEY:  !!process.env.FOOTBALL_DATA_API_KEY,
        THE_ODDS_API_KEY:       !!process.env.THE_ODDS_API_KEY,
        OPENAI_API_KEY:         !!process.env.OPENAI_API_KEY,
      },
      log,
      errors,
    });
  }

  // ── Step 1: Temporada ────────────────────────────────────────────────────
  let season = new Date().getFullYear();
  try {
    const { resolveActiveSeasonYear } = await import("@/lib/bob/season");
    season = await resolveActiveSeasonYear();
    info(`Temporada ativa: ${season}`);
  } catch (e) {
    warn(`resolveActiveSeasonYear falhou (usando ${season}): ${e instanceof Error ? e.message : String(e)}`);
  }

  // Garantir que a Season exista no banco
  try {
    await prisma.season.upsert({
      where:  { year: season },
      create: { year: season, active: true },
      update: {},
    });
    info(`Season ${season} garantida no banco`);
  } catch (e) {
    warn(`Upsert Season falhou: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Step 2: Detectar rodada ──────────────────────────────────────────────
  let targetRound = 1;
  const roundParam = searchParams.get("round");

  if (roundParam && !Number.isNaN(parseInt(roundParam, 10))) {
    targetRound = parseInt(roundParam, 10);
    info(`Rodada explícita: ${targetRound}`);
  } else {
    try {
      const nextRound = await prisma.round.findFirst({
        where:   { season: { year: season }, status: { in: ["READY", "DRAFT"] } },
        orderBy: { number: "asc" },
        select:  { number: true },
      });

      if (nextRound) {
        targetRound = nextRound.number;
        info(`Rodada do banco: ${targetRound}`);
      } else {
        const { getCurrentRound } = await import("@/lib/bob/connectors");
        const apiRound = await getCurrentRound().catch(() => null);
        if (apiRound) {
          targetRound = apiRound;
          info(`Rodada da API: ${targetRound}`);
        } else {
          const last = await prisma.round.findFirst({
            where:   { season: { year: season } },
            orderBy: { number: "desc" },
            select:  { number: true },
          }).catch(() => null);
          targetRound = Math.min(38, Math.max(1, (last?.number ?? 0) + 1));
          info(`Rodada inferida: ${targetRound}`);
        }
      }
    } catch (e) {
      warn(`Detecção de rodada falhou: ${e instanceof Error ? e.message : String(e)}`);
      info(`Usando rodada padrão: ${targetRound}`);
    }
  }

  // ── Step 3: Idempotência ─────────────────────────────────────────────────
  let roundDbId: string | null = null;
  let shouldGenerate = true;

  try {
    const existing = await prisma.round.findFirst({
      where:  { season: { year: season }, number: targetRound, status: { notIn: ["SUPERSEDED"] } },
      select: { id: true, status: true },
    });
    if (existing?.status === "DELIVERED") {
      shouldGenerate = false;
      roundDbId = existing.id;
      info(`Rodada ${targetRound} já entregue. Pulando geração.`);
    } else if (existing) {
      roundDbId = existing.id;
      info(`Rodada ${targetRound} existe (${existing.status}). Regenerando.`);
    }
  } catch (e) {
    warn(`Verificação idempotência falhou: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Step 4: Fetch + Score + Variações ───────────────────────────────────
  let anchorsCount = 0;

  if (shouldGenerate) {
    try {
      info(`Buscando dados da rodada ${season}/${targetRound}...`);

      const { fetchRoundMatchInputs } = await import("@/lib/bob/connectors");
      const { matches, meta } = await fetchRoundMatchInputs(season, targetRound);
      info(`${matches.length} jogos. Odds: ${meta.integrations.odds}`);

      if (matches.length === 0) {
        warn(`Nenhum jogo encontrado para rodada ${targetRound}`);
      } else {
        const { scoreMatch, selectAnchorsFromScored, generateVariations } = await import("@/lib/bob/engine");
        const scored   = matches.map((m) => scoreMatch(m));
        const anchors  = selectAnchorsFromScored(scored);
        anchorsCount   = anchors.length;
        info(`${anchorsCount} âncoras selecionadas`);

        const anchorSet = new Set(anchors.map((a) => a.id));
        const pool      = scored.filter((m) => !anchorSet.has(m.id));
        const { variations } = generateVariations({ anchors, pool });
        info(`${variations.length} variações geradas`);

        const { saveRound } = await import("@/lib/bob/persist");
        const saved = await saveRound({
          season,
          round:   targetRound,
          anchors,
          variations,
          source:  "football-data",
        });
        roundDbId = saved.roundDbId;
        info(`Rodada salva: ${roundDbId}`);
      }
    } catch (e) {
      warn(`Pipeline de geração falhou: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── Step 5: Reflexão cognitiva ───────────────────────────────────────────
  let reflectionResult = null;
  const prevRound = targetRound - 1;

  if (prevRound >= 1) {
    try {
      info(`Reflexão da rodada ${prevRound}...`);
      const { selfReflect } = await import("@/lib/bob/ai/self-reflection");
      reflectionResult = await selfReflect(season, prevRound);
      if (reflectionResult) {
        info(`Reflexão OK — acurácia: ${(reflectionResult.accuracy * 100).toFixed(1)}%`);
      } else {
        info(`Sem dados para reflexão da rodada ${prevRound}`);
      }
    } catch (e) {
      warn(`Reflexão falhou: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── Step 6: Calibração ABQC ─────────────────────────────────────────────
  let calibrationResult = null;

  if (prevRound >= 1) {
    try {
      info(`Calibração ABQC rodada ${prevRound}...`);
      const { backtestRound }                           = await import("@/lib/bob/engine/backtest");
      const { selfCalibrate }                           = await import("@/lib/bob/engine/calibrator");
      const { saveFactorWeightSnapshot, getLatestWeights } = await import("@/lib/bob/persist-weights");

      const roundResult = await backtestRound(season, prevRound);
      if (roundResult && roundResult.totalPicks > 0) {
        const weights     = await getLatestWeights(season);
        const calibration = selfCalibrate(roundResult, weights);
        await saveFactorWeightSnapshot(season, prevRound, calibration);
        calibrationResult = {
          wasAdjusted:     calibration.wasAdjusted,
          overallAccuracy: calibration.overallAccuracy,
          anchorAccuracy:  calibration.anchorAccuracy,
        };
        info(`ABQC: adj=${calibration.wasAdjusted} acc=${(calibration.overallAccuracy * 100).toFixed(1)}%`);
      } else {
        info(`Sem picks com resultado para calibrar rodada ${prevRound}`);
      }
    } catch (e) {
      warn(`Calibração falhou: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const elapsedMs = Date.now() - startedAt;
  info(`Pipeline completo em ${elapsedMs}ms`);

  return NextResponse.json({
    ok:          true,
    season,
    round:       targetRound,
    roundId:     roundDbId,
    anchors:     anchorsCount,
    reflection:  reflectionResult
      ? {
          accuracy:   reflectionResult.accuracy,
          source:     reflectionResult.source,
          publicText: (reflectionResult.publicText ?? "").slice(0, 120),
        }
      : null,
    calibration: calibrationResult,
    elapsedMs,
    warnings:    errors.length > 0 ? errors : undefined,
    log,
  });
}
