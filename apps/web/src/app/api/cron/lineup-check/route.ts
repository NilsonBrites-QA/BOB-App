/**
 * BOB — Cron T-1h: GET /api/cron/lineup-check
 *
 * Executado ~1h antes do primeiro jogo da rodada.
 * Objetivo: capturar lesões/suspensões de última hora que não existiam
 * no rascunho T-48h e regenerar variações afetadas.
 *
 * Pipeline:
 *   1. Detecta rodada atual (getCurrentRound)
 *   2. Busca fixtures da rodada — filtra apenas jogos ainda não iniciados
 *   3. Coleta lesões e odds atualizadas (dados frescos, sem cache longo)
 *   4. Re-roda scoreMatch() + selectAnchors() + generateVariations()
 *   5. Upsert da rodada no DB (saveRound é idempotente)
 *   6. Revalida cache do dashboard
 *
 * Requer: Authorization: Bearer <CRON_SECRET>
 */

import { NextResponse }   from "next/server";
import { revalidatePath } from "next/cache";
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

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Status da API-Football que indicam jogo ainda não iniciado */
const NOT_STARTED_STATUSES = new Set(["TBD", "NS", "SUSP", "INT", "PST", "CANC", "ABD"]);

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

  const { searchParams } = new URL(request.url);
  const forceRound = searchParams.get("round") ? parseInt(searchParams.get("round")!, 10) : null;

  // 1. Detectar rodada atual
  let round = forceRound;
  if (!round) {
    try {
      round = await getCurrentRound(season);
    } catch (err) {
      console.error("[BOB/lineup-check] Falha ao detectar rodada:", err);
    }
  }

  if (!round) {
    return NextResponse.json({
      ok:      false,
      message: "Sem rodada detectada — entressafra ou API_FOOTBALL_KEY ausente.",
    });
  }

  console.info(`[BOB/lineup-check] Verificação T-1h · rodada ${round}/${season}`);

  // 2. Fixtures da rodada — filtra jogos não iniciados
  const [standingsRes, fixturesRes] = await Promise.all([
    getStandings(season).catch(() => null),
    getFixturesByRound(season, round).catch(() => null),
  ]);

  if (!standingsRes || !fixturesRes || fixturesRes.response.length === 0) {
    return NextResponse.json({
      ok:      false,
      message: "Dados indisponíveis.",
      round,
      season,
    });
  }

  // Todos os fixtures (re-analisar a rodada completa com dados frescos)
  const fixtures   = fixturesRes.response;
  const upcoming   = fixtures.filter((f) => NOT_STARTED_STATUSES.has(f.fixture.status.short));
  const teamIds    = uniqueTeamIds(fixtures);
  const dates      = uniqueDates(fixtures);

  console.info(`[BOB/lineup-check] ${upcoming.length}/${fixtures.length} jogos ainda não iniciados.`);

  // 3. Dados frescos (odds e lesões com TTL reduzido via force revalidate)
  const [formResults, h2hResults, injuryResults, oddsResults] = await Promise.all([
    Promise.all(
      teamIds.map((id) => getTeamLastFixtures(id, season, 10).catch(() => null))
    ),
    Promise.all(
      fixtures.map((f) => getH2H(f.teams.home.id, f.teams.away.id, 10).catch(() => null))
    ),
    // Lesões frescas — endpoint com maior frequência de atualização
    Promise.all(
      dates.map((d) => getInjuriesByDate(season, d).catch(() => null))
    ),
    // Odds atualizadas
    Promise.all(
      fixtures.map((f) => getOdds(f.fixture.id).catch(() => null))
    ),
  ]);

  // Agregar lesões
  const allInjuries: AFInjuryItem[] = injuryResults
    .filter(Boolean)
    .flatMap((r) => r!.response as AFInjuryItem[]);

  // Agregar odds
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

  // 4. Re-rodar motor com dados frescos
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

  // 5. Upsert no DB (idempotente — substitui rascunho T-48h com versão atualizada)
  const { roundDbId } = await saveRound({
    season,
    round,
    anchors,
    variations,
    source: "api",
  });

  // 6. Revalidar dashboard
  revalidatePath("/dashboard");

  return NextResponse.json({
    ok:            true,
    phase:         "T-1h",
    season,
    round,
    roundDbId,
    matchCount:    matchInputs.length,
    upcomingCount: upcoming.length,
    anchorCount:   anchors.length,
    newInjuries:   allInjuries.length,
    timestamp:     now.toISOString(),
  });
}
