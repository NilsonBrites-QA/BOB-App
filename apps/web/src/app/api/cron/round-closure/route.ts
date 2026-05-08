/**
 * BOB — Cron: GET /api/cron/round-closure
 *
 * Motor de Reflexão Pós-Rodada.
 *
 * Pipeline:
 *   1. Auth via CRON_SECRET
 *   2. Busca a rodada DELIVERED mais recente cujos jogos TODOS terminaram
 *   3. Cruza as 5 Variações + Âncoras com os resultados reais (FINISHED)
 *   4. Calcula hit/miss rates por variação e por âncora
 *   5. Envia payload para LLM gerar narrativa honesta de reflexão
 *   6. Persiste tudo como RoundReflection (imutável — UNIQUE season+round)
 *   7. Marca a rodada como CLOSED
 *
 * Idempotência: @@unique(season, round) impede duplicatas.
 *   Se já existe reflexão → retorna 200 com { alreadyExists: true }.
 *
 * Requer: header Authorization: Bearer <CRON_SECRET>
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getFinishedMatchesGated, getFinishedMatches } from "@/lib/bob/connectors/football-data";
import { llmCascade } from "@/lib/bob/ai/llm-cascade";
import { resolveActiveSeasonYear } from "@/lib/bob/season";
import type { FDMatch } from "@/lib/bob/connectors/football-data";

// ─── Tipos internos ──────────────────────────────────────────────────────────

type PickRow = {
  id: string;
  match: string;
  result: "HOME" | "DRAW" | "AWAY";
  odd: number;
  isAnchor: boolean;
  position: number;
  actualResult: string | null;
  correct: boolean | null;
  variationCode: string;
  variationTitle: string;
};

type AnchorRow = {
  id: string;
  team: string;
  opponent: string;
  score: number;
  rank: number;
};

type VariationDetail = {
  code: string;
  title: string;
  totalPicks: number;
  correctPicks: number;
  hitRate: number;
  green: boolean;
  combinedOdd: number;
  picks: Array<{
    match: string;
    pick: string;
    actual: string;
    correct: boolean;
    odd: number;
  }>;
};

type AnchorDetail = {
  team: string;
  opponent: string;
  predicted: string;
  actual: string;
  correct: boolean;
  score: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Determina o resultado real de um jogo do football-data.org.
 */
function resolveOutcome(match: FDMatch): "HOME" | "DRAW" | "AWAY" | null {
  if (match.status !== "FINISHED") return null;
  const h = match.score.fullTime.home;
  const a = match.score.fullTime.away;
  if (h === null || a === null) return null;
  if (h > a) return "HOME";
  if (a > h) return "AWAY";
  return "DRAW";
}

/**
 * Tenta encontrar um jogo finalizado por nome dos times.
 */
function findMatchByTeams(
  matchLabel: string,
  finishedMatches: FDMatch[],
): FDMatch | null {
  const normalize = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  // Extrair nomes: "Flamengo x Palmeiras" → ["flamengo", "palmeiras"]
  const parts = matchLabel.split(/\s+(?:x|vs|×)\s+/i).map(normalize);
  if (parts.length < 2) return null;

  const [home, away] = parts;

  return (
    finishedMatches.find((m) => {
      const fdHome = normalize(m.homeTeam.name);
      const fdAway = normalize(m.awayTeam.name);
      return (
        (fdHome.includes(home!) || home!.includes(fdHome)) &&
        (fdAway.includes(away!) || away!.includes(fdAway))
      );
    }) ?? null
  );
}

/**
 * Gera a narrativa do BOB via LLM (com fallback heurístico).
 */
