/**
 * BOB — Kelly Criterion Calculator
 *
 * Determina o tamanho ótimo da aposta (fração da banca) usando o critério
 * de Kelly. BOB usa Half-Kelly por padrão (mais conservador), mas expõe
 * ambas as fórmulas.
 *
 * Referência: Kelly (1956) — "A New Interpretation of Information Rate"
 *
 * p  = probabilidade estimada de vitória (0–1)
 * b  = lucro líquido por unidade apostada = (odd – 1)
 *
 * Kelly fraction = (b·p – q) / b    onde q = 1 – p
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type KellyResult = {
  /** Fração Kelly completa (0–1). Nunca negativa. */
  full: number;
  /** Half-Kelly (recomendado): fração dividida por 2 */
  half: number;
  /** Quarter-Kelly (máximo conservadorismo) */
  quarter: number;
  /** Percentual da banca recomendado (Half-Kelly × 100) */
  recommendedPct: number;
  /** Odds mínimas para esse bet ser EV+ com essa probabilidade */
  breakEvenOdd: number;
  /** Se false, o bet é EV negativo e NÃO deve ser feito */
  isPositiveEv: boolean;
};

// ─── Limites de segurança ─────────────────────────────────────────────────────

/** Máximo apostado em qualquer jogo individual (Half-Kelly capped) */
const MAX_KELLY_FRACTION = 0.10; // 10% da banca

/** Mínimo para considerar EV+ (evita ruído de float) */
const MIN_EV_THRESHOLD = 0.001;

// ─── Core ─────────────────────────────────────────────────────────────────────

/**
 * Calcula a fração Kelly para um bet.
 *
 * @param probability - Probabilidade estimada de vitória (0–1)
 * @param odd         - Odd decimal do mercado (ex: 1.85)
 * @returns KellyResult com frações e indicador de EV
 */
export function kelly(probability: number, odd: number): KellyResult {
  // Sanitização de entrada
  const p = Math.max(0, Math.min(1, probability));
  const b = odd - 1; // lucro líquido por unidade

  // Break-even odd: mínima odd para ser EV positivo com essa probabilidade
  const breakEvenOdd = p > 0 ? 1 / p : Infinity;

  // Fórmula Kelly
  const q = 1 - p;
  const rawKelly = b > 0 ? (b * p - q) / b : -Infinity;

  const isPositiveEv = rawKelly > MIN_EV_THRESHOLD;

  // Nunca apostar quando EV negativo
  const fullKelly = isPositiveEv ? Math.min(rawKelly, MAX_KELLY_FRACTION * 2) : 0;
  const halfKelly = Math.min(fullKelly / 2, MAX_KELLY_FRACTION);
  const quarterKelly = fullKelly / 4;

  return {
    full: Math.round(fullKelly * 10000) / 10000,
    half: Math.round(halfKelly * 10000) / 10000,
    quarter: Math.round(quarterKelly * 10000) / 10000,
    recommendedPct: Math.round(halfKelly * 100 * 100) / 100,
    breakEvenOdd: Math.round(breakEvenOdd * 100) / 100,
    isPositiveEv,
  };
}

/**
 * Versão simplificada — retorna diretamente o Half-Kelly como percentual
 * da banca (0–10). Uso direto em âncoras e variações.
 *
 * @param probability - Probabilidade estimada (0–1)
 * @param odd         - Odd decimal
 * @returns Percentual da banca a apostar (0 se EV negativo)
 */
export function halfKellyPct(probability: number, odd: number): number {
  return kelly(probability, odd).recommendedPct;
}

/**
 * Fração Kelly para múltiplas (acumuladores).
 * Usa a probabilidade conjunta × ajuste conservador.
 *
 * @param legs - Array de { probability, odd } para cada palpite
 * @returns KellyResult para o acumulador completo
 */
export function kellyMultiple(legs: Array<{ probability: number; odd: number }>): KellyResult {
  if (legs.length === 0) {
    return kelly(0, 1);
  }

  // Probabilidade conjunta (assume independência — BOB usa variações correlacionadas
  // então isso é conservador por design)
  const jointProbability = legs.reduce((acc, leg) => acc * leg.probability, 1);

  // Odd acumulada
  const accumulatedOdd = legs.reduce((acc, leg) => acc * leg.odd, 1);

  // Aplica fator de diversificação: mais legs = bet menor
  const result = kelly(jointProbability, accumulatedOdd);
  const diversificationFactor = Math.max(0.3, 1 - (legs.length - 1) * 0.15);

  return {
    ...result,
    half: Math.round(result.half * diversificationFactor * 10000) / 10000,
    quarter: Math.round(result.quarter * diversificationFactor * 10000) / 10000,
    recommendedPct:
      Math.round(result.half * diversificationFactor * 100 * 100) / 100,
  };
}

/**
 * Dado um array de âncoras, retorna a distribuição de % da banca por âncora.
 * Total ≤ 30% da banca (proteção máxima por rodada).
 *
 * @param anchors - Array de { probability, odd, label }
 * @returns Array com a mesma ordem, cada item indicando o % recomendado
 */
export function distributeKelly(
  anchors: Array<{ probability: number; odd: number; label?: string }>
): Array<{ probability: number; odd: number; label?: string; pct: number; isPositiveEv: boolean }> {
  const MAX_TOTAL_BANCA = 0.30; // 30% por rodada

  const raw = anchors.map((a) => {
    const r = kelly(a.probability, a.odd);
    return { ...a, raw: r.half, isPositiveEv: r.isPositiveEv };
  });

  // Soma das frações brutas
  const totalRaw = raw.reduce((acc, r) => acc + r.raw, 0);

  // Normaliza proporcional se ultrapassar o limite total
  const scaleFactor = totalRaw > MAX_TOTAL_BANCA ? MAX_TOTAL_BANCA / totalRaw : 1;

  return raw.map((r) => ({
    probability: r.probability,
    odd: r.odd,
    label: r.label,
    pct: Math.round(r.raw * scaleFactor * 100 * 100) / 100,
    isPositiveEv: r.isPositiveEv,
  }));
}
