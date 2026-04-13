/**
 * GET /api/apostas/matches
 *
 * Lista partidas disponíveis para apostar.
 *
 * Query params:
 *   competition — "Série A" | "Série B" (padrão: "Série A")
 *   season      — ex: 2026 (padrão: ano corrente)
 *   status      — "SCHEDULED" | "LIVE" | "FINISHED" (padrão: "SCHEDULED,LIVE")
 *   round       — número da rodada (opcional)
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { BetMatchStatus } from "@/generated/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  // Auth — apenas usuários ativos
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { email: user.email.toLowerCase() },
    select: { active: true },
  });

  if (!dbUser?.active) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const competition = searchParams.get("competition") ?? "Série A";
  const seasonStr   = searchParams.get("season") ?? String(new Date().getFullYear());
  const season      = parseInt(seasonStr, 10);
  const round       = searchParams.get("round");
  const statusParam = searchParams.get("status");

  // Monta filtro de status
  const statusValues: BetMatchStatus[] = [];
  if (statusParam) {
    for (const s of statusParam.split(",")) {
      if (s in BetMatchStatus) statusValues.push(s as BetMatchStatus);
    }
  } else {
    statusValues.push(BetMatchStatus.SCHEDULED, BetMatchStatus.LIVE);
  }

  const matches = await prisma.betMatch.findMany({
    where: {
      competition,
      season,
      ...(round ? { round: parseInt(round) } : {}),
      status: { in: statusValues },
    },
    include: {
      odds: {
        where: { market: "RESULT_1X2" },
        select: { market: true, option: true, optionLabel: true, odd: true },
      },
    },
    orderBy: [{ round: "asc" }, { scheduledAt: "asc" }],
  });

  return NextResponse.json({ matches });
}
