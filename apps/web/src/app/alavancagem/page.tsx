import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { scoreMatch } from "@/lib/bob/engine/scoring";
import { loadRoundData } from "@/lib/bob/round-loader";
import { loadAllBadgesFromDb, resolveBadge } from "@/lib/badges/badge-service";
import {
  LEVERAGE_TOTAL_STEPS,
  deriveState,
  selectLeveragePicks,
  buildLeverageTicket,
  buildStakeTable,
} from "@/lib/bob/engine/leverage";
import type { LeverageEvent, LeverageState } from "@/lib/bob/engine/leverage";
import { AlavancagemClient } from "./alavancagem-client";

export const revalidate = 300;

export const metadata = {
  title: "Alavancagem · BOB",
  description: "15 passos para multiplicar sua banca com disciplina.",
};

export default async function AlavancagemPage() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const dbUser = await prisma.user
    .findUnique({ where: { email: user.email!.toLowerCase() }, select: { active: true } })
    .catch(() => null);
  if (!dbUser?.active) redirect("/login");

  // ── Carregar eventos do usuário (Event Sourcing) ────────────────────────────
  // Usa query raw enquanto o Prisma client não for regenerado pós-migration.
  let events: LeverageEvent[] = [];
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string; user_id: string; cycle_id: string; step: number;
      result: string; match_id: string; home_team: string; away_team: string;
      pick_label: string; pick_odd: number; stake: number; payout: number;
      created_at: Date;
    }>>(
      `SELECT * FROM leverage_events WHERE user_id = $1::uuid ORDER BY created_at ASC`,
      user.id,
    );
    events = rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      cycleId: r.cycle_id,
      step: r.step,
      result: r.result as LeverageEvent["result"],
      matchId: r.match_id,
      homeTeam: r.home_team,
      awayTeam: r.away_team,
      pickLabel: r.pick_label,
      pickOdd: Number(r.pick_odd),
      stake: Number(r.stake),
      payout: Number(r.payout),
      createdAt: r.created_at,
    }));
  } catch {
    // Tabela pode não existir ainda — continua com array vazio
  }

  // ── Derivar estado atual ────────────────────────────────────────────────────
  const state = deriveState(events);

  // ── Carregar jogos da rodada para montar o bilhete do dia ───────────────────
  const season = new Date().getFullYear();
  const roundData = await loadRoundData(season, null);
  const allScored = roundData.matches.map(scoreMatch);

  // ── Selecionar picks autônomos ──────────────────────────────────────────────
  const rawPicks = selectLeveragePicks(allScored, state.currentStep);

  // ── Hidratar escudos (DB-first) ─────────────────────────────────────────────
  const badgeMap = await loadAllBadgesFromDb();
  const hydratedPicks = rawPicks?.map((p) => ({
    ...p,
    homeBadge: resolveBadge(p.homeTeam, badgeMap),
    awayBadge: resolveBadge(p.awayTeam, badgeMap),
  })) ?? null;

  // ── Montar ticket ───────────────────────────────────────────────────────────
  const ticket = hydratedPicks
    ? buildLeverageTicket(hydratedPicks, state.currentStep)
    : null;

  // ── Tabela de stakes para UI ────────────────────────────────────────────────
  const stakeTable = buildStakeTable();

  // ── Round label ─────────────────────────────────────────────────────────────
  const roundLabel = roundData.source === "api" && roundData.meta
    ? `Rodada ${roundData.meta.round} · ${roundData.meta.season}`
    : "Demonstrativo";

  // ── Verificar se já existe PENDING para este step/cycle ─────────────────────
  let hasPending = false;
  try {
    const pendingRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM leverage_events
       WHERE user_id = $1::uuid
         AND cycle_id = $2::uuid
         AND step = $3
         AND result = 'PENDING'
       LIMIT 1`,
      user.id,
      state.currentCycleId,
      state.currentStep,
    );
    hasPending = pendingRows.length > 0;
  } catch {
    // Tabela pode não existir ainda
  }

  return (
    <AlavancagemClient
      state={state}
      ticket={ticket}
      stakeTable={stakeTable}
      roundLabel={roundLabel}
      isDemo={roundData.source === "demo"}
      userId={user.id}
      hasPending={hasPending}
    />
  );
}
