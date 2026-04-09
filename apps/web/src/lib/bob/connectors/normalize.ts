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
  /** Últimos 5 jogos por teamId (BSA apenas) */
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
function extractForm(fixtures: AFFixtureItem[], teamId: number): string[] {
  return fixtures
    .filter(
      (f) =>
        f.fixture.status.short === "FT" &&
        f.goals.home !== null &&
        f.goals.away !== null
    )
    .slice(0, 5)
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

/** Gols marcados/sofridos nos últimos 5 jogos */
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
 */
export function normalizeMatchInputs(
  data: NormalizeInput,
  round: number
): MatchInput[] {
  // Indexar standings por teamId para acesso O(1)
  const standingByTeamId = new Map<number, AFStandingEntry>(
    data.standings.map((s) => [s.team.id, s])
  );

  return data.roundFixtures
    .filter(
      // Incluir apenas jogos agendados ou em andamento (não finalizados)
      (f) =>
        f.fixture.status.short === "NS" || // Not Started
        f.fixture.status.short === "TBD" ||
        f.fixture.status.short === "1H" ||
        f.fixture.status.short === "2H" ||
        f.fixture.status.short === "HT"
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

      // Fator 2 — Forma recente (últimos 5 BSA)
      const homeForm = extractForm(homeLastFix, homeId);
      const awayForm = extractForm(awayLastFix, awayId);

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
      };
    });
}
