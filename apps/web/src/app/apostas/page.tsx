/**
 * BOB — /apostas (Criar Apostas)
 *
 * O BOB entrega apostas prontas, uma por jogo da rodada.
 * O usuário copia o ticket — não monta nada.
 *
 * Server Component: auth + dados → ApostasClient (UI interativa).
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { scoreMatch } from "@/lib/bob/engine";
import { buildCriarApostasForRound } from "@/lib/bob/engine/criar-apostas";
import { loadRoundData } from "@/lib/bob/round-loader";
import { DEMO_ROUND_LABEL } from "@/lib/bob/demo-matches";
import { loadAllBadgesFromDb, resolveBadge } from "@/lib/badges/badge-service";
import { ApostasClient } from "./apostas-client";
import type { TicketView } from "./apostas-client";

export const revalidate = 300;

export const metadata = {
  title: "Criar Apostas · BOB",
  description: "Apostas prontas por jogo da rodada — entregue pelo BOB.",
};

export default async function ApostasPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; round?: string }>;
}) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const dbUser = await prisma.user
    .findUnique({
      where: { email: user.email!.toLowerCase() },
      select: { active: true },
    })
    .catch(() => null);
  if (!dbUser?.active) redirect("/login");

  // ── Dados da rodada ───────────────────────────────────────────────────────
  const params = await searchParams;
  const season = params.season ? parseInt(params.season, 10) : new Date().getFullYear();
  const round = params.round ? parseInt(params.round, 10) : null;

  const roundData = await loadRoundData(season, round);

  // ── Gerar tickets pelo engine ─────────────────────────────────────────────
  const allScored = roundData.matches.map(scoreMatch);
  const apostasRaw = buildCriarApostasForRound(allScored);

  // ── ESCUDOS DB-FIRST (PRD §9) ─────────────────────────────────────────────
  const badgeMap = await loadAllBadgesFromDb();

  const tickets: TicketView[] = apostasRaw.map((a) => {
    return {
      matchId:            a.matchId,
      homeTeam:           a.homeTeam,
      awayTeam:           a.awayTeam,
      homeCrest:          resolveBadge(a.homeTeam, badgeMap),
      awayCrest:          resolveBadge(a.awayTeam, badgeMap),
      competition:        a.competition,
      profile:            a.profile,
      picks:              a.picks,
      combinedOdd:        a.combinedOdd,
      combinedProbability: a.combinedProbability,
      confidence:         a.confidence,
      bobNarrative:       a.bobNarrative,
      riskLabel:          a.riskLabel,
      alerts:             a.alerts,
      result:             a.result,
    };
  });

  const roundLabel =
    roundData.source === "api" && roundData.meta
      ? `Rodada ${roundData.meta.round} · ${roundData.meta.season}`
      : DEMO_ROUND_LABEL;

  return (
    <ApostasClient
      tickets={tickets}
      roundLabel={roundLabel}
      isDemo={roundData.source === "demo"}
    />
  );
}
