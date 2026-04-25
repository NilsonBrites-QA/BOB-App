/**
 * /apostas — Criar Apostas (PRD criar-apostas.md)
 *
 * BOB ENTREGA uma aposta pronta por jogo da rodada (single-match coherent bet).
 * Odds típicas 1.28-2.00 (alavancagem) até no máximo ~30x em single-match.
 * Big Odds 100x+ ficam em /variacoes (múltiplas combinadas).
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { scoreMatch } from "@/lib/bob/engine";
import { buildCriarApostasForRound } from "@/lib/bob/engine/criar-apostas";
import { loadRoundData } from "@/lib/bob/round-loader";
import { getTeamAssetsMap } from "@/lib/bob/connectors/thesportsdb";
import { DEMO_ROUND_LABEL } from "@/lib/bob/demo-matches";
import { ApostasCriarClient, type CriarApostaView } from "./apostas-criar-client";

// ISR de 5 min: rodada raramente muda intra-dia
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
  // Auth
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const dbUser = await prisma.user
    .findUnique({ where: { email: user.email!.toLowerCase() }, select: { active: true } })
    .catch(() => null);
  if (!dbUser?.active) redirect("/login");

  const params = await searchParams;
  const season = params.season ? parseInt(params.season, 10) : new Date().getFullYear();
  const round = params.round ? parseInt(params.round, 10) : null;

  const roundData = await loadRoundData(season, round);

  const assetMap =
    roundData.source === "api" && roundData.assets.size > 0
      ? roundData.assets
      : await getTeamAssetsMap().catch(() => new Map());

  const teamBadges: Record<string, string | null> = {};
  assetMap.forEach((value, key) => { teamBadges[key] = value.badgeUrl; });

  const allScored = roundData.matches.map(scoreMatch);
  const apostasRaw = buildCriarApostasForRound(allScored);

  const apostas: CriarApostaView[] = apostasRaw.map((a) => ({
    matchId: a.matchId,
    homeTeam: a.homeTeam,
    awayTeam: a.awayTeam,
    homeBadge: teamBadges[a.homeTeam.toLowerCase()] ?? null,
    awayBadge: teamBadges[a.awayTeam.toLowerCase()] ?? null,
    competition: a.competition,
    profile: a.profile,
    picks: a.picks,
    combinedOdd: a.combinedOdd,
    combinedProbability: a.combinedProbability,
    confidence: a.confidence,
    bobNarrative: a.bobNarrative,
    riskLabel: a.riskLabel,
    alerts: a.alerts,
  }));

  const roundLabel = roundData.source === "api" && roundData.meta
    ? `Rodada ${roundData.meta.round} · ${roundData.meta.season}`
    : DEMO_ROUND_LABEL;

  return <ApostasCriarClient apostas={apostas} roundLabel={roundLabel} />;
}
