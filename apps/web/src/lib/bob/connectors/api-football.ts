/**
 * BOB — Cliente HTTP para a API-Football (v3.football.api-sports.io)
 *
 * Estratégia de cache com Next.js fetch:
 *   standings/fixtures  → revalidate 86400 (24h)
 *   team stats          → revalidate 86400 (24h)
 *   H2H                 → revalidate 604800 (7 dias — resultado histórico não muda)
 *   odds                → revalidate 10800 (3h)
 *   injuries            → revalidate 14400 (4h)
 *
 * Budget free: 100 req/dia. Com o cache acima, o uso real fica em ~20-25 req/dia.
 * O header "x-ratelimit-requests-remaining" é logado para monitorar o consumo.
 */

/**
 * BOB — Cliente HTTP para a API-Football (v3.football.api-sports.io)
 *
 * ─── Arquitetura de Cache (PRD §9 — "O Bisturi") ──────────────────────────────
 *
 * As funções deste módulo existem em dois sabores:
 *
 *   RAW (sem sufixo):    Acesso direto à API — sem validação de janela.
 *                        Usadas por cron jobs (backfill, post-round) que precisam
 *                        de dados históricos ou de resultado independente de horário.
 *
 *   GATED (sufixo *Gated): Acesso controlado — bloqueado fora das janelas do PRD.
 *                           Usadas pelo pipeline oficial via connectors/index.ts.
 *                           Requerem `kickoffAt: Date` (kickoff do jogo alvo).
 *                           Retornam `AFResponse<T> | null` (null = fora de janela).
 *
 * Janelas da API-Football ("O Bisturi"):
 *   T-48h → fixtures + odds base         (48h → 36h antes do kickoff)
 *   T-24h → predições + team stats       (24h → 12h antes do kickoff)
 *   T-1h  → escalações oficiais          (90min → kickoff)
 *
 * Budget free: 100 req/dia. O padrão Gated garante ~6-10 req/rodada.
 * O header "x-ratelimit-requests-remaining" é logado para monitorar o consumo.
 */

import { prisma } from "@/lib/db";
import { checkApiFootball, recordSync, type WindowName } from "./cache-gate";

import type {
  AFResponse,
  AFStandingsGroup,
  AFFixtureItem,
  AFTeamStatistics,
  AFInjuryItem,
  AFOddsItem,
} from "./api-football-types";

const BASE_URL = "https://v3.football.api-sports.io";

/** Liga Brasileirão Série A no API-Football */
export const BSA_LEAGUE = 71;

// ─── Fetch base ───────────────────────────────────────────────────────────────

async function afFetch<T>(
  path: string,
  revalidate: number
): Promise<AFResponse<T>> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    throw new Error(
      "API_FOOTBALL_KEY não configurado. Adicione a variável ao .env.local"
    );
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "x-apisports-key": key },
    next: { revalidate },
  });

  const remaining = res.headers.get("x-ratelimit-requests-remaining");
  if (remaining !== null && parseInt(remaining, 10) < 10) {
    console.warn(`[API-Football] Atenção: apenas ${remaining} requisições restantes hoje.`);
  }

  if (!res.ok) {
    throw new Error(
      `API-Football erro HTTP ${res.status} em ${path}. Restantes: ${remaining ?? "?"}`
    );
  }

  const data = (await res.json()) as AFResponse<T>;

  // A API retorna HTTP 200 mesmo em erro — verificar corpo
  if (
    !Array.isArray(data.errors) &&
    Object.keys(data.errors as Record<string, string>).length > 0
  ) {
    throw new Error(
      `API-Football erro de API em ${path}: ${JSON.stringify(data.errors)}`
    );
  }

  return data;
}

// ─── Helpers internos: Log de Sync (L1 + L2) ────────────────────────────────

/**
 * Consulta o banco (L2) para obter o timestamp da última sincronização
 * bem-sucedida de um endpoint+janela. Passado ao cache-gate para que ele
 * decida se a janela já foi sincronizada ou não.
 */
async function _getLastSyncAF(
  cacheKey: string,
  windowLabel: WindowName
): Promise<Date | null> {
  const row = await prisma.apiSyncLog.findFirst({
    where: { source: "api-football", cacheKey, windowLabel },
    orderBy: { syncedAt: "desc" },
    select: { syncedAt: true },
  });
  return row?.syncedAt ?? null;
}

/**
 * Registra uma sincronização bem-sucedida:
 *   L1 → Map em memória do cache-gate (imediato, sem I/O)
 *   L2 → Tabela api_sync_log no banco (Event Sourcing, assíncrono)
 *
 * Chamado APENAS após confirmação de resposta 2xx da API.
 * Falhas no log não interrompem o fluxo principal.
 */
