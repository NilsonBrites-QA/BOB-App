import { generateVariations, type VariationInput } from './variations';
import { type ScoredMatch } from './scoring';

const createMockMatch = (
  id: string,
  suggestedResult: '1' | 'X' | '2',
  homeOdd: number,
  drawOdd: number,
  awayOdd: number,
  isAnchorCandidate: boolean
): ScoredMatch => ({
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
});

describe('Gerador de Variações (variations.ts)', () => {
  const anchors: ScoredMatch[] = [
    createMockMatch('A1', '1', 1.5, 4.0, 6.0, true),
    createMockMatch('A2', '1', 1.6, 3.8, 5.5, true),
    createMockMatch('A3', '1', 1.7, 3.5, 5.0, true),
  ];

  const pool: ScoredMatch[] = [
    createMockMatch('P1', '1', 2.0, 3.2, 3.8, false),
    createMockMatch('P2', 'X', 2.5, 3.0, 2.8, false),
    createMockMatch('P3', '2', 3.0, 3.0, 2.5, false),
    createMockMatch('P4', '1', 1.8, 3.4, 4.2, false),
    createMockMatch('P5', '2', 4.0, 3.5, 1.9, false),
    createMockMatch('P6', 'X', 2.6, 3.1, 2.7, false),
  ];

  it('1. Deve gerar exatamente 5 variações (V1 a V5)', () => {
    const vars = generateVariations({ anchors, pool });
    expect(vars).toHaveLength(5);
    expect(vars.map(v => v.title)).toEqual(['Segurança', 'Equilíbrio', 'Lógica Pura', 'Curta de pressão', 'Extrema']);
  });

  it('2. V1 Segurança deve conter os âncoras fornecidos', () => {
    const vars = generateVariations({ anchors, pool });
    const v1 = vars.find(v => v.title === 'Segurança');
    expect(v1).toBeDefined();
    
    const anchorPicksCount = v1!.picks.filter(p => p.isAnchor).length;
    expect(anchorPicksCount).toBe(3); // Fornecemos 3 âncoras na input
  });

  it('3. V3 e V4 devem ser distintas, mesmo se o pool for pequeno, pois os limites (mínimo de odds) elevam o multiplicador', () => {
    const smallPool = [pool[0], pool[1]]; // Um pool bem pequeno para testar o override
    const vars = generateVariations({ anchors, pool: smallPool });
    
    const v3 = vars.find(v => v.title === 'Lógica Pura')!;
    const v4 = vars.find(v => v.title === 'Curta de pressão')!;
    
    // Comparando se são idênticas. A premissa do BOB diz que tem que evitar picks 100% iguais.
    const v3Ids = v3.picks.map(p => `${p.fixtureId}-${p.result}`).join(',');
    const v4Ids = v4.picks.map(p => `${p.fixtureId}-${p.result}`).join(',');
    
    // Mesmo sendo pequeno, como V4 exige odds maiores (1000) e V3 (800), V4 precisará substituir ou não passará os limites em relação a V3.
    expect(v3Ids).not.toEqual(v4Ids);
  });

  it('4. A ODD final (multiplicador) não deve ser menor que o piso exigido pela variação', () => {
    const vars = generateVariations({ anchors, pool });
    
    vars.forEach(v => {
      let floor = 500;
      if (v.title === 'Curta de pressão' || v.title === 'Extrema') floor = 1000;
      if (v.title === 'Equilíbrio' || v.title === 'Lógica Pura') floor = 800;
      
      expect(v.projectedOdd).toBeGreaterThanOrEqual(floor);
    });
  });
});