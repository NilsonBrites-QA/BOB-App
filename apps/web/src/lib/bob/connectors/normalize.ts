/**
 * BOB — Normalizador: respostas da API-Football → MatchInput[]
 *
 * Recebe dados brutos de múltiplas chamadas e produz os objetos MatchInput
 * prontos para o motor de scoring. Toda lógica de computação dos 8 fatores
 * fica aqui, separada dos clientes HTTP.
 */

import type { MatchInput } from "@/lib/bob/engine/scoring";
import type {
  AFStandingEntry,
  AFFixtureItem,
  AFTeamStatistics,
  AFInjuryItem,
  AFOddsItem,
} from "./api-football-types";

// ─── Tipos internos ───────────────────────────────────────────────────────────

export type NormalizeInput = {
  /** Fixtures da rodada atual (os ~10 jogos) */
  roundFixtures: AFFixtureItem[];
  /** Classificação geral (type[0] = overall) */
  standings: AFStandingEntry[];
  /** Últimos 10 jogos por teamId (BSA apenas) — fase 10: janela estendida */
  teamLastFixtures: Record<number, AFFixtureItem[]>;
  /** Últimos 10 H2H por chave "homeId-awayId" */
  h2hByKey: Record<string, AFFixtureItem[]>;
  /** Estatísticas de temporada por teamId */
  teamStats: Record<number, AFTeamStatistics>;
  /** Lesionados/suspensos para as datas da rodada */
  injuries: AFInjuryItem[];
  /** Odds por fixtureId */
  oddsMap: Record<number, AFOddsItem>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extrai form (W/D/L) dos últimos N jogos de um time.
 * Filtra apenas partidas encerradas.
 */
function extractForm(fixtures: AFFixtureItem[], teamId: number, n = 5): string[] {
  return fixtures
    .filter(
      (f) =>
        f.fixture.status.short === "FT" &&
        f.goals.home !== null &&
        f.goals.away !== null
    )
    .slice(0, n)
    .map((f) => {
      const isHome = f.teams.home.id === teamId;
      const teamGoals = isHome ? (f.goals.home ?? 0) : (f.goals.away ?? 0);
      const oppGoals = isHome ? (f.goals.away ?? 0) : (f.goals.home ?? 0);
      if (teamGoals > oppGoals) return "W";
      if (teamGoals < oppGoals) return "L";
      return "D";
    });
}

/** Pontos conquistados nos últimos N jogos como mandante (casa) */
function extractHomePoints(homeClubFixtures: AFFixtureItem[], teamId: number): number {
  const homeGames = homeClubFixtures
    .filter(
      (f) =>
        f.teams.home.id === teamId &&
        f.fixture.status.short === "FT" &&
        f.goals.home !== null &&
        f.goals.away !== null
    )
    .slice(0, 5);

  return homeGames.reduce((pts, f) => {
    const h = f.goals.home ?? 0;
    const a = f.goals.away ?? 0;
    return pts + (h > a ? 3 : h === a ? 1 : 0);
  }, 0);
}

/** Pontos conquistados nos últimos N jogos como visitante */
function extractAwayPoints(awayClubFixtures: AFFixtureItem[], teamId: number): number {
  const awayGames = awayClubFixtures
    .filter(
      (f) =>
        f.teams.away.id === teamId &&
        f.fixture.status.short === "FT" &&
        f.goals.home !== null &&
        f.goals.away !== null
    )
    .slice(0, 5);

  return awayGames.reduce((pts, f) => {
    const h = f.goals.home ?? 0;
    const a = f.goals.away ?? 0;
    return pts + (a > h ? 3 : a === h ? 1 : 0);
  }, 0);
}

// ─── Fase 10: funções de enriquecimento ────────────────────────────────────

/** Soma de pontos de uma sequência de resultados (W=3, D=1, L=0) */
function formPoints(form: string[]): number {
  return form.reduce((acc, r) => acc + (r === "W" ? 3 : r === "D" ? 1 : 0), 0);
}

/**
 * Calcula momentum comparando últimos 5 jogos vs jogos 6-10.
 * Retorna -1 (em queda acentuada) → 0 (estável) → +1 (acelerando).
 */
function extractMomentum(form5: string[], form10: string[]): number {
  const older = form10.slice(5);
  if (older.length === 0) return 0;
  const recentPpg = formPoints(form5) / Math.max(form5.length, 1);
  const olderPpg  = formPoints(older) / older.length;
  // normaliza a diferença (-3 a +3 pontos/jogo) para [-1, +1]
  return Math.max(-1, Math.min(1, (recentPpg - olderPpg) / 3));
}

/**
 * Motivação contextual derivada de posição na tabela e rodada.
 * 0 = situação normal | 1 = relevante (G4/Liberta) | 2 = crítico (rebaixamento/título)
 */
function extractMotivation(position: number, round: number): number {
  const inRelegation   = position >= 17;                       // zona de rebaixamento
  const relegBattle    = position >= 15 && round >= 25;        // beirando o perigo
  const titleDispute   = position <= 3  && round >= 30;        // disputa pelo título
  const liberBattle    = position >= 5  && position <= 8 && round >= 25; // G5-G8 lutando
  const g4Hot          = position >= 4  && position <= 6 && round >= 30; // G4 decisivo

  if (inRelegation || titleDispute)             return 2;
  if (relegBattle || liberBattle || g4Hot)      return 1;
  return 0;
}

/** Pares de clássicos regionais do Brasileirão (bidirecional) */
const CLASSICOS = new Set([
  // Rio
  "Flamengo-Fluminense",  "Fluminense-Flamengo",
  "Flamengo-Vasco da Gama", "Vasco da Gama-Flamengo",
  "Fluminense-Vasco da Gama", "Vasco da Gama-Fluminense",
  "Botafogo-Flamengo", "Flamengo-Botafogo",
  "Botafogo-Fluminense", "Fluminense-Botafogo",
  "Botafogo-Vasco da Gama", "Vasco da Gama-Botafogo",
  // São Paulo
  "Palmeiras-Corinthians", "Corinthians-Palmeiras",
  "Palmeiras-São Paulo",   "São Paulo-Palmeiras",
  "Corinthians-São Paulo", "São Paulo-Corinthians",
  "Santos-São Paulo",      "São Paulo-Santos",
  "Santos-Palmeiras",      "Palmeiras-Santos",
  // Minas Gerais
  "Atlético-MG-Cruzeiro", "Cruzeiro-Atlético-MG",
  // Rio Grande do Sul
  "Grêmio-Internacional", "Internacional-Grêmio",
  // Paraná
  "Athletico Paranaense-Coritiba", "Coritiba-Athletico Paranaense",
]);

/** Retorna true se o confronto entre homeTeam e awayTeam é um clássico regional */
function isClassicoRegional(homeTeam: string, awayTeam: string): boolean {
  return CLASSICOS.has(`${homeTeam}-${awayTeam}`);
}

/** Gols marcados/sofridos nos últimos N jogos */
function extractGoals(
  fixtures: AFFixtureItem[],
  teamId: number,
  type: "scored" | "conceded"
): number {
  return fixtures
    .filter(
      (f) =>
        f.fixture.status.short === "FT" &&
        f.goals.home !== null
    )
    .slice(0, 5)
    .reduce((total, f) => {
      const isHome = f.teams.home.id === teamId;
      const teamGoals = isHome ? (f.goals.home ?? 0) : (f.goals.away ?? 0);
      const oppGoals = isHome ? (f.goals.away ?? 0) : (f.goals.home ?? 0);
      return total + (type === "scored" ? teamGoals : oppGoals);
    }, 0);
}

/**
 * Taxa de vitória do mandante nos últimos H2H.
 * Considera o time que jogou em casa em cada partida histórica.
 */
function extractH2HHomeWinRate(
  h2hFixtures: AFFixtureItem[],
  homeTeamId: number
): number {
  const finished = h2hFixtures.filter(
    (f) =>
      f.fixture.status.short === "FT" &&
      f.goals.home !== null
  );

  if (finished.length === 0) return 0.4; // default neutro

  const homeWins = finished.filter((f) => {
    const isCurrentHomeTeamPlayingHome = f.teams.home.id === homeTeamId;
    if (isCurrentHomeTeamPlayingHome) {
      return (f.goals.home ?? 0) > (f.goals.away ?? 0);
    } else {
      return (f.goals.away ?? 0) > (f.goals.home ?? 0);
    }
  }).length;

  return homeWins / finished.length;
}

/**
 * Taxa de ausência de um time (lesionados + suspensos "Missing Fixture").
 * Assume elenco padrão de 25 jogadores.
 */
function extractAbsenceRate(injuries: AFInjuryItem[], teamId: number): number {
  const SQUAD_SIZE = 25;
  const missing = injuries.filter(
    (inj) =>
      inj.team.id === teamId &&
      inj.player.type === "Missing Fixture"
  ).length;
  return Math.min(1, missing / SQUAD_SIZE);
}

/**
 * Extrai odds de vitória do mandante, empate e vitória visitante.
 * Preferencia: bet com name="Match Winner". Fallback: undefined → defaults do caller.
 */
function extractOdds(oddsItem: AFOddsItem | undefined): {
  homeOdd: number;
  drawOdd: number;
  awayOdd: number;
} {
  if (!oddsItem || oddsItem.bookmakers.length === 0) {
    return { homeOdd: 0, drawOdd: 0, awayOdd: 0 };
  }

  // Percorre bookmakers até encontrar "Match Winner"
  for (const bm of oddsItem.bookmakers) {
    const matchWinner = bm.bets.find((b) => b.name === "Match Winner");
    if (!matchWinner) continue;

    const homeOdd = parseFloat(
      matchWinner.values.find((v) => v.value === "Home")?.odd ?? "0"
    );
    const drawOdd = parseFloat(
      matchWinner.values.find((v) => v.value === "Draw")?.odd ?? "0"
    );
    const awayOdd = parseFloat(
      matchWinner.values.find((v) => v.value === "Away")?.odd ?? "0"
    );

    if (homeOdd > 0 && drawOdd > 0 && awayOdd > 0) {
      return { homeOdd, drawOdd, awayOdd };
    }
  }

  return { homeOdd: 0, drawOdd: 0, awayOdd: 0 };
}

/**
 * Determina se um time precisa vencer pelo contexto da tabela.
 * Zona de rebaixamento: posições 17–20 no Brasileirão.
 * Briga pelo título em fim de temporada: posição ≤ 3 a partir da rodada 30.
 */
function teamNeedsWin(
  position: number,
  round: number
): boolean {
  const inRelegationZone = position >= 17;
  const titleRaceEndgame = position <= 3 && round >= 30;
  return inRelegationZone || titleRaceEndgame;
}

// ─── Normalizador principal ───────────────────────────────────────────────────

/**
 * Converte dados brutos da API-Football em MatchInput[] para o motor de scoring.
 *
 * @param includeCompleted - Quando true, inclui fixtures FT/AET/PEN (backfill mode).
 *                           Default false (modo live — apenas jogos não finalizados).
 */
export function normalizeMatchInputs(
  data: NormalizeInput,
  round: number,
  includeCompleted = false,
): MatchInput[] {
  // Statuses aceitos em modo live
  const liveStatuses = new Set(["NS", "TBD", "1H", "2H", "HT"]);
  // Statuses adicionais aceitos em modo backfill
  const completedStatuses = new Set(["FT", "AET", "PEN", "AWD"]);

  // Indexar standings por teamId para acesso O(1)
  const standingByTeamId = new Map<number, AFStandingEntry>(
    data.standings.map((s) => [s.team.id, s])
  );

  return data.roundFixtures
    .filter(
      (f) =>
        liveStatuses.has(f.fixture.status.short) ||
        (includeCompleted && completedStatuses.has(f.fixture.status.short))
    )
    .map((fixture): MatchInput => {
      const homeId = fixture.teams.home.id;
      const awayId = fixture.teams.away.id;
      const h2hKey = `${homeId}-${awayId}`;

      const homeStanding = standingByTeamId.get(homeId);
      const awayStanding = standingByTeamId.get(awayId);

      const homeLastFix = data.teamLastFixtures[homeId] ?? [];
      const awayLastFix = data.teamLastFixtures[awayId] ?? [];
      const h2hFixtures = data.h2hByKey[h2hKey] ?? [];
      const odds = data.oddsMap[fixture.fixture.id];

      // Fator 1 — Posição na tabela
      const homePosition = homeStanding?.rank ?? 10;
      const awayPosition = awayStanding?.rank ?? 10;

      // Fator 2 — Forma recente (últimos 5 jogos)
      const homeForm = extractForm(homeLastFix, homeId, 5);
      const awayForm = extractForm(awayLastFix, awayId, 5);

      // Fator 9 — Forma estendida (últimos 10) + momentum
      const homeForm10   = extractForm(homeLastFix, homeId, 10);
      const awayForm10   = extractForm(awayLastFix, awayId, 10);
      const homeMomentum = extractMomentum(homeForm, homeForm10);
      const awayMomentum = extractMomentum(awayForm, awayForm10);

      // Fator 3 — Casa × fora (pontos nos últimos 5 jogos em casa/fora)
      const homeHomePoints = extractHomePoints(homeLastFix, homeId);
      const awayAwayPoints = extractAwayPoints(awayLastFix, awayId);

      // Fator 4 — Gols recentes (últimos 5 jogos)
      const homeGoalsScored5 = extractGoals(homeLastFix, homeId, "scored");
      const homeGoalsConceded5 = extractGoals(homeLastFix, homeId, "conceded");
      const awayGoalsScored5 = extractGoals(awayLastFix, awayId, "scored");
      const awayGoalsConceded5 = extractGoals(awayLastFix, awayId, "conceded");

      // Fator 5 — H2H
      const h2hHomeWinRate = extractH2HHomeWinRate(h2hFixtures, homeId);

      // Fator 6 — Desfalques
      const homeAbsenceRate = extractAbsenceRate(data.injuries, homeId);
      const awayAbsenceRate = extractAbsenceRate(data.injuries, awayId);

      // Fator 7 — Calendário competitivo paralelo
      // v1: requer endpoint adicional por time → defaulta false para poupar quota
      const homeBigGameAhead = false;
      const awayBigGameAhead = false;

      // Fator 8 — Mercado (odds)
      const { homeOdd, drawOdd, awayOdd } = extractOdds(odds);

      // Fator 10 — Motivação contextual
      const motivationHome = extractMotivation(homePosition, round);
      const motivationAway = extractMotivation(awayPosition, round);

      // RN05 — Clássico regional
      const isClassico = isClassicoRegional(fixture.teams.home.name, fixture.teams.away.name);

      return {
        id: fixture.fixture.id.toString(),
        match: `${fixture.teams.home.name} x ${fixture.teams.away.name}`,
        homeTeam: fixture.teams.home.name,
        awayTeam: fixture.teams.away.name,

        homePosition,
        awayPosition,
        homeNeedsWin: teamNeedsWin(homePosition, round),
        awayNeedsWin: teamNeedsWin(awayPosition, round),

        homeForm,
        awayForm,

        homeHomePoints,
        awayAwayPoints,

        homeGoalsScored5,
        homeGoalsConceded5,
        awayGoalsScored5,
        awayGoalsConceded5,

        h2hHomeWinRate,

        homeAbsenceRate,
        awayAbsenceRate,

        homeBigGameAhead,
        awayBigGameAhead,

        homeOdd,
        drawOdd,
        awayOdd,
        homeOddDropped: false, // v1: requer histórico de odds → defaulta false

        // Fase 10 — campos estendidos
        homeForm10,
        awayForm10,
        homeMomentum,
        awayMomentum,
        motivationHome,
        motivationAway,
        isClassico,
      };
    });
}
