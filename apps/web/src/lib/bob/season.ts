import { prisma } from "@/lib/db";

export async function resolveActiveSeasonYear(
  fallbackYear = new Date().getFullYear(),
): Promise<number> {
  try {
    const season = await prisma.season.findFirst({
      orderBy: [{ active: "desc" }, { year: "desc" }],
      select: { year: true },
    });

    return season?.year ?? fallbackYear;
  } catch {
    return fallbackYear;
  }
}
