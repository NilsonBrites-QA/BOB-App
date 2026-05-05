/**
 * BOB — POST /api/bob/leverage/accept
 *
 * Registra o bilhete do dia como evento PENDING no banco.
 *
 * Fluxo:
 *   1. Usuário vê o bilhete na UI
 *   2. Clica "Aceitar entrada" → chama este endpoint
 *   3. INSERT append-only com result='PENDING'
 *   4. O cron leverage-resolve cruzará com o resultado real depois
 *
 * Body JSON:
 *   {
 *     picks: Array<{ matchId, homeTeam, awayTeam, pickOutcome, pickLabel, pickOdd }>,
 *     step: number,
 *     cycleId: string,
 *     stake: number
 *   }
 *
 * Segurança: Requer auth do Supabase (o usuário precisa estar logado).
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";

type PickPayload = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  pickOutcome: "Home" | "Draw" | "Away";
  pickLabel: string;
  pickOdd: number;
};

type AcceptBody = {
  picks: PickPayload[];
  step: number;
  cycleId: string;
  stake: number;
};

export async function POST(request: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: AcceptBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { picks, step, cycleId, stake } = body;

  if (!picks || !Array.isArray(picks) || picks.length === 0) {
    return NextResponse.json({ error: "picks é obrigatório e não pode ser vazio" }, { status: 400 });
  }
  if (!step || step < 1 || step > 15) {
    return NextResponse.json({ error: "step deve ser entre 1 e 15" }, { status: 400 });
  }
  if (!cycleId) {
    return NextResponse.json({ error: "cycleId é obrigatório" }, { status: 400 });
  }

  // ── Verificar se já existe PENDING para este step/cycle ─────────────────────
  try {
    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM leverage_events
       WHERE user_id = $1::uuid
         AND cycle_id = $2::uuid
         AND step = $3
         AND result = 'PENDING'
       LIMIT 1`,
      user.id,
      cycleId,
      step,
    );

    if (existing.length > 0) {
      return NextResponse.json({
        error: "Já existe um bilhete pendente para este passo. Aguarde a resolução.",
        existingEventId: existing[0].id,
      }, { status: 409 });
    }
  } catch {
    // Tabela pode não existir — continua (o INSERT falhará se for o caso)
  }

  // ── INSERT append-only (PENDING) ────────────────────────────────────────────
  try {
    const insertedIds: string[] = [];

    for (const pick of picks) {
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO leverage_events
           (user_id, cycle_id, step, result, match_id, home_team, away_team, pick_label, pick_odd, stake, payout)
         VALUES
           ($1::uuid, $2::uuid, $3, 'PENDING', $4, $5, $6, $7, $8, $9, 0)
         RETURNING id`,
        user.id,
        cycleId,
        step,
        pick.matchId,
        pick.homeTeam,
        pick.awayTeam,
        pick.pickLabel,
        pick.pickOdd,
        stake,
      );
      if (rows[0]) insertedIds.push(rows[0].id);
    }

    return NextResponse.json({
      ok: true,
      step,
      cycleId,
      picksCount: picks.length,
      eventIds: insertedIds,
      message: `Bilhete do passo ${step} registrado. O BOB resolverá automaticamente após os jogos.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[leverage/accept]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
