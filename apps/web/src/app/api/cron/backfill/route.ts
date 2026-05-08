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
import {
  getStandings,
  getFixturesByRound,
  getTeamLastFixtures,
  getH2H,
  getInjuriesByDate,
  getOdds,
} from "@/lib/bob/connectors/api-football";
import { normalizeMatchInputs } from "@/lib/bob/connectors/normalize";
import { scoreMatch, selectAnchors } from "@/lib/bob/engine";
import { generateVariations } from "@/lib/bob/engine";
import { saveRound, markPickResult } from "@/lib/bob/persist";
import { prisma } from "@/lib/db";

import type { AFFixtureItem, AFInjuryItem, AFOddsItem } from "@/lib/bob/connectors/api-football-types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uniqueTeamIds(fixtures: AFFixtureItem[]): number[] {
  const ids = new Set<number>();
  for (const f of fixtures) {
    ids.add(f.teams.home.id);
    ids.add(f.teams.away.id);
  }
  return Array.from(ids);
}

function uniqueDates(fixtures: AFFixtureItem[]): string[] {
  const dates = new Set<string>();
  for (const f of fixtures) {
    const date = f.fixture.date.split("T")[0];
    if (date) dates.add(date);
  }
  return Array.from(dates);
}

/** Converte resultado de um fixture encerrado em PickResult string */
function realResult(fixture: AFFixtureItem): "HOME" | "DRAW" | "AWAY" | null {
  const h = fixture.goals.home;
  const a = fixture.goals.away;
  if (h === null || a === null) return null;
  if (h > a) return "HOME";
  if (h < a) return "AWAY";
  return "DRAW";
}

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
    // 4. Buscar dados da API-Football (fixtures + pipeline completo)
    const [standingsRes, fixturesRes] = await Promise.all([
      getStandings(season),
      getFixturesByRound(season, round),
    ]);

    const roundFixtures = fixturesRes.response;

    if (roundFixtures.length === 0) {
      return NextResponse.json(
        { error: `Nenhuma fixture encontrada para ${season}/rodada ${round}.` },
        { status: 404 },
      );
    }

    // Exigir que TODOS os jogos da rodada estejam encerrados (FT/AET/PEN)
    const completedStatuses = new Set(["FT", "AET", "PEN", "AWD"]);
    const allCompleted = roundFixtures.every((f) =>
      completedStatuses.has(f.fixture.status.short),
    );

    if (!allCompleted) {
      return NextResponse.json(
        {
          error: `Rodada ${season}/${round} ainda não foi completamente encerrada. Tente novamente após o término de todos os jogos.`,
          pending: roundFixtures
            .filter((f) => !completedStatuses.has(f.fixture.status.short))
            .map((f) => `${f.teams.home.name} x ${f.teams.away.name} [${f.fixture.status.short}]`),
        },
        { status: 409 },
      );
    }

    // Construir mapa de resultado real: fixtureId → resultado
    const realResultMap = new Map<number, "HOME" | "DRAW" | "AWAY">();
    for (const f of roundFixtures) {
      const result = realResult(f);
      if (result) realResultMap.set(f.fixture.id, result);
    }

    // 5. Demais dados em paralelo
    const standingsData = standingsRes.response[0];
    const standings     = standingsData?.league?.standings?.[0] ?? [];
    const teamIds       = uniqueTeamIds(roundFixtures);
    const matchDates    = uniqueDates(roundFixtures);

    const [teamLastFixturesArr, h2hArr, injuriesArr, oddsArr] = await Promise.all([
      Promise.all(
        teamIds.map((id) =>
          getTeamLastFixtures(id, season, 10).then((r) => ({ id, fixtures: r.response })),
        ),
      ),
      Promise.all(
        roundFixtures.map((f) =>
          getH2H(f.teams.home.id, f.teams.away.id, 10).then((r) => ({
            key: `${f.teams.home.id}-${f.teams.away.id}`,
            fixtures: r.response,
          })),
        ),
      ),
      Promise.all(matchDates.map((date) => getInjuriesByDate(season, date))).then(
        (results) => results.flatMap((r): AFInjuryItem[] => r.response),
      ),
      Promise.all(
        roundFixtures.map((f) =>
          getOdds(f.fixture.id)
            .then((r) => ({ id: f.fixture.id, data: r.response[0] as AFOddsItem | undefined }))
            .catch(() => ({ id: f.fixture.id, data: undefined as AFOddsItem | undefined })),
        ),
      ),
    ]);

    const teamLastFixtures: Record<number, AFFixtureItem[]> = {};
    for (const { id, fixtures } of teamLastFixturesArr) {
      teamLastFixtures[id] = fixtures;
    }

    const h2hByKey: Record<string, AFFixtureItem[]> = {};
    for (const { key, fixtures } of h2hArr) {
      h2hByKey[key] = fixtures;
    }

    const oddsMap: Record<number, AFOddsItem> = {};
    for (const { id, data } of oddsArr) {
      if (data) oddsMap[id] = data;
    }

    // 6. Normalizar — modo backfill (aceita FT fixtures)
    const matches = normalizeMatchInputs(
      { roundFixtures, standings, teamLastFixtures, h2hByKey, teamStats: {}, injuries: injuriesArr, oddsMap },
      round,
      true, // includeCompleted
    );

    if (matches.length === 0) {
      return NextResponse.json(
        { error: "Normalização retornou 0 partidas. Verifique os dados da API." },
        { status: 500 },
      );
    }

    // 7. Motor de scoring
    const allScored  = matches.map(scoreMatch);
    const anchors    = selectAnchors(matches);
    const anchorIds  = new Set(anchors.map((a) => a.id));
    const pool       = allScored.filter((m) => !anchorIds.has(m.id));
    const variationsResult = generateVariations({ anchors, pool });
    
    // Extrair array de variações do resultado (compatibilidade com beam-search)
    const variations = variationsResult.variations || [];

    // 8. Persistir no banco
    const { roundDbId } = await saveRound({
      season,
      round,
      anchors,
      variations,
      source: "api",
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
          const fixtureIdNum = parseInt(pick.fixtureId, 10);
          const actual = realResultMap.get(fixtureIdNum);
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
      matchesScored:    allScored.length,
      anchorsFound:     anchors.length,
      variationsCreated: variations.length,
      picksMarked:      markedCount,
      timestamp:        new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno do servidor";
    console.error(`[backfill] ${season}/R${round}:`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
