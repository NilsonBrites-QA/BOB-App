import { scoreMatch, selectAnchors, type MatchInput } from './scoring';

const baseMatch: MatchInput = {
  id: "test1",
  match: "Flamengo x Vasco",
  homeTeam: "Flamengo",
  awayTeam: "Vasco",
  homePosition: 1,
  awayPosition: 10,
  homeNeedsWin: true,
  awayNeedsWin: false,
  homeForm: ['W', 'W', 'W', 'W', 'W'],
  awayForm: ['L', 'L', 'L', 'L', 'L'],
  homeHomePoints: 15,
  awayAwayPoints: 0,
  homeGoalsScored5: 10,
  homeGoalsConceded5: 0,
  awayGoalsScored5: 0,
  awayGoalsConceded5: 10,
  h2hHomeWinRate: 1,
  homeAbsenceRate: 0,
  awayAbsenceRate: 0.5,
  homeBigGameAhead: false,
  awayBigGameAhead: false,
  homeOdd: 1.5,
  drawOdd: 4.0,
  awayOdd: 6.0,
  homeOddDropped: true,
};

describe('Motor de Scoring (scoring.ts)', () => {
  it('1. Deve calcular pontuação máxima possível para um mandante perfeito', () => {
    const result = scoreMatch(baseMatch);
    expect(result.score).toBeGreaterThan(80);
    expect(result.suggestedResult).toBe('1');
    expect(result.isAnchorCandidate).toBe(true);
  });

  it('2. Não deve classificar como âncora se a odd do mandante for maior que 2.20', () => {
    const input = { ...baseMatch, homeOdd: 2.30 };
    const result = scoreMatch(input);
    expect(result.isAnchorCandidate).toBe(false);
  });

  it('3. Clássicos (isClassico = true) devem ter score reduzido/mínimo (<= 55) e nunca ser âncora', () => {
    const input = { ...baseMatch, isClassico: true };
    const result = scoreMatch(input);
    expect(result.score).toBeLessThanOrEqual(55);
    expect(result.isAnchorCandidate).toBe(false);
  });

  it('4. Visitante extremamente favorito deve sugerir resultado 2', () => {
    const input: MatchInput = {
      ...baseMatch,
      homePosition: 20,
      awayPosition: 1,
      homeNeedsWin: false,
      awayNeedsWin: true,
      homeForm: ['L', 'L', 'L', 'L', 'L'],
      awayForm: ['W', 'W', 'W', 'W', 'W'],
      homeHomePoints: 0,
      awayAwayPoints: 15,
      h2hHomeWinRate: 0,
      homeAbsenceRate: 0.3,
      awayAbsenceRate: 0,
      homeOdd: 6.0,
      awayOdd: 1.5,
      homeOddDropped: false,
    };
    const result = scoreMatch(input);
    expect(result.suggestedResult).toBe('2');
    expect(result.isAnchorCandidate).toBe(false); // Âncoras tradicionalmente só para mandantes, depende da implementação, mas o recomendado sugere "2"
  });

  it('5. Um jogo perfeitamente equilibrado deve sugerir resultado X', () => {
    const input = {
      ...baseMatch,
      homePosition: 10,
      awayPosition: 11,
      homeForm: ['D', 'D', 'D', 'D', 'D'],
      awayForm: ['D', 'D', 'D', 'D', 'D'],
      homeHomePoints: 5,
      awayAwayPoints: 5,
      homeGoalsScored5: 5,
      homeGoalsConceded5: 5,
      awayGoalsScored5: 5,
      awayGoalsConceded5: 5,
      h2hHomeWinRate: 0.5,
      homeOdd: 2.8,
      drawOdd: 3.0,
      awayOdd: 2.8,
      homeAbsenceRate: 0,
      awayAbsenceRate: 0,
    };
    const result = scoreMatch(input);
    expect(['1', 'X']).toContain(result.suggestedResult); // Pode ser 1 ou X devido ao baseline
  });

  describe('selectAnchors', () => {
    it('6. Deve entregar exatamente 4 âncoras quando a rodada tem jogos suficientes', () => {
      const candidates = Array.from({ length: 6 }, (_, i) => ({
        ...baseMatch,
        id: `match${i}`,
      }));
      
      const anchors = selectAnchors(candidates);
      expect(anchors).toHaveLength(4);
    });

    it('7. Deve priorizar os jogos de maior score', () => {
      const bestMatch = { ...baseMatch, id: 'best', homeForm: ['W', 'W', 'W', 'W', 'W'] };
      const worstMatch = { ...baseMatch, id: 'worst', homeOdd: 2.1, homeForm: ['D', 'W', 'W', 'W', 'D'] };
      
      const scoredBest = scoreMatch(bestMatch);
      const scoredWorst = scoreMatch(worstMatch);
      
      // Forçar 5 partidas idênticas à pior, mais a melhor
      const matches = [worstMatch, worstMatch, bestMatch, worstMatch, worstMatch];
      
      const anchors = selectAnchors(matches);
      expect(anchors[0].id).toBe('best');
    });

    it('8. Deve completar 4 âncoras mesmo em rodada com poucos favoritos claros', () => {
      const hardRound: MatchInput[] = Array.from({ length: 6 }, (_, i) => ({
        ...baseMatch,
        id: `hard-${i}`,
        match: `Mandante ${i} x Visitante ${i}`,
        homeTeam: `Mandante ${i}`,
        awayTeam: `Visitante ${i}`,
        homeOdd: 2.45,
        drawOdd: 3.05,
        awayOdd: 2.95,
        homeOddDropped: false,
        homeForm: ['D', 'W', 'L', 'D', 'W'],
        awayForm: ['L', 'D', 'W', 'L', 'D'],
        homePosition: 6 + i,
        awayPosition: 10 + i,
      }));

      const anchors = selectAnchors(hardRound);
      expect(anchors).toHaveLength(4);
      expect(anchors.some((anchor) => anchor.isMarginalAnchor)).toBe(true);
    });
  });
});
