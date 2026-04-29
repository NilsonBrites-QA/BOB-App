/**
 * BOB — Conector TheSportsDB (DB-First)
 *
 * Fonte de assets visuais (logos, banners, escudos) do Brasileirão.
 * API 100% gratuita — key "3" (patreon plan).
 *
 * ─── Política DB-First (PRD §9) ──────────────────────────────────────────────
 *
 * Toda leitura de asset segue este fluxo obrigatório:
 *
 *   1. Consulta `team_assets` no Prisma (banco local — L2 cache permanente).
 *   2. Se já existe → retorna diretamente. NENHUMA chamada HTTP é feita.
 *   3. Se não existe → checkTheSportsDB() autoriza a sincronização única.
 *   4. Chama a API externa, persiste o resultado em `team_assets` (upsert).
 *   5. Registra a operação em `api_sync_log` (Event Sourcing) + recordSync (L1).
 *   6. Em caso de falha da API → retorna null sem lançar exceção (fallback seguro).
 *
 * Imutabilidade garantida: upsert usa `create + update` sem DELETE.
 * A tabela `team_assets` cresce indefinidamente (append-only por tsdb_id único).
 *
 * ─── Funções Públicas ─────────────────────────────────────────────────────────
 *
 *   getTeamAsset(tsdbId)           → asset único DB-first (principal)
 *   getTeamAssetByName(name)       → lookup por nome (resolve via API se necessário)
 *   syncAllTeams()                 → sincroniza todos os times da liga que não
 *                                   estejam no banco (chamado no cron de setup)
 *   getTeamAssetsMap()             → Map<nomeLower, TeamAssetRow> para o dashboard
 *                                   (leitura pura de DB, sem API)
 *
 * ─── Funções Internas Preservadas ────────────────────────────────────────────
 *   tsdbFetch()       → HTTP raw (nunca chamar diretamente dos conectores)
 *   getTeams()        → lista bruta da API (apenas para syncAllTeams)
 *   getNextEvents()   → próximos jogos (sem DB-first: eventos mudam diariamente)
 *   getLastEvents()   → últimos resultados (sem DB-first: eventos mudam diariamente)
 *   searchTeam()      → busca por nome (sem DB-first: usado para resolver IDs)
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type TSDBTeam = {
  idTeam: string;
  strTeam: string;
  strTeamShort: string | null;
  strAlternate: string | null;
  strStadium: string | null;
  strStadiumThumb: string | null;
  strStadiumLocation: string | null;
  intStadiumCapacity: string | null;
  strTeamBadge: string | null;   // logo/escudo PNG
  strTeamBanner: string | null;  // banner HD
  strTeamJersey: string | null;
  strTeamLogo: string | null;    // logo alternativo
  strTeamFanart1: string | null;
  strCountry: string | null;
  strLeague: string | null;
  strDescriptionEN: string | null;
  strDescriptionPT: string | null;
};

export type TSDBEvent = {
  idEvent: string;
  strEvent: string;
  strHomeTeam: string;
  strAwayTeam: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  dateEvent: string;       // "YYYY-MM-DD"
  strTime: string | null;  // "HH:MM:SS"
  strStatus: string | null;
  intRound: string | null;
  strLeague: string | null;
  strSeason: string | null;
  strThumb: string | null;
  strHomeTeamBadge: string | null;
  strAwayTeamBadge: string | null;
};

/**
 * Linha do model TeamAsset retornada pelas funções DB-first.
 * Subconjunto dos campos — apenas os usados pelos consumidores.
 */
export type TeamAssetRow = {
  id: string;
  tsdbId: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  badgeUrl: string | null;
  bannerUrl: string | null;
  stadiumName: string | null;
  stadiumThumb: string | null;
  country: string | null;
  footballDataId: number | null;
  apiFootballId: number | null;
  createdAt: Date;
};

// ─── Imports ──────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db";
import { revalidateTag, unstable_cache } from "next/cache";
import { checkTheSportsDB, recordSync } from "./cache-gate";

