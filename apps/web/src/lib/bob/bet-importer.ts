/**
 * BOB — Importador de Partidas para Apostas
 *
 * Busca partidas do football-data.org e persiste na tabela bet_matches.
 * Usa upsert idempotente keyed em externalId para evitar duplicatas.
 *
 * Coberturas:
 *   - Série A (BSA) via football-data.org — plano free cobre
 *   - Série B (BSB) via football-data.org — tentativa, retorna null se indisponível
 */

import { prisma } from "@/lib/db";
import { getGatewayFootballDataCompetitionMatches } from "@/lib/data/sports-data-gateway";
import type { FDMatch } from "@/lib/data/sports-data-gateway";
import { BetMatchStatus } from "@/generated/prisma";

// ─── Mapeamento de status ──────────────────────────────────────────────────────

function mapStatus(fdStatus: string): BetMatchStatus {
  switch (fdStatus) {
    case "TIMED":
    case "SCHEDULED":
      return BetMatchStatus.SCHEDULED;
    case "IN_PLAY":
    case "PAUSED":
      return BetMatchStatus.LIVE;
    case "FINISHED":
      return BetMatchStatus.FINISHED;
    case "POSTPONED":
      return BetMatchStatus.POSTPONED;
    case "CANCELLED":
    default:
      return BetMatchStatus.CANCELLED;
  }
}

// ─── Importação de uma competição ─────────────────────────────────────────────

export type ImportResult = {
  competition: string;
  imported: number;
  updated: number;
  failed: number;
  error?: string;
};

async function importCompetition(
  competitionCode: string,
  competitionName: string,
  season: number
): Promise<ImportResult> {
  let matches: FDMatch[];

  try {
    const response = await getGatewayFootballDataCompetitionMatches(competitionCode, season);
    if (!response) throw new Error("insufficient:competition-matches");
    matches = response.matches ?? [];
  } catch (err) {
    return {
      competition: competitionCode,
      imported: 0,
      updated: 0,
      failed: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let imported = 0;
  let updated = 0;
  let failed = 0;

  for (const m of matches) {
    const externalId = `fd-${m.id}`;

    try {
      const existing = await prisma.betMatch.findUnique({
        where: { externalId },
        select: { id: true },
      });

      const data = {
        externalId,
        homeTeam: m.homeTeam.name ?? m.homeTeam.shortName,
        homeCrest: m.homeTeam.crest ?? null,
        awayTeam: m.awayTeam.name ?? m.awayTeam.shortName,
        awayCrest: m.awayTeam.crest ?? null,
        competition: competitionName,
        season,
        round: m.matchday ?? 0,
        scheduledAt: new Date(m.utcDate),
        status: mapStatus(m.status),
        homeScore: m.score?.fullTime?.home ?? null,
        awayScore: m.score?.fullTime?.away ?? null,
      };

      await prisma.betMatch.upsert({
        where: { externalId },
        create: data,
        update: {
          status: data.status,
          homeScore: data.homeScore,
          awayScore: data.awayScore,
          scheduledAt: data.scheduledAt,
        },
      });

      if (existing) updated++;
      else imported++;
    } catch (err) {
      console.error(`[bet-importer] Falha em ${externalId}:`, err);
      failed++;
    }
  }

  return { competition: competitionCode, imported, updated, failed };
}

// ─── Exportação principal ──────────────────────────────────────────────────────

/**
 * Importa partidas do Brasileirão Série A e Série B para a temporada fornecida.
 * Retorna um resumo com contagens por competição.
 */
export async function importMatches(season: number = new Date().getFullYear()): Promise<ImportResult[]> {
  const [serieA, serieB] = await Promise.all([
    importCompetition("BSA", "Série A", season),
    importCompetition("BSB", "Série B", season),
  ]);

  return [serieA, serieB];
}
