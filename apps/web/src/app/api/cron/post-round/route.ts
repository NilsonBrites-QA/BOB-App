/**
 * BOB — Cron pós-rodada: GET /api/cron/post-round
 *
 * Executado 24h após o último jogo da rodada.
 * Registra resultados reais de todos os picks e fecha a rodada.
 *
 * Pipeline:
 *   1. Recebe season + round (ou auto-detecta última rodada aberta no DB)
 *   2. Busca resultados finais via football-data.org
 *   3. Compara com picks no DB e marca correct=true/false
 *   4. Fecha a rodada se todos os jogos estiverem encerrados
 *
 * Requer: Authorization: Bearer <CRON_SECRET>
 */

import { NextResponse }   from "next/server";
import { revalidatePath } from "next/cache";
import { getMatchesByMatchday } from "@/lib/bob/connectors/football-data";
import type { FDMatch } from "@/lib/bob/connectors/football-data";
import { markPickResult } from "@/lib/bob/persist";
import { prisma }         from "@/lib/db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resultado real do jogo */
function realResult(m: FDMatch): "HOME" | "DRAW" | "AWAY" | null {
  const h = m.score.fullTime.home;
  const a = m.score.fullTime.away;
  if (h === null || a === null) return null;
  if (h > a) return "HOME";
  if (h < a) return "AWAY";
  return "DRAW";
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  // Autenticação
  const authHeader = request.headers.get("Authorization");
  const secret     = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const seasonParam = searchParams.get("season");
  const roundParam  = searchParams.get("round");

  // Auto-detectar a rodada mais recente com jogos encerrados se não informado
  let season: number;
  let round:  number;

  if (seasonParam && roundParam) {
    season = parseInt(seasonParam, 10);
    round  = parseInt(roundParam,  10);
    if (isNaN(season) || isNaN(round) || season < 2020 || round < 1 || round > 38) {
      return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
    }
  } else {
    // Auto-detect: última rodada no DB com status READY ou DELIVERED (ainda não fechada)
    const now = new Date();
    season    = now.getFullYear();

    const lastOpenRound = await prisma.round.findFirst({
      where: {
        season:  { year: season },
        status:  { in: ["READY", "DELIVERED"] },
      },
      orderBy: { number: "desc" },
      select:  { number: true },
    });

    if (!lastOpenRound) {
      return NextResponse.json({
        ok:      false,
        message: "Nenhuma rodada aberta encontrada para fechar. Use ?season=&round= para forçar.",
      });
    }

    round = lastOpenRound.number;
    console.info(`[BOB/post-round] Auto-detectou rodada ${round}/${season} para fechar.`);
  }

  console.info(`[BOB/post-round] Registrando resultados · rodada ${round}/${season}`);

  // 1. Buscar jogos da rodada via football-data.org
  let matchesRes;
  try {
    matchesRes = await getMatchesByMatchday(round);
  } catch {
    return NextResponse.json({
      ok:      false,
      message: "Jogos não disponíveis — tente novamente em algumas horas.",
      season,
      round,
    });
  }

  const allMatches = matchesRes.matches;
  const finishedMatches = allMatches.filter((m) => m.status === "FINISHED");

  if (finishedMatches.length === 0) {
    return NextResponse.json({
      ok:      false,
      message: "Nenhum jogo encerrado ainda — tente novamente mais tarde.",
      totalFixtures: allMatches.length,
      season,
      round,
    });
  }

  // Mapa: matchId (string) → resultado real
  const resultByFixture = new Map<string, "HOME" | "DRAW" | "AWAY">();
  for (const m of finishedMatches) {
    const r = realResult(m);
    if (r) resultByFixture.set(String(m.id), r);
  }

  // 2. Buscar rodada no DB
  const dbRound = await prisma.round.findFirst({
    where: {
      number: round,
      season: { year: season },
    },
    select: { id: true, status: true },
  });

  if (!dbRound) {
    return NextResponse.json({
      ok:      false,
      message: "Rodada não encontrada no banco — execute primeiro o pre-round ou backfill.",
      season,
      round,
    });
  }

  // 3. Picks com fixtureId definido e ainda sem resultado
  const picks = await prisma.pick.findMany({
    where: {
      fixtureId: { not: null },
      correct:   null,
      variation: {
        round: { id: dbRound.id },
      },
    },
    select: { id: true, fixtureId: true, result: true },
  });

  // 4. Registrar resultado em cada pick
  let updated = 0;
  let skipped = 0;

  for (const pick of picks) {
    const actual = resultByFixture.get(pick.fixtureId!);
    if (!actual) {
      skipped++;
      continue;
    }

    await markPickResult({
      pickId:       pick.id,
      actualResult: actual,
      correct:      pick.result === actual,
    });
    updated++;
  }

  // 5. Fechar a rodada se todos os jogos estiverem encerrados
  const allFinished = allMatches.every((m) => m.status === "FINISHED");

  if (allFinished && dbRound.status !== "CLOSED") {
    await prisma.round.update({
      where: { id: dbRound.id },
      data:  { status: "CLOSED" },
    });
    console.info(`[BOB/post-round] Rodada ${round}/${season} fechada.`);
  }

  // 6. Revalidar caches
  revalidatePath("/dashboard");
  revalidatePath("/investimento-retorno");
  revalidatePath("/admin");

  return NextResponse.json({
    ok:            true,
    phase:         "pós-rodada",
    season,
    round,
    totalFixtures: allMatches.length,
    finished:      finishedMatches.length,
    picksUpdated:  updated,
    picksSkipped:  skipped,
    roundClosed:   allFinished,
    timestamp:     new Date().toISOString(),
  });
}
