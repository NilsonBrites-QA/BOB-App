/**
 * Tipos das respostas da API-Football (v3.football.api-sports.io)
 * Documentação: https://www.api-football.com/documentation-v3
 */

// ─── Estrutura base de resposta ───────────────────────────────────────────────

export type AFResponse<T> = {
  get: string;
  parameters: Record<string, string>;
  errors: Record<string, string> | unknown[];
  results: number;
  paging: { current: number; total: number };
  response: T[];
};

// ─── Standings ────────────────────────────────────────────────────────────────

export type AFStandingEntry = {
  rank: number;
  team: { id: number; name: string; logo: string };
  points: number;
  goalsDiff: number;
  group: string;
  form: string; // ex: "WWDWL"
  status: string;
  description: string | null;
  all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
  home: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
  away: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
  update: string;
};

export type AFStandingsGroup = { league: { standings: AFStandingEntry[][] } };

// ─── Fixtures ────────────────────────────────────────────────────────────────

export type AFFixtureItem = {
  fixture: {
    id: number;
    referee: string | null;
    timezone: string;
    date: string; // ISO 8601
    timestamp: number;
    status: { long: string; short: string; elapsed: number | null };
  };
  league: { id: number; name: string; round: string };
  teams: {
    home: { id: number; name: string; logo: string; winner: boolean | null };
    away: { id: number; name: string; logo: string; winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
  };
};

// ─── H2H ─────────────────────────────────────────────────────────────────────

// Reutiliza AFFixtureItem (o endpoint /fixtures/headtohead retorna o mesmo schema)
export type AFH2HItem = AFFixtureItem;

// ─── Team Statistics ─────────────────────────────────────────────────────────

export type AFTeamStatistics = {
  league: { id: number; name: string; season: number };
  team: { id: number; name: string; logo: string };
  form: string; // ex: "WWDLW..."
  fixtures: {
    played: { home: number; away: number; total: number };
    wins:   { home: number; away: number; total: number };
    draws:  { home: number; away: number; total: number };
    loses:  { home: number; away: number; total: number };
  };
  goals: {
    for: {
      total:   { home: number; away: number; total: number };
      average: { home: string; away: string; total: string };
    };
    against: {
      total:   { home: number; away: number; total: number };
      average: { home: string; away: string; total: string };
    };
  };
  biggest: {
    streak: { wins: number; draws: number; loses: number };
    wins: { home: string | null; away: string | null };
    loses: { home: string | null; away: string | null };
    goals: { for: { home: number; away: number }; against: { home: number; away: number } };
  };
  clean_sheet: { home: number; away: number; total: number };
  failed_to_score: { home: number; away: number; total: number };
};

// ─── Injuries ────────────────────────────────────────────────────────────────

export type AFInjuryItem = {
  player: { id: number; name: string; photo: string; type: string; reason: string };
  team: { id: number; name: string; logo: string };
  fixture: { id: number; timezone: string; date: string; timestamp: number };
};

// ─── Odds ────────────────────────────────────────────────────────────────────

export type AFOddsBookmakerBet = {
  id: number;
  name: string; // ex: "Match Winner"
  values: Array<{ value: string; odd: string }>; // value: "Home" | "Draw" | "Away"
};

export type AFOddsItem = {
  league: { id: number; name: string; season: number };
  fixture: { id: number; timezone: string; date: string; timestamp: number };
  update: string;
  bookmakers: Array<{ id: number; name: string; bets: AFOddsBookmakerBet[] }>;
};