// ─── Fetch base (HTTP puro — uso restrito interno) ────────────────────────────

const BASE = "https://www.thesportsdb.com/api/v1/json/3";

/**
 * Realiza uma chamada HTTP ao TheSportsDB.
 * USO RESTRITO: apenas funções internas deste módulo podem chamar tsdbFetch.
 * Consumidores externos sempre passam pelas funções DB-first (getTeamAsset, etc.).
 */
async function tsdbFetch<T>(path: string, revalidate: number): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    next: { revalidate },
  });

  if (!res.ok) {
    throw new Error(`TheSportsDB erro HTTP ${res.status} em ${path}`);
  }

  return (await res.json()) as T;
}

// ─── Endpoints de leitura bruta (sem DB-first) ───────────────────────────────
//
// Estas funções acessam diretamente a API sem verificar o banco.
// São usadas apenas por syncAllTeams() e pela orquestração interna.
// Consumidores externos NÃO devem chamar estas funções; usem getTeamAsset().

/** Nomes de liga aceitos pelo TheSportsDB para o Brasileirão */
const BSA_LEAGUE = "Brazilian Serie A";

/**
 * Todos os times da Série A com assets visuais (bruto da API).
 * Chamado exclusivamente por syncAllTeams(). Cache Next.js: 7 dias.
 */
export async function getTeams(): Promise<TSDBTeam[]> {
  const data = await tsdbFetch<{ teams: TSDBTeam[] | null }>(
    `/search_all_teams.php?l=${encodeURIComponent(BSA_LEAGUE)}`,
    604800
  );
  return data.teams ?? [];
}

/**
 * Próximos 15 eventos (jogos) da Série A.
 * Sem DB-first: eventos futuros mudam diariamente.
 * Cache Next.js: 4h.
 */
export async function getNextEvents(): Promise<TSDBEvent[]> {
  const data = await tsdbFetch<{ events: TSDBEvent[] | null }>(
    `/eventsnextleague.php?id=4350`, // 4350 = Brazilian Serie A no TheSportsDB
    14400
  );
  return data.events ?? [];
}

/**
 * Últimos 15 resultados da Série A.
 * Sem DB-first: resultados são adicionados diariamente.
 * Cache Next.js: 4h.
 */
export async function getLastEvents(): Promise<TSDBEvent[]> {
  const data = await tsdbFetch<{ events: TSDBEvent[] | null }>(
    `/eventspastleague.php?id=4350`,
    14400
  );
  return data.events ?? [];
}

/**
 * Busca time por nome (para resolver IDs entre APIs).
 * Sem DB-first: usado pontualmente para correlação de IDs entre fontes.
 * Cache Next.js: 7 dias.
 */
export async function searchTeam(name: string): Promise<TSDBTeam | null> {
  const data = await tsdbFetch<{ teams: TSDBTeam[] | null }>(
    `/searchteams.php?t=${encodeURIComponent(name)}`,
    604800
  );
  return data.teams?.[0] ?? null;
}

// ─── Helpers internos de persistência ────────────────────────────────────────

/**
 * Persiste (ou atualiza, se tsdb_id já existir) um asset de time no banco.
 * Usa upsert para idempotência: re-executar com o mesmo tsdbId é seguro.
 * NÃO usa onConflict para delete/replace — apenas atualiza os campos de URL.
 *
 * Retorna a linha persistida (TeamAssetRow).
 */