async function _logSyncAF(
  cacheKey: string,
  windowLabel: WindowName,
  kickoffAt: Date,
  recordCount: number
): Promise<void> {
  recordSync("api-football", cacheKey, windowLabel);
  try {
    await prisma.apiSyncLog.create({
      data: {
        source:      "api-football",
        cacheKey,
        windowLabel,
        kickoffAt,
        statusCode:  200,
        recordCount,
        notes:       `Janela ${windowLabel} — sync autorizado pelo cache-gate.`,
      },
    });
  } catch (err) {
    console.error(`[API-Football] Falha ao registrar api_sync_log (${cacheKey}):`, err);
  }
}

// ─── Endpoints RAW (sem controle de janela) ───────────────────────────────────

/**
 * Tabela de classificação do Brasileirão Série A.
 * Retorna 3 grupos: overall, home, away.
 * Cache: 24h
 */
export async function getStandings(season: number) {
  return afFetch<AFStandingsGroup>(
    `/standings?league=${BSA_LEAGUE}&season=${season}`,
    86400
  );
}

/**
 * Fixtures de uma rodada específica.
 * ex: round=15 → "Regular Season - 15"
 * Cache: 24h
 */
export async function getFixturesByRound(season: number, round: number) {
  const roundStr = encodeURIComponent(`Regular Season - ${round}`);
  return afFetch<AFFixtureItem>(
    `/fixtures?league=${BSA_LEAGUE}&season=${season}&round=${roundStr}`,
    86400
  );
}

/**
 * Fixtures de qualquer liga (para copa paralela).
 * Cache: 4h (pode ter jogos agendados esta semana)
 */
export async function getFixturesByLeague(leagueId: number, season: number) {
  return afFetch<AFFixtureItem>(
    `/fixtures?league=${leagueId}&season=${season}&next=20`,
    14400
  );
}

/**
 * Últimos N jogos de um time (todas as competições).
 * Cache: 24h
 */
export async function getTeamLastFixtures(
  teamId: number,
  season: number,
  last = 5
) {
  return afFetch<AFFixtureItem>(
    `/fixtures?team=${teamId}&league=${BSA_LEAGUE}&season=${season}&last=${last}`,
    86400
  );
}

/**
 * Histórico de confronto direto entre dois times.
 * Cache: 7 dias (resultado histórico é imutável)
 */
export async function getH2H(homeId: number, awayId: number, last = 10) {
  return afFetch<AFFixtureItem>(
    `/fixtures/headtohead?h2h=${homeId}-${awayId}&last=${last}&league=${BSA_LEAGUE}`,
    604800
  );
}

/**
 * Estatísticas de um time na temporada (form, home/away breakdown, gols).
 * Cache: 24h
 */
export async function getTeamStats(teamId: number, season: number) {
  return afFetch<AFTeamStatistics>(
    `/teams/statistics?league=${BSA_LEAGUE}&season=${season}&team=${teamId}`,
    86400
  );
}

/**
 * Lesões e suspensões por data.
 * Retorna todos os desfalques confirmados para jogos na data informada.
 * Cache: 4h
 */
export async function getInjuriesByDate(season: number, date: string) {
  return afFetch<AFInjuryItem>(
    `/injuries?league=${BSA_LEAGUE}&season=${season}&date=${date}`,
    14400
  );
}

/**
 * Odds pré-jogo por fictura.
 * Preferir API-Football bookmaker id=8 (Bet365) quando disponível, senão qualquer.
 * Cache: 3h
 */
export async function getOdds(fixtureId: number) {
  return afFetch<AFOddsItem>(
    `/odds?fixture=${fixtureId}&bookmaker=8`,
    10800
  );
}

/**
 * Detecta o número da rodada atual (próximo jogo agendado no BSA).
 * Retorna null se não houver jogos agendados (entressafra, etc.)
 * Cache: 1h
 */
