/**
 * Cron: pré-computa análise LLM das variações da rodada atual.
 *
 * Fluxo:
 *   1. Auth via CRON_SECRET
 *   2. Carrega rodada (season+round atuais ou via query)
 *   3. Roda motor → gera 5 variações
 *   4. Chama judgeVariations() (LLM cascade ou heurística)
 *   5. Persiste em VariationJudgement (upsert por season+round)
 *   6. Invalida cache da página /variacoes
 *
 * Query opcional: ?season=2026&round=12
 *
 * Requer: Authorization: Bearer <CRON_SECRET>
 */

import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { scoreMatch, selectAnchorsFromScored, generateVariations } from "@/lib/bob/engine";
import { judgeVariations, type VariationSnapshot } from "@/lib/bob/engine/variation-judge";
import { loadRoundData } from "@/lib/bob/round-loader";

export const runtime = "nodejs";
export const maxDuration = 60; // permite até 60s de execução (LLM pode demorar)

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  const urlToken = req.nextUrl.searchParams.get("token");
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${secret}` && urlToken !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Resolver season/round ─────────────────────────────────────────────────
  const seasonParam = req.nextUrl.searchParams.get("season");
  const roundParam = req.nextUrl.searchParams.get("round");
  const season = seasonParam ? parseInt(seasonParam, 10) : new Date().getFullYear();
  const requestedRound = roundParam ? parseInt(roundParam, 10) : null;

  const startedAt = Date.now();

  try {
    // ── Carregar dados da rodada ────────────────────────────────────────────
    const roundData = await loadRoundData(season, requestedRound);

    if (roundData.matches.length === 0) {
      return NextResponse.json(
        { ok: false, reason: "no-matches", season, round: requestedRound },
        { status: 200 },
      );
    }

    const effectiveRound =
      roundData.source === "api" && roundData.meta ? roundData.meta.round : (requestedRound ?? 0);

    // ── Rodar motor ──────────────────────────────────────────────────────────
    const allScored = roundData.matches.map(scoreMatch);
    const anchors = selectAnchorsFromScored(allScored);
    const anchorIds = new Set(anchors.map((a) => a.id));
    const pool = allScored.filter((m) => !anchorIds.has(m.id));
    const variationsResult = generateVariations({ anchors, pool });

    // ── Snapshots para o juiz ───────────────────────────────────────────────
    const snapshots: VariationSnapshot[] = variationsResult.variations.map((v) => ({
      id: v.id,
      combinedOdd: v.combinedOdd,
      legCount: v.legCount,
      legs: v.legs.map((l) => ({
        matchId: l.matchId,
        match: l.match,
        pickOutcome: l.pickOutcome,
        pickOdd: l.pickOdd,
        isAnchor: l.isAnchor,
      })),
    }));

    // ── Chamar LLM cascade (sem timeout do SSR — aqui é cron, pode demorar) ─
    const judgeResult = await judgeVariations(snapshots, anchors, pool);

    // ── Persistir no DB ──────────────────────────────────────────────────────
    const payload = {
      enrichments: judgeResult.enrichments,
      replacements: judgeResult.replacements,
      anchorIds: anchors.map((a) => a.id),
      generatedAt: new Date().toISOString(),
    };

    await prisma.variationJudgement.upsert({
      where: { season_round: { season, round: effectiveRound } },
      create: {
        season,
        round: effectiveRound,
        provider: judgeResult.provider,
        payload,
      },
      update: {
        provider: judgeResult.provider,
        payload,
      },
    });

    // ── Invalidar cache ─────────────────────────────────────────────────────
    revalidateTag(`round-data`);
    revalidatePath("/variacoes");

    const elapsedMs = Date.now() - startedAt;
    return NextResponse.json({
      ok: true,
      season,
      round: effectiveRound,
      provider: judgeResult.provider,
      enrichments: judgeResult.enrichments.length,
      replacementsProposed: judgeResult.replacements.length,
      replacementsApproved: judgeResult.replacements.filter((r) => r.approved).length,
      elapsedMs,
    });
  } catch (err) {
    console.error("[Cron/JudgeVariations] erro:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
