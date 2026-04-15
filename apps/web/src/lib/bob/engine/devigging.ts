/**
 * BOB — Motor de De-vigging (Remoção de Margem da Casa de Aposta)
 *
 * PRD §6 — "Garantia Matemática": o sistema DEVE remover o overround das
 * odds antes de definir probabilidades. Nenhuma função downstream do
 * motor oficial deve consumir probabilidades com margem embutida.
 *
 * ─── O Problema ──────────────────────────────────────────────────────────────
 *
 * Casas de aposta publicam odds que somam a mais de 100% de probabilidade
 * implícita. O excedente é a margem (vigorish/vig/overround) — o lucro
 * garantido da casa independente do resultado.
 *
 * Exemplo real: Casa (1.65) · Empate (3.50) · Fora (5.00)
 *   Implícita bruta: 60.6% + 28.6% + 20.0% = 109.2%  ← 9.2% de margem
 *   Implícita justa:                                   ← este módulo produz
 *
 * ─── Dois Métodos ────────────────────────────────────────────────────────────
 *
 * SIMPLES (método padrão)
 *   Formula: p_i = q_i / Σq_j   onde q_i = 1/odd_i
 *   Premissa: a margem é distribuída *uniformemente* entre os 3 outcomes.
 *   Adequado para: mercados equilibrados, Pinnacle-style.
 *
 * POWER (método alternativo, mais preciso)
 *   Encontra expoente k tal que: Σ(1/odd_i)^k = 1
 *   Premissa: a margem é distribuída *proporcionalmente ao risco*, ou seja,
 *             favoritos pagam proporcionalmente menos margem que azarões.
 *   Adequado para: mercados com spread amplo de odds (ex: odd de 1.20 vs 12.0).
 *
 * Referência académica: Shin (1993), Forrest & Simmons (2002).
 *
 * ─── Saída Central ───────────────────────────────────────────────────────────
 *
 *   DevigResult:
 *     pHome   · pDraw   · pAway    → probabilidades limpas (somam 1.000)
 *     impliedOverround              → margem bruta da casa (ex: 0.092 = 9.2%)
 *     method                        → qual método foi aplicado
 *     fairOdds                      → odds justas correspondentes (1/p_i)
 *
 * ─── Uso Downstream ──────────────────────────────────────────────────────────
 *
 *   anchor-score.ts  → usa pHome para calcular pW e divergência de mercado.
 *   variations.ts    → usa probabilidades limpas para calcular P(bilhete).
 *   scoring.ts       → FUTURO: substituir oddToImpliedProb() por devig().
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Odds decimais brutas de um mercado 1X2. */
export type RawOdds = {
  /** Odd decimal da vitória do mandante (ex: 1.65). Deve ser > 1. */
  homeOdd: number;
  /** Odd decimal do empate (ex: 3.50). Deve ser > 1. */
  drawOdd: number;
  /** Odd decimal da vitória do visitante (ex: 5.00). Deve ser > 1. */
  awayOdd: number;
};

/** Método de remoção de margem. */
export type DevigMethod = "simple" | "power";

/** Resultado do de-vigging: probabilidades limpas + metadados de diagnóstico. */
export type DevigResult = {
  /** Probabilidade implícita limpa da vitória do mandante (0-1). */
  pHome: number;
  /** Probabilidade implícita limpa do empate (0-1). */
  pDraw: number;
  /** Probabilidade implícita limpa da vitória do visitante (0-1). */
  pAway: number;
  /**
   * Margem bruta identificada nas odds originais.
   * Exemplos: 0.055 = 5.5%, 0.092 = 9.2%.
   * Pinnacle tipicamente pratica ~2-3%; mercados populares ~8-12%.
   */
  impliedOverround: number;
  /** Método aplicado para produzir este resultado. */
  method: DevigMethod;
  /**
   * Odds "justas" correspondentes (1/p_i), sem margem.
   * Útil para comparar com odds de casas alternativas e detectar value.
   */
  fairOdds: {
    home: number;
    draw: number;
    away: number;
  };
};

/** Resultado de chamada inválida — encapsula o erro sem lançar exceção. */
export type DevigError = {
  ok: false;
  error: string;
};

export type DevigOutcome = ({ ok: true } & DevigResult) | DevigError;

// ─── Validação ────────────────────────────────────────────────────────────────

const MIN_VALID_ODD = 1.001; // odds de 1.0 ou abaixo são matematicamente impossíveis
const MAX_VALID_ODD = 1001;  // odds acima de 1001 indicam erro de fonte de dados

/**
 * Valida um conjunto de odds brutas.
 * Retorna null se as odds são válidas; string de erro caso contrário.
 */