async function persistTeamAsset(t: TSDBTeam): Promise<TeamAssetRow> {
  const persisted = await prisma.teamAsset.upsert({
    where: { tsdbId: t.idTeam },
    create: {
      tsdbId:      t.idTeam,
      name:        t.strTeam,
      shortName:   t.strTeamShort  ?? null,
      // strTeamBadge = escudo redondo principal (use no UI = badgeUrl)
      // strTeamLogo  = logotipo tipográfico (frequentemente null) = logoUrl
      badgeUrl:    t.strTeamBadge  ?? null,
      logoUrl:     t.strTeamLogo   ?? null,
      bannerUrl:   t.strTeamBanner ?? null,
      stadiumName: t.strStadium    ?? null,
      stadiumThumb: t.strStadiumThumb ?? null,
      country:     t.strCountry    ?? null,
    },
    update: {
      // Atualiza URLs caso a API retorne valores novos (ex: rebranding de escudo).
      // Não sobrescreve IDs cruzados (footballDataId/apiFootballId) — só o
      // conector de correlação deve preencher esses campos.
      name:        t.strTeam,
      shortName:   t.strTeamShort  ?? null,
      badgeUrl:    t.strTeamBadge  ?? null,
      logoUrl:     t.strTeamLogo   ?? null,
      bannerUrl:   t.strTeamBanner ?? null,
      stadiumName: t.strStadium    ?? null,
      stadiumThumb: t.strStadiumThumb ?? null,
      country:     t.strCountry    ?? null,
    },
  });

  revalidateTag("team-assets", "max");

  return persisted;
}

/**
 * Registra uma sincronização bem-sucedida no api_sync_log (Event Sourcing — L2)
 * e no Map em memória do cache-gate (L1).
 * Chamado SOMENTE após confirmação de resposta HTTP 2xx ou de dado válido.
 *
 * @param tsdbId      - ID do time no TheSportsDB
 * @param recordCount - quantos registros foram salvos (1 para asset único)
 */
async function logSync(tsdbId: string, recordCount: number): Promise<void> {
  const cacheKey = `thesportsdb-team-${tsdbId}`;

  // L1: registro em memória (imediato, sem I/O)
  recordSync("thesportsdb", cacheKey);

  // L2: registro persistente no banco (Event Sourcing)
  try {
    await prisma.apiSyncLog.create({
      data: {
        source:      "thesportsdb",
        cacheKey,
        windowLabel: null,   // TheSportsDB não tem janelas de tempo
        kickoffAt:   null,
        statusCode:  200,
        recordCount,
        notes:       `Asset do time ${tsdbId} sincronizado (DB-first: sync único).`,
      },
    });
  } catch (err) {
    // Log de sync falhou: não interrompe o fluxo principal.
    // O L1 já foi registrado; o banco tentará novamente no próximo sync.
    console.error(`[TheSportsDB] Falha ao registrar api_sync_log para ${tsdbId}:`, err);
  }
}

// ─── Funções públicas DB-First ────────────────────────────────────────────────

/**
 * [PRINCIPAL] Retorna o asset de um time pelo ID do TheSportsDB.
 *
 * Fluxo:
 *   1. Consulta `team_assets` no banco.
 *   2. Se encontrado → retorna imediatamente (zero chamadas HTTP).
 *   3. Se não encontrado → consulta API, persiste, registra sync.
 *   4. Se API falhar → loga o erro e retorna null (fallback seguro).
 *
 * @param tsdbId - ID do time no TheSportsDB (ex: "133613" para o Flamengo)
 */
