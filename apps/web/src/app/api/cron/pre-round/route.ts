/**
 * BOB — Cron T-48h: GET /api/cron/pre-round
 *
 * Executado 48h antes do primeiro jogo da rodada (sexta ~12h).
 * Busca dados antecipados, roda o motor e persiste o rascunho da rodada.
 *
 * Objetivo: ter uma versão completa das análises disponível bem antes
 * do cutoff, com odds iniciais + dados estáveis.
 *
 * Pipeline:
 *   1. Detecta rodada atual via getCurrentRound()
 *   2. Coleta standings, fixtures, forma, H2H, lesões preliminares, odds
 *   3. Normaliza → scoreMatch() → selectAnchors() → generateVariations()
 *   4. Persiste via saveRound() (idempotente — pode rodar múltiplas vezes)
 *   5. Revalida cache do dashboard
 *
 * Requer: Authorization: Bearer <CRON_SECRET>
 */

import { NextResponse }        from "next/server";
import { revalidatePath }      from "next/cache";
import {
  getCurrentRound,
  getStandings,
  getFixturesByRound,
  getTeamLastFixtures,
  getH2H,
  getInjuriesByDate,
  getOdds,
} from "@/lib/bob/connectors/api-football";
import { normalizeMatchInputs } from "@/lib/bob/connectors/normalize";
import { scoreMatch, selectAnchors, generateVariations } from "@/lib/bob/engine";
import { saveRound }            from "@/lib/bob/persist";
import type { AFFixtureItem, AFInjuryItem, AFOddsItem } from "@/lib/bob/connectors/api-football-types";

// ─── Helpers (copiado do padrão do backfill) ──────────────────────────────────

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

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  // Autenticação
  const authHeader = request.headers.get("Authorization");
  const secret     = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now    = new Date();
  const season = now.getFullYear();

  // Permitir override manual de rodada via query param
  const { searchParams } = new URL(request.url);
  const forceRound = searchParams.get("round") ? parseInt(searchParams.get("round")!, 10) : null;

  // 1. Detectar rodada atual (ou usar override)
  let round: number | null = forceRound;
  if (!round) {
    try {
      round = await getCurrentRound(season);
    } catch (err) {
      console.error("[BOB/pre-round] Falha ao detectar rodada:", err);
    }
  }

  if (!round) {
    return NextResponse.json({
      ok:      false,
      message: "Sem rodada detectada — possível entressafra ou API_FOOTBALL_KEY ausente.",
    });
  }

  console.info(`[BOB/pre-round] Processando T-48h · rodada ${round}/${season}`);

  // 2. Coleta de dados em paralelo
  const [standingsRes, fixturesRes] = await Promise.all([
    getStandings(season).catch(() => null),
    getFixturesByRound(season, round).catch(() => null),
  ]);

  if (!standingsRes || !fixturesRes || fixturesRes.response.length === 0) {
    return NextResponse.json({
      ok:      false,
      message: "Dados de standings ou fixtures indisponíveis.",
      round,
      season,
    });
  }

  const fixtures = fixturesRes.response;
  const teamIds  = uniqueTeamIds(fixtures);
  const dates    = uniqueDates(fixtures);

  // Dados por time e lesões (paralelo)
  const [formResults, h2hResults, injuryResults, oddsResults] = await Promise.all([
    // Forma: últimos 10 jogos de cada time
    Promise.all(
      teamIds.map((id) => getTeamLastFixtures(id, season, 10).catch(() => null))
    ),
    // H2H: para cada jogo
    Promise.all(
      fixtures.map((f) =>
        getH2H(f.teams.home.id, f.teams.away.id, 10).catch(() => null)
      )
    ),
    // Lesões: por data única da rodada
    Promise.all(
      dates.map((d) => getInjuriesByDate(season, d).catch(() => null))
    ),
    // Odds: por fixture
    Promise.all(
      fixtures.map((f) => getOdds(f.fixture.id).catch(() => null))
    ),
  ]);

  // Agregar lesões (todas as datas fundidas)
  const allInjuries: AFInjuryItem[] = injuryResults
    .filter(Boolean)
    .flatMap((r) => r!.response as AFInjuryItem[]);

  // Agregar odds por fixture id
  const oddsMap: Record<number, AFOddsItem> = {};
  fixtures.forEach((f, idx) => {
    const r = oddsResults[idx];
    if (r?.response[0]) oddsMap[f.fixture.id] = r.response[0] as AFOddsItem;
  });

  // Agregar forma por teamId (Record)
  const teamLastFixturesRecord: Record<number, AFFixtureItem[]> = {};
  teamIds.forEach((id, idx) => {
    const r = formResults[idx];
    if (r) teamLastFixturesRecord[id] = r.response;
  });

  // Agregar H2H por chave
  const h2hByKey: Record<string, AFFixtureItem[]> = {};
  fixtures.forEach((f, idx) => {
    const r = h2hResults[idx];
    const key = `${f.teams.home.id}-${f.teams.away.id}`;
    if (r) h2hByKey[key] = r.response;
  });

  // Standings flat
  const standings = standingsRes.response[0]?.league?.standings[0] ?? [];

  // 3. Normalizar e rodar motor
  const matchInputs = normalizeMatchInputs(
    {
      roundFixtures: fixtures,
      standings,
      teamLastFixtures: teamLastFixturesRecord,
      h2hByKey,
      teamStats: {},
      injuries: allInjuries,
      oddsMap,
    },
    round,
  );

  const scored     = matchInputs.map(scoreMatch);
  const anchors    = selectAnchors(matchInputs);
  const anchorIds  = new Set(anchors.map((a) => a.id));
  const pool       = scored.filter((m) => !anchorIds.has(m.id));
  const variations = generateVariations({ anchors, pool });

  // 4. Persistir rascunho (idempotente)
  const { roundDbId } = await saveRound({
    season,
    round,
    anchors,
    variations,
    source: "api",
  });

  // 5. Revalidar cache do dashboard
  revalidatePath("/dashboard");

  return NextResponse.json({
    ok:          true,
    phase:       "T-48h",
    season,
    round,
    roundDbId,
    matchCount:  matchInputs.length,
    anchorCount: anchors.length,
    timestamp:   now.toISOString(),
  });
}
