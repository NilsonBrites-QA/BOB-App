/**
 * Endpoint de debug — compara fontes de odds (Bet365 vs Pinnacle).
 *
 * Uso: GET /api/admin/debug/odds?fixtureId=12345
 *      Se fixtureId omitido, usa o primeiro Pick da Round mais recente.
 *
 * Acesso: somente role=ADMIN.
 *
 * Saída: JSON com 4 colunas:
 *   1. oddspapi_pinnacle  — estrutura v4 crua (bookmaker default)
 *   2. oddspapi_bet365    — tenta bet365 no mesmo endpoint
 *   3. api_football_bet365 — odds Bet365 via bookmaker=8
 *   4. api_football_all   — todas as casas pra esse fixture (referência)
 *
 * Útil para descobrir: qual fonte está retornando dados úteis hoje, qual
 * casa cobre, e se os parsers do projeto fazem match com a estrutura real.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";

const ODDSPAPI_BASE = "https://api.oddspapi.io/v4";
const APIFOOTBALL_BASE = "https://v3.football.api-sports.io";
const TOURNAMENT_SERIE_A = 325;

async function requireAdmin() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return false;

  const dbUser = await prisma.user.findUnique({
    where: { email: user.email.toLowerCase() },
    select: { role: true, active: true },
  });
  return Boolean(dbUser?.active && dbUser.role === "ADMIN");
}

async function fetchOddsPapi(bookmaker: string) {
  const key = process.env.ODDSPAPI_KEY;
  if (!key) return { error: "ODDSPAPI_KEY ausente" };

  const url = `${ODDSPAPI_BASE}/odds-by-tournaments?tournamentIds=${TOURNAMENT_SERIE_A}&bookmaker=${bookmaker}&apiKey=${key}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text; }

    return {
      status: res.status,
      ok: res.ok,
      bookmaker,
      url: url.replace(key, "***"),
      // Mostrar só primeiro fixture pra inspecionar estrutura sem poluir
      sample: Array.isArray(body) ? body.slice(0, 1) : body,
      totalFixtures: Array.isArray(body) ? body.length : null,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), bookmaker };
  }
}

async function fetchApiFootballOdds(fixtureId: number, bookmakerId?: number) {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return { error: "API_FOOTBALL_KEY ausente" };

  const path = bookmakerId
    ? `/odds?fixture=${fixtureId}&bookmaker=${bookmakerId}`
    : `/odds?fixture=${fixtureId}`;
  const url = `${APIFOOTBALL_BASE}${path}`;

  try {
    const res = await fetch(url, {
      headers: { "x-rapidapi-key": key, "x-rapidapi-host": "v3.football.api-sports.io" },
      cache: "no-store",
    });
    const text = await res.text();
    let body: { response?: unknown[] } | unknown;
    try { body = JSON.parse(text); } catch { body = text; }

    const remaining = res.headers.get("x-ratelimit-requests-remaining");

    return {
      status: res.status,
      ok: res.ok,
      bookmakerId: bookmakerId ?? "all",
      url: path,
      quotaRemaining: remaining,
      sample: typeof body === "object" && body && "response" in body
        ? (body as { response: unknown[] }).response?.slice(0, 1)
        : body,
      totalFixtures: typeof body === "object" && body && "response" in body
        ? (body as { response: unknown[] }).response?.length
        : null,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), bookmakerId };
  }
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const fixtureIdParam = url.searchParams.get("fixtureId");
  let fixtureId = fixtureIdParam ? parseInt(fixtureIdParam, 10) : NaN;

  // Se não vier por querystring, pega do último Pick com fixtureId
  if (!Number.isFinite(fixtureId)) {
    const lastPick = await prisma.pick.findFirst({
      where: { fixtureId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { fixtureId: true, match: true },
    });
    if (lastPick?.fixtureId) {
      fixtureId = parseInt(lastPick.fixtureId, 10);
    }
  }

  // Rodar todas as fontes em paralelo
  const [oddsPinnacle, oddsBet365, afBet365, afAll] = await Promise.all([
    fetchOddsPapi("pinnacle"),
    fetchOddsPapi("bet365"),
    Number.isFinite(fixtureId) ? fetchApiFootballOdds(fixtureId, 8) : Promise.resolve({ error: "fixtureId inválido" }),
    Number.isFinite(fixtureId) ? fetchApiFootballOdds(fixtureId) : Promise.resolve({ error: "fixtureId inválido" }),
  ]);

  return NextResponse.json({
    fixtureId: Number.isFinite(fixtureId) ? fixtureId : null,
    fontes: {
      oddspapi_pinnacle: oddsPinnacle,
      oddspapi_bet365: oddsBet365,
      api_football_bet365: afBet365,
      api_football_all: afAll,
    },
    notas: [
      "Compare 'sample' das 4 fontes — qual retorna estrutura útil?",
      "OddsPapi v4 retorna bookmakerOdds.{nome}.markets.101.outcomes",
      "API-Football retorna response[].bookmakers[].bets[].values[]",
      "Se oddspapi_bet365.sample estiver vazio: plano free não cobre Bet365 → usar API-Football",
    ],
  }, { status: 200 });
}