export async function getTeamAsset(tsdbId: string): Promise<TeamAssetRow | null> {
  // ── Passo 1: Consultar banco (L2) ─────────────────────────────────────────
  const cached = await prisma.teamAsset.findUnique({
    where: { tsdbId },
  });

  // ── Passo 2: Cache-gate — verifica se sincronização é necessária ───────────
  const decision = checkTheSportsDB(tsdbId, cached !== null);

  if (!decision.allowed) {
    // Banco já tem o asset. Retorna sem nenhuma chamada HTTP.
    console.debug(`[TheSportsDB] ${decision.reason}`);
    return cached;
  }

  // ── Passo 3: Sincronização única autorizada — chamar API externa ───────────
  console.info(`[TheSportsDB] ${decision.reason}`);

  try {
    const data = await tsdbFetch<{ teams: TSDBTeam[] | null }>(
      `/lookupteam.php?id=${encodeURIComponent(tsdbId)}`,
      // revalidate longo: assets não mudam. Next.js usa ISR como fallback de API gateway.
      604800
    );

    const team = data.teams?.[0] ?? null;

    if (!team) {
      // API retornou 200 mas sem dados — time não encontrado.
      console.warn(`[TheSportsDB] Time ${tsdbId} não encontrado na API. Retornando null.`);
      return null;
    }

    // ── Passo 4: Persistir asset permanentemente no banco ──────────────────
    const persisted = await persistTeamAsset(team);

    // ── Passo 5: Registrar sync no api_sync_log (L2) e L1 ─────────────────
    await logSync(tsdbId, 1);

    return persisted;

  } catch (err) {
    // ── Fallback Seguro: API falhou ───────────────────────────────────────
    // PRD §15.3: "Sinal interrompido. Rebaixando nível de confiança da Âncora."
    // Para assets, isso significa: retornar null sem espalhar a exceção.
    // O consumidor (dashboard, connectors/index.ts) deve tratar null com graceful degradation.
    console.error(
      `[TheSportsDB] Falha ao buscar asset do time ${tsdbId}. ` +
      `Sinal interrompido — usando cache disponível (null).`,
      err
    );
    return cached ?? null;
  }
}

/**
 * Retorna o asset de um time pelo nome (case-insensitive).
 *
 * Fluxo:
 *   1. Busca no banco pelo nome exato (case-insensitive).
 *   2. Se encontrado → retorna (DB-first).
 *   3. Se não → resolve o ID via searchTeam() (chamada HTTP ao TheSportsDB).
 *   4. Com o ID em mãos, delega para getTeamAsset() que faz o sync completo.
 *   5. Se searchTeam() retornar null → retorna null (fallback seguro).
 *
 * @param name - Nome do time (ex: "Flamengo", "Clube de Regatas do Flamengo")
 */
export async function getTeamAssetByName(name: string): Promise<TeamAssetRow | null> {
  // ── Passo 1: Consultar banco pelo nome ─────────────────────────────────────
  const cached = await prisma.teamAsset.findFirst({
    where: {
      OR: [
        { name:      { equals: name, mode: "insensitive" } },
        { shortName: { equals: name, mode: "insensitive" } },
      ],
    },
  });

  if (cached) {
    console.debug(`[TheSportsDB] Asset de "${name}" encontrado no banco (DB-first).`);
    return cached;
  }

  // ── Passo 2: Resolver ID via API (busca por nome) ──────────────────────────
  console.info(`[TheSportsDB] "${name}" não encontrado no banco. Resolvendo ID via API...`);

  try {
    const found = await searchTeam(name);

    if (!found) {
      console.warn(`[TheSportsDB] Time "${name}" não encontrado na API.`);
      return null;
    }

    // ── Passo 3: Delegar para getTeamAsset com o ID resolvido ──────────────
    return getTeamAsset(found.idTeam);

  } catch (err) {
    console.error(
      `[TheSportsDB] Falha ao resolver ID do time "${name}". Sinal interrompido.`,
      err
    );
    return null;
  }
}

/**
 * Sincroniza todos os times da liga que ainda não estão no banco.
 * Chamado pelo cron de setup inicial (ex: /api/cron/setup-assets).
 *
 * Fluxo:
 *   1. Busca todos os times da Série A via API (getTeams).
 *   2. Para cada time, verifica se já existe no banco (checkTheSportsDB).
 *   3. Persiste apenas os que ainda não têm registro (sync único por time).
 *   4. Retorna relatório: { synced, skipped, failed }.
 *
 * Por usar verificação individual, é idempotente e re-executável sem risco.
 */
