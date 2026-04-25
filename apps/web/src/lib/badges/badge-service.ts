/**
 * Serviço de Escudos dos Times - TheSportsDB
 * Cache local para evitar chamadas repetidas
 */

import { prisma } from "@/lib/db";

// Cache em memória
const badgeCache = new Map<string, { url: string | null; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

const THESPORTSDB_API = "https://www.thesportsdb.com/api/v1/json/3";

export type TeamBadge = {
  teamName: string;
  badgeUrl: string | null;
  bannerUrl: string | null;
  stadium: string | null;
  country: string;
};

/**
 * Busca escudo de um time pelo nome
 */
export async function fetchTeamBadge(teamName: string): Promise<string | null> {
  // Verificar cache
  const cached = badgeCache.get(teamName.toLowerCase());
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.url;
  }

  try {
    // Buscar na API TheSportsDB
    const response = await fetch(
      `${THESPORTSDB_API}/searchteams.php?t=${encodeURIComponent(teamName)}`,
      { next: { revalidate: 86400 } }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const team = data.teams?.[0];
    
    if (!team) {
      // Tentar busca parcial
      return await searchPartialTeam(teamName);
    }

    const badgeUrl = team.strTeamBadge || team.strTeamLogo || null;
    
    // Salvar no cache
    badgeCache.set(teamName.toLowerCase(), {
      url: badgeUrl,
      timestamp: Date.now(),
    });

    // Salvar no banco para persistência
    await saveBadgeToDatabase(teamName, badgeUrl);

    return badgeUrl;
  } catch (error) {
    console.error(`Error fetching badge for ${teamName}:`, error);
    return null;
  }
}

/**
 * Busca múltiplos escudos de uma vez
 */
export async function fetchBadgesBatch(teamNames: string[]): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();
  
  await Promise.all(
    teamNames.map(async (name) => {
      const badge = await fetchTeamBadge(name);
      results.set(name, badge);
    })
  );
  
  return results;
}

/**
 * Busca parcial quando o nome exato não encontra
 */
async function searchPartialTeam(teamName: string): Promise<string | null> {
  // Remover palavras comuns e buscar
  const keywords = teamName
    .replace(/FC|CF|AC|EC|SC|Clube|Esporte|Futebol/gi, "")
    .trim()
    .split(" ")
    .filter(w => w.length > 3);
  
  if (keywords.length === 0) return null;
  
  const searchTerm = keywords[0];
  
  try {
    const response = await fetch(
      `${THESPORTSDB_API}/searchteams.php?t=${encodeURIComponent(searchTerm)}`,
      { next: { revalidate: 86400 } }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    // Encontrar o time mais próximo
    const teams = data.teams || [];
    const match = teams.find((t: any) => 
      t.strTeam.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.strTeamShort?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    return match?.strTeamBadge || match?.strTeamLogo || null;
  } catch {
    return null;
  }
}

/**
 * Salva escudo no banco para cache persistente
 */
async function saveBadgeToDatabase(teamName: string, badgeUrl: string | null, tsdbId: string = "unknown") {
  try {
    // Tentar atualizar registro existente pelo nome
    const existing = await prisma.teamAsset.findFirst({
      where: { 
        name: { contains: teamName, mode: "insensitive" } 
      },
    });

    if (existing) {
      await prisma.teamAsset.update({
        where: { id: existing.id },
        data: { logoUrl: badgeUrl },
      });
    } else {
      // Criar novo registro
      await prisma.teamAsset.create({
        data: {
          tsdbId: tsdbId,
          name: teamName,
          logoUrl: badgeUrl,
          shortName: teamName.substring(0, 3).toUpperCase(),
          country: "Brazil",
        },
      });
    }
  } catch (error) {
    console.error("Error saving badge to database:", error);
  }
}

/**
 * Busca escudo do banco local
 */
export async function fetchBadgeFromDatabase(teamName: string): Promise<string | null> {
  try {
    const team = await prisma.teamAsset.findFirst({
      where: { 
        name: { contains: teamName, mode: "insensitive" }
      },
    });
    
    return team?.logoUrl || team?.badgeUrl || null;
  } catch {
    return null;
  }
}

/**
 * Força atualização do escudo
 */
export async function refreshTeamBadge(teamName: string): Promise<string | null> {
  badgeCache.delete(teamName.toLowerCase());
  return fetchTeamBadge(teamName);
}

/**
 * Retorna estatísticas do cache
 */
export function getBadgeCacheStats() {
  return {
    size: badgeCache.size,
    entries: Array.from(badgeCache.keys()),
  };
}

/**
 * Limpa o cache
 */
export function clearBadgeCache() {
  badgeCache.clear();
}