export async function getCurrentRound(season: number): Promise<number | null> {
  const res = await afFetch<AFFixtureItem>(
    `/fixtures?league=${BSA_LEAGUE}&season=${season}&next=1`,
    3600
  );

  const next = res.response[0];
  if (!next) return null;

  const roundStr = next.league.round; // ex: "Regular Season - 15"
  const match = roundStr.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

// ─── Endpoints GATED (pipeline oficial — janelas obrigatórias) ────────────────
//
// Usados exclusivamente pelo connectors/index.ts (orquestrador oficial).
// Retornam null quando fora da janela — o chamador trata null como fallback.

/**
 * [GATED — T-48h] Fixtures de uma rodada específica.
 *
 * Janela: 48h → 36h antes do kickoff do primeiro jogo da rodada.
 * Objetivo: confirmar fixtures agendados + odds base para o Anchor Score.
 *
 * @param kickoffAt - Kickoff do primeiro jogo da rodada (UTC)
 */
export async function getFixturesByRoundGated(
  season: number,
  round: number,
  kickoffAt: Date
): Promise<AFResponse<AFFixtureItem> | null> {
  const cacheKey = `af-fixtures-s${season}-r${round}`;
  const lastSyncedAt = await _getLastSyncAF(cacheKey, "T-48h");
  const decision = checkApiFootball(cacheKey, kickoffAt, lastSyncedAt);

  console.info(`[API-Football/Gated] ${decision.reason}`);
  if (!decision.allowed) return null;

  const result = await getFixturesByRound(season, round);
  await _logSyncAF(cacheKey, "T-48h", kickoffAt, result.results);
  return result;
}

/**
 * [GATED — T-48h] Odds pré-jogo por fixture.
 *
 * Janela: 48h → 36h antes do kickoff.
 * Objetivo: odds base para cálculo de de-vigging e Anchor Score.
 *
 * @param kickoffAt - Kickoff do jogo específico (UTC)
 */
export async function getOddsGated(
  fixtureId: number,
  kickoffAt: Date
): Promise<AFResponse<AFOddsItem> | null> {
  const cacheKey = `af-odds-fixture-${fixtureId}`;
  const lastSyncedAt = await _getLastSyncAF(cacheKey, "T-48h");
  const decision = checkApiFootball(cacheKey, kickoffAt, lastSyncedAt);

  console.info(`[API-Football/Gated] ${decision.reason}`);
  if (!decision.allowed) return null;

  const result = await getOdds(fixtureId);
  await _logSyncAF(cacheKey, "T-48h", kickoffAt, result.results);
  return result;
}

/**
 * [GATED — T-24h] Estatísticas de um time na temporada.
 *
 * Janela: 24h → 12h antes do kickoff.
 * Objetivo: alimentar fatores de processo (form, home/away breakdown)
 * no Anchor Score antes da geração das variações.
 *
 * @param kickoffAt - Kickoff do jogo do time (UTC)
 */
export async function getTeamStatsGated(
  teamId: number,
  season: number,
  kickoffAt: Date
): Promise<AFResponse<AFTeamStatistics> | null> {
  const cacheKey = `af-team-stats-${teamId}-s${season}`;
  const lastSyncedAt = await _getLastSyncAF(cacheKey, "T-24h");
  const decision = checkApiFootball(cacheKey, kickoffAt, lastSyncedAt);

  console.info(`[API-Football/Gated] ${decision.reason}`);
  if (!decision.allowed) return null;

  const result = await getTeamStats(teamId, season);
  await _logSyncAF(cacheKey, "T-24h", kickoffAt, result.results);
  return result;
}

/**
 * [GATED — T-24h] Lesões e suspensões por data.
 *
 * Janela: 24h → 12h antes do kickoff.
 * Objetivo: identificar desfalques que reduzem o Anchor Score antes
 * da geração das variações (fator `absences` no motor de scoring).
 *
 * @param kickoffAt - Kickoff dos jogos da data informada (UTC)
 */
export async function getInjuriesByDateGated(
  season: number,
  date: string,
  kickoffAt: Date
): Promise<AFResponse<AFInjuryItem> | null> {
  const cacheKey = `af-injuries-s${season}-d${date}`;
  const lastSyncedAt = await _getLastSyncAF(cacheKey, "T-24h");
  const decision = checkApiFootball(cacheKey, kickoffAt, lastSyncedAt);

  console.info(`[API-Football/Gated] ${decision.reason}`);
  if (!decision.allowed) return null;

  const result = await getInjuriesByDate(season, date);
  await _logSyncAF(cacheKey, "T-24h", kickoffAt, result.results);
  return result;
}

/**
 * [GATED — T-1h] Escalações oficiais de uma fixture.
 *
 * Janela: 90min → kickoff (janela de recalibração de emergência).
 * Objetivo: detectar ausência de titular-chave e disparar o alerta
 * de recalibração do Anchor Score (PRD §3 — "Congelamento e Alertas").
 *
 * Se a escalação confirmar desfalque crítico, o motor rebaixa o nível de
 * confiança da âncora: "Sinal interrompido. Rebaixando nível T-1h."
 *
 * @param fixtureId - ID da fixture no API-Football
 * @param kickoffAt - Kickoff exato do jogo (UTC)
 */
export async function getLineupsGated(
  fixtureId: number,
  kickoffAt: Date
): Promise<AFResponse<{ team: { id: number; name: string }; startXI: unknown[] }> | null> {
  const cacheKey = `af-lineups-fixture-${fixtureId}`;
  const lastSyncedAt = await _getLastSyncAF(cacheKey, "T-1h");
  const decision = checkApiFootball(cacheKey, kickoffAt, lastSyncedAt);

  console.info(`[API-Football/Gated] ${decision.reason}`);
  if (!decision.allowed) return null;

  // Escalações são fetched sem cache de ISR (Next.js): informação muda até
  // minutos antes do jogo. revalidate=0 garante dado sempre fresco nesta janela.
  const result = await afFetch<{ team: { id: number; name: string }; startXI: unknown[] }>(
    `/fixtures/lineups?fixture=${fixtureId}`,
    0 // sem cache ISR — janela T-1h é de altíssima urgência
  );
  await _logSyncAF(cacheKey, "T-1h", kickoffAt, result.results);
  return result;
}