async function generateReflectionNarrative(
  season: number,
  round: number,
  variationDetails: VariationDetail[],
  anchorDetails: AnchorDetail[],
  totalHitRate: number,
  anchorHitRate: number,
): Promise<{ narrative: string; provider: string }> {
  const anchorsText = anchorDetails
    .map(
      (a) =>
        `  • ${a.team} (score ${a.score}) — previsto ${a.predicted}, real ${a.actual} → ${a.correct ? "✅ acerto" : "❌ erro"}`,
    )
    .join("\n");

  const variationsText = variationDetails
    .map(
      (v) =>
        `  ${v.code} "${v.title}" — ${v.correctPicks}/${v.totalPicks} acertos (${v.hitRate.toFixed(0)}%) → ${v.green ? "🟢 GREEN" : "🔴 RED"}\n` +
        v.picks
          .map(
            (p) =>
              `    • ${p.match}: pick ${p.pick}, real ${p.actual} → ${p.correct ? "✅" : "❌"}`,
          )
          .join("\n"),
    )
    .join("\n\n");

  const prompt = `Você é o BOB — analista quantitativo sênior do Brasileirão. PERSONALIDADE: direto, honesto, técnico, sem rodeios. Admite erros com elegância, celebra acertos sem arrogância.

Gere um parágrafo de reflexão pós-rodada (3-5 frases, máximo 400 caracteres). Seja ESPECÍFICO — cite times, odds, e o que aconteceu. Se errou, diga onde e por quê. Se acertou, reconheça sem exagero.

═══════════════════════════════════════
RODADA ${round} · TEMPORADA ${season}
═══════════════════════════════════════

TAXA GERAL DE ACERTO: ${totalHitRate.toFixed(1)}%
TAXA DAS ÂNCORAS: ${anchorHitRate.toFixed(1)}%

ÂNCORAS:
${anchorsText}

VARIAÇÕES:
${variationsText}
═══════════════════════════════════════

Responda APENAS o parágrafo de reflexão, sem markdown, sem aspas, sem "BOB diz:". Texto limpo e direto.`;

  const result = await llmCascade(prompt, { maxTokens: 300 });

  if (result.text) {
    return { narrative: result.text.trim(), provider: result.provider };
  }

  // Fallback heurístico
  const greenVars = variationDetails.filter((v) => v.green).length;
  const narrative =
    totalHitRate >= 80
      ? `Rodada ${round} de alta precisão: ${totalHitRate.toFixed(0)}% de acerto geral e ${anchorHitRate.toFixed(0)}% nas âncoras. ${greenVars} de ${variationDetails.length} variações fecharam no GREEN. O motor segue calibrado.`
      : totalHitRate >= 60
        ? `Rodada ${round} dentro da média: ${totalHitRate.toFixed(0)}% de acerto. As âncoras bateram ${anchorHitRate.toFixed(0)}%. Alguns picks fora das âncoras não se confirmaram — o motor ajustará os pesos.`
        : `Rodada ${round} abaixo do esperado: ${totalHitRate.toFixed(0)}% de acerto. ${variationDetails.length - greenVars} variações em RED. O futebol é caótico — o motor usa esses dados para recalibrar via ABQC.`;

  return { narrative, provider: "heuristic" };
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const t0 = Date.now();

  // ── 1. Auth ─────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("Authorization");
  const urlToken = new URL(request.url).searchParams.get("token");
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${secret}` && urlToken !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ── 2. Encontrar a rodada DELIVERED mais recente ───────────────────────
    const season = await resolveActiveSeasonYear();
    const { searchParams } = new URL(request.url);
    const forceRound = searchParams.get("round");

    const roundRow = forceRound
      ? await prisma.round.findFirst({
          where: {
            season: { year: season },
            number: parseInt(forceRound, 10),
            status: { in: ["DELIVERED", "CLOSED"] },
          },
          include: {
            anchors: true,
            variations: { include: { picks: true } },
          },
        })
      : await prisma.round.findFirst({
          where: {
            season: { year: season },
            status: "DELIVERED",
          },
          orderBy: { number: "desc" },
          include: {
            anchors: true,
            variations: { include: { picks: true } },
          },
        });

    if (!roundRow) {
      return NextResponse.json({
        ok: true,
        message: "Nenhuma rodada DELIVERED encontrada para fechar.",
        durationMs: Date.now() - t0,
      });
    }

    // ── 3. Verificar idempotência ─────────────────────────────────────────
    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM round_reflections WHERE season = $1 AND round = $2 LIMIT 1`,
      season,
      roundRow.number,
    );

    if (existing.length > 0) {
      return NextResponse.json({
        ok: true,
        alreadyExists: true,
        reflectionId: existing[0].id,
        season,
        round: roundRow.number,
        message: `Reflexão da rodada ${roundRow.number} já existe. Nenhum processamento feito.`,
        durationMs: Date.now() - t0,
      });
    }

    // ── 4. Buscar resultados reais ────────────────────────────────────────
    let finishedMatches: FDMatch[] = [];
    const gated = await getFinishedMatchesGated(200);
    if (gated) {
      finishedMatches = gated.matches;
    } else {
      try {
        const fallback = await getFinishedMatches(200);
        finishedMatches = fallback.matches;
      } catch {
        /* continua com o que tiver */
      }
    }

    if (finishedMatches.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "Sem jogos FINISHED disponíveis para cruzamento.",
        durationMs: Date.now() - t0,
      });
    }

    // ── 5. Verificar se TODOS os jogos da rodada terminaram ───────────────
    const allPicks = roundRow.variations.flatMap((v) => v.picks);
    const uniqueMatches = [...new Set(allPicks.map((p) => p.match))];

    let allFinished = true;
    const matchOutcomes = new Map<string, "HOME" | "DRAW" | "AWAY">();

    for (const matchLabel of uniqueMatches) {
      const fdMatch = findMatchByTeams(matchLabel, finishedMatches);
      if (!fdMatch) {
        allFinished = false;
        break;
      }
      const outcome = resolveOutcome(fdMatch);
      if (!outcome) {
        allFinished = false;
        break;
      }
      matchOutcomes.set(matchLabel, outcome);
    }

    if (!allFinished) {
      return NextResponse.json({
        ok: true,
        message: `Nem todos os jogos da rodada ${roundRow.number} terminaram (${matchOutcomes.size}/${uniqueMatches.length} finalizados). Tentará novamente no próximo ciclo.`,
        durationMs: Date.now() - t0,
      });
    }

    // ── 6. Calcular hits/misses por variação ──────────────────────────────
    const variationDetails: VariationDetail[] = [];
    let totalPicksGlobal = 0;
    let correctPicksGlobal = 0;

    for (const variation of roundRow.variations) {
      const picks: VariationDetail["picks"] = [];
      let varCorrect = 0;
      let combinedOdd = 1;

      for (const pick of variation.picks) {
        const actual = matchOutcomes.get(pick.match) ?? "UNKNOWN";
        const correct = actual === pick.result;
        if (correct) varCorrect++;
        combinedOdd *= pick.odd;

        picks.push({
          match: pick.match,
          pick: pick.result,
          actual,
          correct,
          odd: pick.odd,
        });

        // Atualizar pick no banco (actualResult + correct)
        await prisma.pick.update({
          where: { id: pick.id },
          data: {
            actualResult: actual,
            correct,
          },
        });
      }

      totalPicksGlobal += variation.picks.length;
      correctPicksGlobal += varCorrect;

      variationDetails.push({
        code: variation.code,
        title: variation.title,
        totalPicks: variation.picks.length,
        correctPicks: varCorrect,
        hitRate: variation.picks.length > 0 ? (varCorrect / variation.picks.length) * 100 : 0,
        green: varCorrect === variation.picks.length,
        combinedOdd: Number(combinedOdd.toFixed(2)),
        picks,
      });
    }

    // ── 7. Calcular hits/misses das âncoras ───────────────────────────────
    const anchorDetails: AnchorDetail[] = [];
    let anchorCorrect = 0;

    for (const anchor of roundRow.anchors) {
      // Âncora = time mandante favorito → previsto HOME
      const matchLabel = `${anchor.team} x ${anchor.opponent}`;
      const actual = matchOutcomes.get(matchLabel) ?? "UNKNOWN";
      const correct = actual === "HOME";
      if (correct) anchorCorrect++;

      anchorDetails.push({
        team: anchor.team,
        opponent: anchor.opponent,
        predicted: "HOME",
        actual,
        correct,
        score: anchor.score,
      });
    }

    const hitRate = totalPicksGlobal > 0 ? (correctPicksGlobal / totalPicksGlobal) * 100 : 0;
    const anchorHitRate = roundRow.anchors.length > 0
      ? (anchorCorrect / roundRow.anchors.length) * 100
      : 0;

    // ── 8. Gerar narrativa via LLM ────────────────────────────────────────
    const { narrative, provider } = await generateReflectionNarrative(
      season,
      roundRow.number,
      variationDetails,
      anchorDetails,
      hitRate,
      anchorHitRate,
    );

    // ── 9. Persistir reflexão (imutável) ──────────────────────────────────
    await prisma.$executeRawUnsafe(
      `INSERT INTO round_reflections
         (season, round, round_id, total_picks, correct_picks, hit_rate,
          total_anchors, correct_anchors, anchor_hit_rate,
          variations_detail, anchors_detail, bob_narrative, narrative_provider)
       VALUES
         ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13)`,
      season,
      roundRow.number,
      roundRow.id,
      totalPicksGlobal,
      correctPicksGlobal,
      Number(hitRate.toFixed(2)),
      roundRow.anchors.length,
      anchorCorrect,
      Number(anchorHitRate.toFixed(2)),
      JSON.stringify(variationDetails),
      JSON.stringify(anchorDetails),
      narrative,
      provider,
    );

    // ── 10. Marcar rodada como CLOSED ─────────────────────────────────────
    await prisma.round.update({
      where: { id: roundRow.id },
      data: { status: "CLOSED" },
    });

    console.info(
      `[round-closure] Rodada ${roundRow.number} fechada: ${hitRate.toFixed(1)}% acerto geral, ` +
      `${anchorHitRate.toFixed(1)}% âncoras, narrativa via ${provider}.`,
    );

    return NextResponse.json({
      ok: true,
      season,
      round: roundRow.number,
      totalPicks: totalPicksGlobal,
      correctPicks: correctPicksGlobal,
      hitRate: Number(hitRate.toFixed(2)),
      totalAnchors: roundRow.anchors.length,
      correctAnchors: anchorCorrect,
      anchorHitRate: Number(anchorHitRate.toFixed(2)),
      variationsGreen: variationDetails.filter((v) => v.green).length,
      variationsTotal: variationDetails.length,
      narrativeProvider: provider,
      narrativePreview: narrative.slice(0, 200),
      durationMs: Date.now() - t0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[round-closure]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
