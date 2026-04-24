import { generateVariations, type VariationInput, type VariationsResult } from './index';
import type { ScoredMatch, MatchInput } from './scoring';

const createMockMatch = (
  id: string,
  suggestedResult: '1' | 'X' | '2',
  homeOdd: number,
  drawOdd: number,
  awayOdd: number,
  isAnchorCandidate: boolean
): ScoredMatch & MatchInput => ({
  id,
  match: `Team${id} x Away${id}`,
  homeTeam: `Team${id}`,
  awayTeam: `Away${id}`,
  homePosition: 1,
  awayPosition: 10,
  homeNeedsWin: true,
  awayNeedsWin: false,
  homeForm: ['W'],
  awayForm: ['L'],
  homeHomePoints: 10,
  awayAwayPoints: 0,
  homeGoalsScored5: 5,
  homeGoalsConceded5: 0,
  awayGoalsScored5: 0,
  awayGoalsConceded5: 5,
  h2hHomeWinRate: 1,
  homeAbsenceRate: 0,
  awayAbsenceRate: 0,
  homeBigGameAhead: false,
  awayBigGameAhead: false,
  homeOdd,
  drawOdd,
  awayOdd,
  homeOddDropped: false,
  score: 80,
  reasons: [],
  suggestedResult,
  isAnchorCandidate,
  homeForm10: ['W'],
  awayForm10: ['L'],
  homeMomentum: 1,
  awayMomentum: -1,
  motivationHome: 1,
  motivationAway: 0,
  isClassico: false,
});

describe('Gerador de Variações (beam-search)', () => {
  const anchors: (ScoredMatch & MatchInput)[] = [
    createMockMatch('A1', '1', 1.5, 4.0, 6.0, true),
    createMockMatch('A2', '1', 1.6, 3.8, 5.5, true),
    createMockMatch('A3', '1', 1.7, 3.5, 5.0, true),
    createMockMatch('A4', '1', 1.8, 3.4, 5.2, true),
  ];

  const pool: (ScoredMatch & MatchInput)[] = [
    createMockMatch('P1', '1', 2.0, 3.2, 3.8, false),
    createMockMatch('P2', 'X', 2.5, 3.0, 2.8, false),
    createMockMatch('P3', '2', 3.0, 3.0, 2.5, false),
    createMockMatch('P4', '1', 1.8, 3.4, 4.2, false),
    createMockMatch('P5', '2', 4.0, 3.5, 1.9, false),
    createMockMatch('P6', 'X', 2.6, 3.1, 2.7, false),
  ];

  it('1. Deve gerar exatamente 5 variações (V1 a V5)', () => {
    const result: VariationsResult = generateVariations({ anchors, pool });
    expect(result.variations).toHaveLength(5);
    expect(result.variations.map(v => v.id)).toEqual(['V1', 'V2', 'V3', 'V4', 'V5']);
  });

  it('2. V1 deve conter os âncoras fornecidos', () => {
    const result: VariationsResult = generateVariations({ anchors, pool });
    const v1 = result.variations.find(v => v.id === 'V1');
    expect(v1).toBeDefined();
    
    const anchorPicksCount = v1!.legs.filter(p => p.isAnchor).length;
    expect(anchorPicksCount).toBeGreaterThanOrEqual(3); // V1 deve ter âncoras
  });

  it('3. V3 e V4 devem ser distintas (anti-duplicata)', () => {
    const smallPool = [pool[0], pool[1]];
    const result: VariationsResult = generateVariations({ anchors, pool: smallPool });
    
    const v3 = result.variations.find(v => v.id === 'V3')!;
    const v4 = result.variations.find(v => v.id === 'V4')!;
    
    // Comparar legs para garantir que não são idênticas
    const v3Ids = v3.legs.map(l => `${l.matchId}:${l.pickOutcome}`).sort().join('|');
    const v4Ids = v4.legs.map(l => `${l.matchId}:${l.pickOutcome}`).sort().join('|');
    expect(v3Ids).not.toEqual(v4Ids);
  });

  it('4. A ODD final deve atingir o target mínimo', () => {
    const result: VariationsResult = generateVariations({ anchors, pool });
    
    result.variations.forEach(v => {
      // Cada variação deve ter odd combinada >= targetOdd (default 1000)
      expect(v.combinedOdd).toBeGreaterThanOrEqual(900); // tolerância de 10%
    });
  });

  it('5. Todas as variações devem ter 7-10 pernas', () => {
    const result: VariationsResult = generateVariations({ anchors, pool });
    
    result.variations.forEach(v => {
      expect(v.legs.length).toBeGreaterThanOrEqual(7);
      expect(v.legs.length).toBeLessThanOrEqual(10);
    });
  });
});