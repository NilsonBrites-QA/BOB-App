/**
 * POST /api/apostas/tickets — cria um novo bilhete
 * GET  /api/apostas/tickets — lista bilhetes do usuário logado
 *
 * POST body:
 * {
 *   stake: number,
 *   selections: Array<{
 *     matchId: string,
 *     market: BetMarket,
 *     option: string,
 *     optionLabel: string,
 *     odd: number
 *   }>
 * }
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { BetMarket, BetTicketStatus } from "@/generated/prisma";

export const runtime = "nodejs";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getActiveUser(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const dbUser = await prisma.user.findUnique({
    where: { email: user.email.toLowerCase() },
    select: { id: true, active: true },
  });

  if (!dbUser?.active) return null;
  return dbUser;
}

// ─── GET — listar bilhetes ────────────────────────────────────────────────────

export async function GET() {
  const cookieStore = await cookies();
  const dbUser = await getActiveUser(cookieStore);

  if (!dbUser) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const tickets = await prisma.betTicket.findMany({
    where: { userId: dbUser.id },
    include: {
      selections: {
        include: {
          match: {
            select: {
              homeTeam: true,
              awayTeam: true,
              homeCrest: true,
              awayCrest: true,
              competition: true,
              round: true,
              scheduledAt: true,
              homeScore: true,
              awayScore: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ tickets });
}

// ─── POST — criar bilhete ─────────────────────────────────────────────────────

type SelectionInput = {
  matchId: string;
  market: string;
  option: string;
  optionLabel: string;
  odd: number;
};

type TicketInput = {
  stake?: number;
  selections: SelectionInput[];
};

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const dbUser = await getActiveUser(cookieStore);

  if (!dbUser) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: TicketInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  const { stake = 0, selections } = body;

  if (!Array.isArray(selections) || selections.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos uma partida" }, { status: 400 });
  }

  if (selections.length > 12) {
    return NextResponse.json({ error: "Máximo de 12 seleções por bilhete" }, { status: 400 });
  }

  // Valida mercados
  const validMarkets = Object.values(BetMarket) as string[];
  for (const sel of selections) {
    if (!validMarkets.includes(sel.market)) {
      return NextResponse.json({ error: `Mercado inválido: ${sel.market}` }, { status: 400 });
    }
  }

  // Valida que as partidas existem
  const matchIds = selections.map((s) => s.matchId);
  const existingMatches = await prisma.betMatch.findMany({
    where: { id: { in: matchIds } },
    select: { id: true },
  });
  const existingIds = new Set(existingMatches.map((m) => m.id));

  for (const sel of selections) {
    if (!existingIds.has(sel.matchId)) {
      return NextResponse.json({ error: `Partida não encontrada: ${sel.matchId}` }, { status: 400 });
    }
  }

  // Calcula odds combinadas
  const totalOdds = selections.reduce((acc, s) => acc * (s.odd ?? 1), 1);
  const potentialReturn = stake > 0 ? parseFloat((stake * totalOdds).toFixed(2)) : null;

  const ticket = await prisma.betTicket.create({
    data: {
      userId: dbUser.id,
      status: BetTicketStatus.DRAFT,
      stake: stake > 0 ? stake : null,
      totalOdds: parseFloat(totalOdds.toFixed(4)),
      potentialReturn,
      selections: {
        create: selections.map((sel) => ({
          matchId: sel.matchId,
          market: sel.market as BetMarket,
          option: sel.option,
          optionLabel: sel.optionLabel,
          odd: sel.odd,
        })),
      },
    },
    include: {
      selections: {
        include: {
          match: {
            select: {
              homeTeam: true,
              awayTeam: true,
              competition: true,
              round: true,
              scheduledAt: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({ ticket }, { status: 201 });
}
