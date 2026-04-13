/**
 * /apostas — Página de criação e acompanhamento de apostas.
 *
 * Allows authenticated users to browse upcoming Série A / Série B matches,
 * consult BOB's confidence signals, and assemble a betslip.
 *
 * Server component: fetches matches from the DB and passes to client.
 */

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { BetMatchStatus } from "@/generated/prisma";
import { ApostasClient } from "./apostas-client";

export const metadata = {
  title: "Apostas · BOB",
  description: "Monte seu bilhete com análise do BOB por rodada.",
};

export default async function ApostasPage() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) redirect("/login");

  const dbUser = await prisma.user.findUnique({
    where: { email: user.email.toLowerCase() },
    select: { active: true },
  });

  if (!dbUser?.active) redirect("/login");

  // ── Busca partidas ──────────────────────────────────────────────────────────
  const season = new Date().getFullYear();

  const allStatuses = [
    BetMatchStatus.SCHEDULED,
    BetMatchStatus.LIVE,
    BetMatchStatus.FINISHED,
    BetMatchStatus.POSTPONED,
  ];

  const [serieA, serieB] = await Promise.all([
    prisma.betMatch.findMany({
      where: { competition: "Série A", season, status: { in: allStatuses } },
      include: {
        odds: {
          where: { market: "RESULT_1X2" },
          select: { market: true, option: true, optionLabel: true, odd: true },
        },
      },
      orderBy: [{ round: "asc" }, { scheduledAt: "asc" }],
    }),
    prisma.betMatch.findMany({
      where: { competition: "Série B", season, status: { in: allStatuses } },
      include: {
        odds: {
          where: { market: "RESULT_1X2" },
          select: { market: true, option: true, optionLabel: true, odd: true },
        },
      },
      orderBy: [{ round: "asc" }, { scheduledAt: "asc" }],
    }),
  ]);

  // Serializa datas para o client
  const serialize = (matches: typeof serieA) =>
    matches.map((m) => ({
      id: m.id,
      homeTeam: m.homeTeam,
      homeTeamShort: m.homeTeam.split(" ")[0] ?? m.homeTeam,
      homeCrest: m.homeCrest ?? null,
      awayTeam: m.awayTeam,
      awayTeamShort: m.awayTeam.split(" ")[0] ?? m.awayTeam,
      awayCrest: m.awayCrest ?? null,
      competition: m.competition,
      season: m.season,
      round: m.round ?? 0,
      scheduledAt: m.scheduledAt.toISOString(),
      status: m.status,
      homeScore: m.homeScore ?? null,
      awayScore: m.awayScore ?? null,
      odds: m.odds,
    }));

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-10">
      {/* Cabeçalho */}
      <section>
        <p className="kicker mb-1 text-xs font-semibold uppercase tracking-widest text-muted">
          Apostas
        </p>
        <h1 className="text-3xl font-semibold">Monte seu bilhete</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Navegue pelas partidas do Brasileirão, selecione seus palpites e registre seu bilhete.
          BOB analisa cada rodada com base em dados históricos e probabilidades calculadas.
        </p>
      </section>

      {/* Conteúdo interativo */}
      <ApostasClient serieA={serialize(serieA)} serieB={serialize(serieB)} />
    </div>
  );
}