function validateOdds(odds: RawOdds): string | null {
  const { homeOdd, drawOdd, awayOdd } = odds;

  for (const [label, odd] of [
    ["homeOdd", homeOdd],
    ["drawOdd", drawOdd],
    ["awayOdd", awayOdd],
  ] as const) {
    if (odd == null || !Number.isFinite(odd)) {
      return `${label} inválida: valor não numérico ou nulo (recebido: ${odd})`;
    }
    if (odd < MIN_VALID_ODD) {
      return `${label} inválida: ${odd} ≤ ${MIN_VALID_ODD} — odds menores que 1 violam coerência probabilística`;
    }
    if (odd > MAX_VALID_ODD) {
      return `${label} inválida: ${odd} > ${MAX_VALID_ODD} — possível erro de fonte de dados`;
    }
  }

  // Sanity check: probabilidade bruta total não pode ser < 100% (violaria arbitragem)
  const rawSum = 1 / homeOdd + 1 / drawOdd + 1 / awayOdd;
  if (rawSum < 1.0) {
    return (
      `Odds incoerentes: soma das probabilidades implícitas = ${(rawSum * 100).toFixed(2)}% < 100%. ` +
      `Isso indicaria uma oportunidade de arbitragem impossível em mercados reais.`
    );
  }

  return null;
}

// ─── Método Simples ───────────────────────────────────────────────────────────

/**
 * Remove margem pelo método da **Normalização Simples** (PRD §6).
 *
 * Fórmula:
 *   q_i = 1 / odd_i         (probabilidade implícita bruta)
 *   S   = Σ q_i             (overround — soma > 1)
 *   p_i = q_i / S           (probabilidade normalizada)
 *
 * Características:
 *   - Distribui a margem uniformemente entre os 3 outcomes.
 *   - Rápido e determinístico (sem iteração).
 *   - Padrão recomendado pelo PRD para Pinnacle (margem < 3%).
 *
 * @param odds - Odds decimais brutas validadas
 */
function devigSimple(odds: RawOdds): DevigResult {
  const qH = 1 / odds.homeOdd;
  const qD = 1 / odds.drawOdd;
  const qA = 1 / odds.awayOdd;
  const S = qH + qD + qA; // overround bruto

  const pHome = qH / S;
  const pDraw = qD / S;
  const pAway = qA / S;

  return {
    pHome,
    pDraw,
    pAway,
    impliedOverround: S - 1,
    method: "simple",
    fairOdds: {
      home: 1 / pHome,
      draw: 1 / pDraw,
      away: 1 / pAway,
    },
  };
}

// ─── Método Power ─────────────────────────────────────────────────────────────

// Tolerância de convergência para a busca binária do expoente k
const POWER_TOLERANCE = 1e-10;
// Número máximo de iterações da busca binária
const POWER_MAX_ITER = 100;

/**
 * Remove margem pelo **Método Power** (Shin 1993 / Forrest & Simmons 2002).
 *
 * Fórmula:
 *   Encontrar k ∈ (0, ∞) tal que: Σ (1/odd_i)^k = 1
 *   p_i = (1 / odd_i)^k
 *
 * Raciocínio intuitivo: para k > 1 a probabilidade de favoritos *sobe*
 * proporcionalmente mais que a de azarões, refletindo que a margem da
 * casa recai mais fortemente sobre as odds baixas.
 *
 * Algoritmo: busca binária sobre k.
 *   - f(k) = Σ (1/odd_i)^k é monotonicamente decrescente em k.
 *   - f(1) = overround > 1.
 *   - f(∞) → 0 (somente o favorito absoluto restaria).
 *   - O ponto onde f(k) = 1 é o k "justo".
 *
 * @param odds - Odds decimais brutas validadas
 */
