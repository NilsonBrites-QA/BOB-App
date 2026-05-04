/**
 * BOB — Serviço de Escudos dos Times
 *
 * PARADIGMA DB-FIRST ABSOLUTO (PRD §9):
 *   O frontend NUNCA chama TheSportsDB ou qualquer API externa.
 *   Escudos são sincronizados 1x no banco via cron (/api/cron/import-matches)
 *   e servidos a partir da tabela `team_assets`.
 *
 * Histórico de mudança:
 *   - Antes: fetchTeamBadge() fazia HTTP GET no TheSportsDB a cada render → rate-limit, escudos sumiam.
 *   - Agora: apenas leitura do PostgreSQL. Zero chamadas externas neste módulo.
 */

import { prisma } from "@/lib/db";

// ─── Cache em memória (L1) — sobrevive ao request, reseta no cold start ────
// Complementa o DB (L2) para evitar N+1 queries em componentes com muitos times.
const memoryCache = new Map<string, string | null>();

export type TeamBadgeInfo = {
  teamName: string;
  badgeUrl: string | null;
  logoUrl: string | null;
};

// ─── Normalização de nome ─────────────────────────────────────────────────────
// Garante matching case-insensitive e sem acentos para lookup.

function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .trim();
}

/**
 * Busca o escudo de UM time a partir do banco (TeamAsset).
 * NUNCA faz chamada HTTP externa.
 *
 * @returns URL do badge/crest ou null se não encontrado no DB.
 */
export async function getTeamBadgeFromDb(teamName: string): Promise<string | null> {
  const key = normalizeTeamName(teamName);

  // L1: cache em memória
  if (memoryCache.has(key)) {
    return memoryCache.get(key) ?? null;
  }

  // L2: banco de dados (TeamAsset)
  try {
    const asset = await prisma.teamAsset.findFirst({
      where: {
        name: { contains: teamName, mode: "insensitive" },
      },
      select: { badgeUrl: true, logoUrl: true },
    });

    const url = asset?.badgeUrl || asset?.logoUrl || null;
    memoryCache.set(key, url);
    return url;
  } catch (err) {
    console.error(`[BadgeService] Erro ao buscar escudo no DB para "${teamName}":`, err);
    return null;
  }
}

/**
 * Carrega TODOS os escudos da tabela team_assets de uma vez.
 * Ideal para server components que renderizam a rodada completa
 * (dashboard, variações, estatísticas).
 *
 * Retorna um Map<teamName, badgeUrl> para lookup O(1).
 *
 * PRD §9: uma única query ao banco, zero chamadas externas.
 */
export async function loadAllBadgesFromDb(): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();

  try {
    const assets = await prisma.teamAsset.findMany({
      select: { name: true, badgeUrl: true, logoUrl: true, shortName: true },
    });

    for (const asset of assets) {
      const url = asset.badgeUrl || asset.logoUrl || null;
      // Indexa pelo nome completo e pelo shortName
      result.set(asset.name, url);
      memoryCache.set(normalizeTeamName(asset.name), url);

      if (asset.shortName) {
        result.set(asset.shortName, url);
      }
    }
  } catch (err) {
    console.error("[BadgeService] Erro ao carregar escudos do DB:", err);
  }

  return result;
}

/**
 * Resolve o badge de um time tentando match exato, parcial e fuzzy.
 * Usa o Map pré-carregado por loadAllBadgesFromDb().
 *
 * @param teamName  Nome do time (ex: "Palmeiras", "Atlético-MG")
 * @param badgeMap  Map carregado por loadAllBadgesFromDb()
 * @returns URL do escudo ou null (TeamShield mostrará fallback SVG)
 */
export function resolveBadge(
  teamName: string,
  badgeMap: Map<string, string | null>,
): string | null {
  // 1. Match exato
  if (badgeMap.has(teamName)) return badgeMap.get(teamName) ?? null;

  // 2. Match case-insensitive
  for (const [key, val] of badgeMap) {
    if (key.toLowerCase() === teamName.toLowerCase()) return val;
  }

  // 3. Match parcial (contém)
  const normalized = normalizeTeamName(teamName);
  for (const [key, val] of badgeMap) {
    if (normalizeTeamName(key).includes(normalized) || normalized.includes(normalizeTeamName(key))) {
      return val;
    }
  }

  return null;
}

// ─── Retrocompatibilidade ────────────────────────────────────────────────────
// Funções legadas redirecionam para o novo paradigma DB-first.
// Marcadas como @deprecated — serão removidas em release futura.

/**
 * @deprecated Use getTeamBadgeFromDb() — esta função NÃO faz mais HTTP.
 */
export async function fetchTeamBadge(teamName: string): Promise<string | null> {
  return getTeamBadgeFromDb(teamName);
}

/**
 * @deprecated Use loadAllBadgesFromDb() + resolveBadge() — sem chamadas externas.
 */
export async function fetchBadgesBatch(teamNames: string[]): Promise<Map<string, string | null>> {
  const allBadges = await loadAllBadgesFromDb();
  const results = new Map<string, string | null>();
  for (const name of teamNames) {
    results.set(name, resolveBadge(name, allBadges));
  }
  return results;
}

/**
 * @deprecated Leitura direta do DB — alias para getTeamBadgeFromDb().
 */
export async function fetchBadgeFromDatabase(teamName: string): Promise<string | null> {
  return getTeamBadgeFromDb(teamName);
}