export async function syncAllTeams(): Promise<{
  synced: number;
  skipped: number;
  failed: number;
}> {
  let synced = 0;
  let skipped = 0;
  let failed = 0;

  let teams: TSDBTeam[];
  try {
    teams = await getTeams();
  } catch (err) {
    console.error("[TheSportsDB] syncAllTeams: falha ao buscar lista de times da API.", err);
    return { synced: 0, skipped: 0, failed: 1 };
  }

  for (const t of teams) {
    const existing = await prisma.teamAsset.findUnique({
      where: { tsdbId: t.idTeam },
      select: { id: true },
    });

    const decision = checkTheSportsDB(t.idTeam, existing !== null);

    if (!decision.allowed) {
      // Time já sincronizado: pula sem chamada HTTP adicional.
      skipped++;
      continue;
    }

    try {
      await persistTeamAsset(t);
      await logSync(t.idTeam, 1);
      synced++;
    } catch (err) {
      console.error(`[TheSportsDB] syncAllTeams: falha ao persistir time ${t.idTeam} (${t.strTeam}).`, err);
      failed++;
    }
  }

  console.info(
    `[TheSportsDB] syncAllTeams concluído — ` +
    `sincronizados: ${synced}, pulados (DB-first): ${skipped}, falhas: ${failed}.`
  );

  return { synced, skipped, failed };
}

// ─── Mapa de assets para o dashboard ─────────────────────────────────────────

const loadAllTeamAssets = unstable_cache(
  async () => prisma.teamAsset.findMany(),
  ["team-assets-map"],
  {
    revalidate: 60 * 60 * 12,
    tags: ["team-assets"],
  },
);

/**
 * Retorna Map<nomeLower, TeamAssetRow> com TODOS os assets do banco.
 * Leitura pura de DB — sem nenhuma chamada à API externa.
 * Usado pelo dashboard/connectors para enriquecer MatchInput com logos.
 *
 * Indexado por nome em lowercase para lookup case-insensitive rápido.
 * Também indexa por shortName caso exista.
 */
export async function getTeamAssetsMap(): Promise<Map<string, TeamAssetRow>> {
  const rows = await loadAllTeamAssets();
  const map  = new Map<string, TeamAssetRow>();

  for (const row of rows) {
    // Mantém keys lowercase (compat com código antigo)
    map.set(row.name.toLowerCase(), row);
    if (row.shortName) {
      map.set(row.shortName.toLowerCase(), row);
    }
    // Adiciona keys normalizadas (acentos removidos, sufixos FC/SC/etc removidos)
    const normName = normalizeTeamName(row.name);
    if (normName) map.set(normName, row);
    if (row.shortName) {
      const normShort = normalizeTeamName(row.shortName);
      if (normShort) map.set(normShort, row);
    }
  }

  return map;
}

/**
 * Normaliza nome de time pra matching robusto cross-source.
 * Estratégia: lowercase + remove acentos + remove sufixos comuns (FC, SC, EC…).
 *
 * Resolve casos como:
 *   "Atlético-MG"   → "atletico mg"
 *   "Flamengo FC"   → "flamengo"
 *   "Atletico Mineiro" → "atletico mineiro"
 */
export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/-/g, " ")
    .replace(/\s+(fc|sc|ec|ca|se|cr|ac|af)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Busca o asset (escudo, etc) de um time aplicando múltiplas estratégias.
 * Use isso em qualquer página em vez de `assetMap.get(name.toLowerCase())`.
 *
 * Tenta:
 *   1. Lookup direto (lowercase) — compat com código existente
 *   2. Lookup normalizado (sem acentos, sem sufixos)
 *   3. Lookup parcial: alguma chave do map é prefixo/contém o nome normalizado
 */
export function findTeamAsset(
  name: string,
  map: Map<string, TeamAssetRow>,
): TeamAssetRow | null {
  if (!name) return null;

  const lower = name.toLowerCase();
  const direct = map.get(lower);
  if (direct) return direct;

  const norm = normalizeTeamName(name);
  if (!norm) return null;

  const normHit = map.get(norm);
  if (normHit) return normHit;

  // Busca parcial: nome contido em alguma key, ou key contida no nome
  for (const [key, row] of map) {
    if (key === norm) return row;
    if (norm.length >= 4 && (key.includes(norm) || norm.includes(key))) {
      return row;
    }
  }
  return null;
}