function devigPower(odds: RawOdds): DevigResult {
  // As probabilidades implícitas brutas (sem elevar ao expoente)
  const rawProbs = [1 / odds.homeOdd, 1 / odds.drawOdd, 1 / odds.awayOdd];
  const impliedOverround = rawProbs.reduce((s, p) => s + p, 0) - 1;

  // Para mercados sem margem (overround ≈ 0), k ≈ 1 — retorna normalização simples
  if (impliedOverround < 1e-9) {
    return devigSimple(odds);
  }

  // Busca binária: encontrar k tal que Σ rawProb_i^k = 1
  let lo = 0.0001;
  let hi = 20; // k > 20 produz probabilidades numericamente instáveis

  for (let iter = 0; iter < POWER_MAX_ITER; iter++) {
    const mid = (lo + hi) / 2;
    const sum = rawProbs.reduce((s, p) => s + Math.pow(p, mid), 0);

    if (Math.abs(sum - 1) < POWER_TOLERANCE) {
      lo = mid;
      break;
    }

    // f(k) decrescente: se soma > 1, precisa de k maior
    if (sum > 1) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const k = lo;
  const pHome = Math.pow(rawProbs[0]!, k);
  const pDraw  = Math.pow(rawProbs[1]!, k);
  const pAway  = Math.pow(rawProbs[2]!, k);

  // Renormalização final para corrigir pequenos erros de ponto flutuante
  const total = pHome + pDraw + pAway;
  const pHomeFinal = pHome / total;
  const pDrawFinal  = pDraw  / total;
  const pAwayFinal  = pAway  / total;

  return {
    pHome:  pHomeFinal,
    pDraw:  pDrawFinal,
    pAway:  pAwayFinal,
    impliedOverround,
    method: "power",
    fairOdds: {
      home: 1 / pHomeFinal,
      draw: 1 / pDrawFinal,
      away: 1 / pAwayFinal,
    },
  };
}

// ─── API Pública ──────────────────────────────────────────────────────────────

/**
 * Remove a margem (vigorish) das odds brutas de um mercado 1X2.
 *
 * Esta é a **función central da Fase 2**. Toda função downstream que
 * precisa de probabilidade (anchor-score.ts, variations.ts) deve chamar
 * `devig()` antes de operar.
 *
 * @param odds   - Odds decimais brutas (homeOdd, drawOdd, awayOdd)
 * @param method - Método a usar:
 *                   "simple" (padrão): normalização proporcional — rápido,
 *                   adequado para Pinnacle/OddsPapi (margem < 3%).
 *                   "power": expoente de equilíbrio — mais preciso para
 *                   mercados com spread amplo (ex: odds 1.20 vs 15.00).
 *
 * @returns `DevigOutcome`: `{ ok: true, ...DevigResult }` ou `{ ok: false, error }`.
 *          O chamador deve verificar `ok` antes de usar os valores.
 *
 * @example
 * const result = devig({ homeOdd: 1.65, drawOdd: 3.50, awayOdd: 5.00 });
 * if (result.ok) {
 *   console.log(result.pHome); // 0.5554 (~55.5% — sem margem)
 * }
 */
export function devig(odds: RawOdds, method: DevigMethod = "simple"): DevigOutcome {
  const validationError = validateOdds(odds);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const result = method === "power" ? devigPower(odds) : devigSimple(odds);
  return { ok: true, ...result };
}

/**
 * Versão que lança exceção em vez de retornar `{ ok: false }`.
 * Use internamente no motor quando a validade das odds já foi garantida
 * pelo caller (ex: após validação no pipeline de connectors).
 *
 * @throws Error se as odds forem inválidas
 */
export function devigOrThrow(odds: RawOdds, method: DevigMethod = "simple"): DevigResult {
  const outcome = devig(odds, method);
  if (!outcome.ok) {
    throw new Error(`[BOB/devigging] ${outcome.error}`);
  }
  // Atribuição estrutural segura: { ok: true } & DevigResult ⊇ DevigResult
  const result: DevigResult = outcome;
  return result;
}

/**
 * Compara o resultado do método Simples vs Power para o mesmo conjunto
 * de odds. Útil para diagnóstico no BOB Live Brain Console (Fase 4).
 *
 * @returns Objeto com ambos os resultados lado a lado.
 */
export function devigCompare(odds: RawOdds): {
  simple: DevigOutcome;
  power: DevigOutcome;
  deltaHome: number | null; // diferença em p.p. entre os métodos
  deltaDraw: number | null;
  deltaAway: number | null;
} {
  const simple = devig(odds, "simple");
  const power  = devig(odds, "power");

  const deltaHome =
    simple.ok && power.ok ? (power.pHome - simple.pHome) : null;
  const deltaDraw =
    simple.ok && power.ok ? (power.pDraw - simple.pDraw) : null;
  const deltaAway =
    simple.ok && power.ok ? (power.pAway - simple.pAway) : null;

  return { simple, power, deltaHome, deltaDraw, deltaAway };
}

/**
 * Calcula a margem (overround) bruta sem realizar o de-vigging.
 * Útil como diagnóstico rápido: "qual é a margem desta casa de aposta?"
 *
 * @returns `impliedOverround` em decimal (ex: 0.055 = 5.5%) ou `null` se
 *          as odds forem inválidas.
 */
export function calcOverround(odds: RawOdds): number | null {
  if (validateOdds(odds) !== null) return null;
  const S = 1 / odds.homeOdd + 1 / odds.drawOdd + 1 / odds.awayOdd;
  return S - 1;
}
