import { prisma } from "@/lib/db";

type BrainSeasonSummary = {
  initialSeason: number;
  availableSeasons: number[];
  latestSeasonWithRounds: number | null;
};

export async function resolveBrainSeasonSummary(): Promise<BrainSeasonSummary> {
  const fallbackYear = new Date().getFullYear();

  try {
    const seasons = await prisma.season.findMany({
      orderBy: [{ active: "desc" }, { year: "desc" }],
      take: 6,
      select: {
        year: true,
        _count: { select: { rounds: true } },
      },
    });

    const availableSeasons = seasons.map((season) => season.year);
    const latestSeasonWithRounds =
      seasons.find((season) => season._count.rounds > 0)?.year ?? null;

    return {
      initialSeason: latestSeasonWithRounds ?? availableSeasons[0] ?? fallbackYear,
      availableSeasons: availableSeasons.length > 0 ? availableSeasons : [fallbackYear],
      latestSeasonWithRounds,
    };
  } catch {
    return {
      initialSeason: fallbackYear,
      availableSeasons: [fallbackYear],
      latestSeasonWithRounds: null,
    };
  }
}
