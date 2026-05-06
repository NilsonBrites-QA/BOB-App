/**
 * BOB — Cron endpoint: GET /api/cron/backfill
 *
 * Popula o banco com dados históricos de uma rodada passada.
 * Executa o motor de scoring na rodada, salva âncoras + variações e
 * registra automaticamente os resultados reais (jogo já encerrado).
 *
 * Destinado ao preenchimento incremental do histórico de backtesting:
 * 1 rodada/dia mantém o budget de API-Football dentro dos 100 req/dia free.
 *
 * Query params:
 *   season (number, obrigatório) — ex: 2025
 *   round  (number, obrigatório) — ex: 8
 *
 * Requer: header Authorization: Bearer <CRON_SECRET>
 *
 * NOTA sobre data leakage:
 *   Para rodadas históricas iniciais (rounds 1–5), a janela de forma de
 *   10 jogos pode incluir partidas posteriores da mesma temporada.
 *   Isso é aceito como limitação do backfill retroativo: o objetivo é
 *   validar o motor em contexto macro, não calibrar rounds iniciais com
 *   perfeição cirúrgica. Dados do corrente season são os mais afetados.
 */

import { NextResponse }   from "next/server";
import { getGatewayBackfillRoundDataset } from "@/lib/data/sports-data-gateway";
import { saveRound, markPickResult } from "@/lib/bob/persist";
import { prisma } from "@/lib/db";
import { buildOfficialVariationsPipeline } from "@/lib/bob/analytics/official-variation-pipeline";

/** Converte PickResult → string de resultado do pick ("1"/"X"/"2") para comparação */
function pickResultToString(result: string): "HOME" | "DRAW" | "AWAY" {
  if (result === "HOME") return "HOME";
  if (result === "AWAY") return "AWAY";
  return "DRAW";
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  // 1. Autenticação via CRON_SECRET
  const authHeader = request.headers.get("Authorization");
  const secret     = process.env.CRON_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parâmetros
  const { searchParams } = new URL(request.url);
  const seasonParam = searchParams.get("season");
  const roundParam  = searchParams.get("round");

  if (!seasonParam || !roundParam) {
    return NextResponse.json(
      { error: "Parâmetros 'season' e 'round' são obrigatórios." },
      { status: 400 },
    );
  }

  const season = parseInt(seasonParam, 10);
  const round  = parseInt(roundParam, 10);

  if (isNaN(season) || isNaN(round) || season < 2020 || round < 1 || round > 38) {
    return NextResponse.json(
      { error: "Parâmetros inválidos. season >= 2020 e round entre 1 e 38." },
      { status: 400 },
    );
  }

  // 3. Verificar se a rodada já existe no banco (idempotência)
  const existingSeason = await prisma.season.findUnique({ where: { year: season } });
  if (existingSeason) {
    // Versionamento (011): seasonId+number não é mais UNIQUE — múltiplas
    // versões podem coexistir. Pegamos a versão ATIVA (não-SUPERSEDED).
    const existingRound = await prisma.round.findFirst({
      where: {
        seasonId: existingSeason.id,
        number: round,
        status: { not: "SUPERSEDED" },
      },
      orderBy: { version: "desc" },
      select: { id: true, status: true },
    });
    if (existingRound) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: `Rodada ${season}/${round} já existe (status: ${existingRound.status}).`,
      });
    }
  }

  try {
    // 4. Buscar dados via Data Gateway autorizado (cache + lock + cooldown)
    const backfill = await getGatewayBackfillRoundDataset(season, round);

    if (backfill.fixtureCount === 0) {
      return NextResponse.json(
        { error: `Nenhuma fixture encontrada para ${season}/rodada ${round}.` },
        { status: 404 },
      );
    }

    if (!backfill.completed) {
      return NextResponse.json(
        {
          error: `Rodada ${season}/${round} ainda não foi completamente encerrada. Tente novamente após o término de todos os jogos.`,
          pending: backfill.pending,
        },
        { status: 409 },
      );
    }

    const matches = backfill.matches;

    if (matches.length === 0) {
      return NextResponse.json(
        { error: "Normalização retornou 0 partidas. Verifique os dados da API." },
        { status: 500 },
      );
    }

    // 7. Motor oficial de Variações
    const pipeline = await buildOfficialVariationsPipeline({
      matches,
      source: "api",
      round,
      sourceSnapshotIds: [`backfill:${season}:${round}:gateway`],
    });
    if (!pipeline.ok || !pipeline.variationsResult) {
      return NextResponse.json(
        { error: pipeline.reason ?? "Pipeline oficial bloqueou geração.", status: pipeline.status, round, season },
        { status: 409 },
      );
    }

    // 8. Persistir no banco
    const { roundDbId } = await saveRound({
      season,
      round,
      anchors: pipeline.anchors,
      variations: pipeline.variationsResult.variations,
      source: "api",
      officialSnapshot: pipeline.snapshot ?? undefined,
    });

    // 9. Marcar resultados reais nos picks
    const roundDb = await prisma.round.findUnique({
      where: { id: roundDbId },
      include: {
        variations: { include: { picks: true } },
      },
    });

    let markedCount = 0;
    if (roundDb) {
      for (const variation of roundDb.variations) {
        for (const pick of variation.picks) {
          if (!pick.fixtureId) continue;
          const actual = backfill.realResults.get(pick.fixtureId);
          if (!actual) continue;

          const predicted = pickResultToString(pick.result);
          await markPickResult({
            pickId:       pick.id,
            actualResult: actual,
            correct:      predicted === actual,
          });
          markedCount++;
        }
      }
    }

    // 10. Atualizar status da rodada para CLOSED
    await prisma.round.update({
      where: { id: roundDbId },
      data:  { status: "CLOSED" },
    });

    return NextResponse.json({
      ok: true,
      season,
      round,
      roundDbId,
      matchesScored:    matches.length,
      anchorsFound:     pipeline.anchors.length,
      variationsCreated: pipeline.variationsResult.variations.length,
      picksMarked:      markedCount,
      timestamp:        new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno do servidor";
    console.error(`[backfill] ${season}/R${round}:`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
