/**
 * BOB — Motor de Seleção de Âncoras (Fase 2)
 *
 * Implementa a fórmula do PRD §6 para ranking e seleção das 4 âncoras
 * absolutas de uma rodada:
 *
 *   Score_ancora = a·pW + b·gap − c·H − d·ΔpW − e·|pW − pᵐᵏᵗ_W|
 *
 * ─── Componentes ─────────────────────────────────────────────────────────────
 *
 *   pW         → Probabilidade de vitória estimada pelo Modelo BOB (score/100).
 *                Fonte: scoring.ts (15 fatores, 0–100) convertido para [0–1].
 *
 *   gap        → Separação entre o resultado mais provável e o segundo.
 *                Calculado sobre as probabilidades do MERCADO (devigging.ts).
 *                Recompensa jogos onde há um claro favorito.
 *
 *   H          → Entropia de Shannon normalizada [0–1].
 *                H = −Σ pᵢ·ln(pᵢ) / ln(3)
 *                Penaliza jogos incertos (H → 1 quando 3 resultados equiprováveis).
 *
 *   ΔpW        → Robustez a desfalques.
 *                Estimativa linear: homeAbsenceRate × ABSENCE_SENSITIVITY.
 *                Penaliza âncoras frágeis (dependentes de titulares em risco).
 *
 *   |pW − pᵐᵏᵗ_W| → Divergência Modelo ↔ Mercado.
 *                pᵐᵏᵗ_W = pHome desvigada (devigging.ts).
 *                Penaliza desalinhamento alto — prudência estatística.
 *
 * ─── Dupla Fonte de Probabilidade ────────────────────────────────────────────
 *
 *   BOB Model (pW):  15 fatores táticos/contextuais → tendência do jogo.
 *   Mercado (pᵐᵏᵗ): odds desvigadas pela devigging.ts → consenso do mercado.
 *
 *   A díade pW + pᵐᵏᵗ captura o MELHOR dos dois mundos:
 *     - xG/processo      →  BOB model
 *     - fluxo de capital →  mercado Pinnacle/OddsPapi
 *
 *   A divergência entre ambos NÃO é necessariamente "value bet" em Phase 2 —
 *   pode indicar limitação do modelo (xG ainda não integrado). Por isso é
 *   PENALIZADA com peso e=0.5 até a Fase 3 calibrar os pesos pelo backtest.
 *
 * ─── Calibração e Backtesting ────────────────────────────────────────────────
 *
 *   Os pesos {a, b, c, d, e} são CONSTANTES exportadas e auditáveis.
 *   A Fase 3 (Simulação Cega) ajustará esses valores via gradiente para
 *   maximizar o ROI histórico sem overfitting (anti-leakage via Blind Replay).
 *
 *   Para aplicar pesos customizados: passe `weights` para `selectAnchorsV2()`.
 *
 * ─── Transparência (PRD §10) ─────────────────────────────────────────────────
 *
 *   Todo `AnchorCandidate` carrega `calibrationAlerts[]` — mensagens geradas
 *   quando os componentes da fórmula sinalizam risco elevado:
 *     "Probabilidade cai devido ao desfalque Y. Esta é uma âncora de alto risco."
 *     "Sinal interrompido. Rebaixando nível de confiança da Âncora."
 *
 * ─── Relação com scoring.ts ──────────────────────────────────────────────────
 *
 *   scoring.ts      → motor de features (0–100 score) — fornece pW.
 *   anchor-score.ts → motor de ranking (fórmula PRD) — usa pW como INPUT.
 *   beam-search.ts  → montagem das 5 variações — usa anchors como INPUT.
 *
 * PRD §6 | Fase 2 | Construído para Phase 3 Backtesting
 */

import { devig } from "./devigging";
import type { DevigResult } from "./devigging";
import { scoreMatch } from "./scoring";
import type { MatchInput, ScoredMatch } from "./scoring";

// ─── Pesos de Calibração ──────────────────────────────────────────────────────
//
// ATENÇÃO: Estes são os pesos INICIAIS da Fase 2.
// A Fase 3 (Backtesting Cego noturno) calibrará esses valores via gradiente
// para maximizar o ROI histórico sem vazamento de dados futuros.
//
// Valores iniciais derivados da importância relativa de cada componente:
//   a=1.0 — pW é o sinal principal; peso máximo
//   b=0.8 — gap forte: favorito claro é condição quase obrigatória
//   c=0.5 — entropia penaliza, mas não bloqueia jogos de média incerteza
//   d=1.2 — ausências têm impacto crítico; peso acima de 1.0 (conservador)
//   e=0.5 — divergência moderada é aceitável em Phase 2 (modelo ainda sem xG)
export const ANCHOR_FORMULA_WEIGHTS = {
  a: 1.0, // pW          — win probability (BOB model)
  b: 0.8, // gap         — margin over second-most-probable outcome
  c: 0.5, // H           — Shannon entropy (penalizes uncertain games)
  d: 1.2, // ΔpW         — absence fragility (penalizes key-player dependency)
  e: 0.5, // marketDiv   — divergence model ↔ market (penalizes large mismatches)
} as const;

export type AnchorFormulaWeights = typeof ANCHOR_FORMULA_WEIGHTS;

// ─── Constantes de Controle ───────────────────────────────────────────────────

/**
 * Sensibilidade linear da ausência sobre a probabilidade de vitória.
 * 0.40 → desfalque de 100% do elenco reduziria pW em 40 p.p. (conservador).
 * Calibrável via ANCHOR_FORMULA_WEIGHTS.d em conjunto.
 */
const ABSENCE_SENSITIVITY = 0.40;

/** ln(3) — normalizador da entropia de Shannon para 3 resultados. */
const LN3 = Math.log(3);

/** Epsilon mínimo para evitar log(0) no cálculo de entropia. */
const PROB_EPSILON = 1e-9;

/** Odd máxima do mandante para ser elegível como âncora primária. */
const ANCHOR_MAX_ODD_PRIMARY = 2.20;

/** Odd máxima para fallback (menos de 2 âncoras primárias disponíveis). */
const ANCHOR_MAX_ODD_FALLBACK = 2.50;

/**
 * Entropia H acima deste limiar dispara alerta de calibração.
 * 0.90 = jogo muito incerto (odds próximas de 1.90 / 3.20 / 3.20).
 */
const ENTROPY_ALERT_THRESHOLD = 0.90;

/**
 * Entropia H acima deste limiar BLOQUEIA o jogo como âncora primária.
 * 0.97 = quase certeza de que nenhum resultado é dominante.
 */
const ENTROPY_BLOCK_THRESHOLD = 0.97;

/** Divergência |pW − pᵐᵏᵗ| acima deste limiar dispara alerta de calibração. */
const DIVERGENCE_ALERT_THRESHOLD = 0.20;

/** ΔpW acima deste limiar (ex: 15%) dispara alerta de ausências críticas. */
const DELTA_PW_ALERT_THRESHOLD = 0.15;

// ─── Tipos ────────────────────────────────────────────────────────────────────

/**
 * Breakdown completo dos 5 termos da fórmula PRD §6.
 * Exposto ao BOB Live Brain Console (Fase 4) para rastreio cognitivo visual.
 */
export type AnchorScoreBreakdown = {
  // ── Probabilidades (inputs ao cálculo) ──────────────────────────────────
  /** pW: probabilidade do BOB Model para o mandante vencer (score/100). */
  pW: number;
  /** pMarket: probabilidade desvigada do mercado para vitória do mandante. */
  pMarket: number;
  /** pDraw: probabilidade desvigada do mercado para empate. */
  pDraw: number;
  /** pAway: probabilidade desvigada do mercado para vitória do visitante. */
  pAway: number;
  /** Odds justas (sem margem) calculadas pelo devigging. */
  fairOdds: DevigResult["fairOdds"];

  // ── Componentes da fórmula (antes da ponderação) ─────────────────────────
  /**
   * gap = pMax − pSecond (sobre probabilidades do mercado desvigado).
   * Captura o tamanho da vantagem do favorito sobre o segundo resultado.
   */
  gap: number;
  /**
   * H = −Σ pᵢ·ln(pᵢ) / ln(3), normalizado em [0–1].
   * 0 = certeza absoluta. 1 = máxima incerteza (3 outcomes equiprováveis).
   */
  entropyH: number;
  /**
   * ΔpW = homeAbsenceRate × ABSENCE_SENSITIVITY.
   * Estimativa da queda de pW caso os desfalques atuais se mantenham.
   * Fase 3 substituirá isso por simulação Monte Carlo sobre rosters.
   */
  deltaPW: number;
  /**
   * |pW − pᵐᵏᵗ_W| — divergência absoluta entre modelo BOB e mercado.
   * Alta divergência pode indicar edge (futuro) ou limitação do modelo (atual).
   */
  marketDivergence: number;

  // ── Termos ponderados (contribuição individual de cada componente) ───────
  /** +termA = a × pW (positivo — recompensa favoritos seguros) */
  termA: number;
  /** +termB = b × gap (positivo — recompensa separação clara) */
  termB: number;
  /** −termC = c × H (negativo — penaliza incerteza) */
  termC: number;
  /** −termD = d × ΔpW (negativo — penaliza fragilidade por ausência) */
  termD: number;
  /** −termE = e × |divergência| (negativo — penaliza desalinhamento BOB↔Mercado) */
  termE: number;

  /** Score final da fórmula PRD. Não normalizado — para ranking relativo. */
  anchorScore: number;

  /** Margem bruta identificada pelo devigging (ex: 0.055 = 5.5%). */
  impliedOverround: number;
  /** Método de devigging aplicado ("simple" | "power"). */
  devigMethod: DevigResult["method"];
};

/**
 * Match com o ranking completo determinado pela fórmula PRD §6.
 * Usado exclusivamente pelo pipeline oficial (beam-search.ts).
 */
export type AnchorCandidate = ScoredMatch & {
  /** Posição no ranking de âncoras (1 = maior Score_ancora da rodada). */
  anchorRank: number;
  /** true se este game foi selecionado como uma das 4 âncoras oficiais. */
  isAnchor: boolean;
  /** Score bruto da fórmula PRD (valor numérico para comparação). */
  anchorScore: number;
  /** Breakdown auditável dos 5 componentes. */
  anchorBreakdown: AnchorScoreBreakdown;
  /**
   * Alertas gerados pela análise dos componentes — PRD §10 "Transparência".
   * Cada alerta é uma frase operacional no estilo da personalidade do BOB.
   * ex: "Probabilidade cai devido ao desfalque. Esta é uma âncora de alto risco."
   */
  calibrationAlerts: string[];
};

/**
 * Resultado completo da seleção de âncoras.
 * `anchors` contém as âncoras oficiais; `allRanked` expõe o ranking completo
 * para o BOB Live Brain Console e o Backtesting.
 */
export type AnchorSelectionResult = {
  /** Top 4 âncoras oficiais (ou menos se rodada tiver menos favoritos claros). */
  anchors: AnchorCandidate[];
  /** Todos os jogos da rodada, ordenados por anchorScore DESC. */
  allRanked: AnchorCandidate[];
  meta: {
    round: number | null;
    totalMatches: number;
    anchorCount: number;
    /** "primary" = todos os 4 passaram nos critérios estritos. */
    selectionMode: "primary" | "fallback";
    formulaWeights: AnchorFormulaWeights;
    generatedAt: string;
  };
};

// ─── Funções Matemáticas Internas ─────────────────────────────────────────────

/**
 * Entropia de Shannon normalizada para 3 resultados.
 *
 * H = −Σ pᵢ·ln(pᵢ) / ln(3)
 *
 * Resultado em [0, 1]:
 *   0.0 = certeza absoluta (um outcome com p=1)
 *   1.0 = máxima incerteza (três outcomes com p=1/3 cada)
 *
 * @param p1 p2 p3 — probabilidades que SOMAM 1 (após devigging)
 */
function shannonEntropyNorm(p1: number, p2: number, p3: number): number {
  // Clamp para evitar log(0)
  const safe = (p: number) => Math.max(p, PROB_EPSILON);
  const h =
    -(safe(p1) * Math.log(safe(p1)) +
      safe(p2) * Math.log(safe(p2)) +
      safe(p3) * Math.log(safe(p3)));
  return Math.min(1, h / LN3);
}

/**
 * Gap entre o resultado mais provável e o segundo mais provável.
 * Calculado sobre as probabilidades desvigadas do mercado.
 *
 * gap = pFavorito − pSegundo
 *
 * Valores altos (>0.20) indicam favorito muito claro.
 * Valores baixos (<0.05) indicam jogo equilibrado — risco aumentado.
 *
 * @param probs — tripla de probabilidades desvigadas
 */
function calcGap(probs: [number, number, number]): number {
  const sorted = [...probs].sort((a, b) => b - a);
  return Math.max(0, sorted[0]! - sorted[1]!);
}

/**
 * Delta de probabilidade de vitória por desfalques — robustez a ausências.
 *
 * ΔpW = homeAbsenceRate × ABSENCE_SENSITIVITY
 *
 * Modelo linear: cada ponto percentual de ausência remove
 * `ABSENCE_SENSITIVITY` pontos percentuais de pW esperado.
 *
 * Fase 3 substituirá este modelo linear por simulação Monte Carlo
 * sobre rosters (dados de API-Football + TheSportsDB) para estimar
 * o impacto real de cada titular específico ausente.
 */
function calcDeltaPW(homeAbsenceRate: number): number {
  return Math.min(1, Math.max(0, homeAbsenceRate * ABSENCE_SENSITIVITY));
}

// ─── Kernel da Fórmula PRD §6 ─────────────────────────────────────────────────

/**
 * Calcula os 5 termos da fórmula e o Score_ancora resultante.
 *
 * Score_ancora = a·pW + b·gap − c·H − d·ΔpW − e·|pW − pᵐᵏᵗ_W|
 *
 * @param bobScore     — Score do motor de 15 fatores (0–100)
 * @param dvg          — Resultado do devigging (mercado limpo)
 * @param absenceRate  — homeAbsenceRate do MatchInput
 * @param w            — pesos da fórmula
 */
function computeAnchorScore(
  bobScore: number,
  dvg: DevigResult,
  absenceRate: number,
  w: AnchorFormulaWeights
): AnchorScoreBreakdown {
  // pW: probabilidade BOB Model [0–1]
  const pW = Math.min(1, Math.max(0, bobScore / 100));

  // Probabilidades do mercado (desvigadas)
  const pMarket = dvg.pHome;
  const pDraw   = dvg.pDraw;
  const pAway   = dvg.pAway;

  // Componentes
  const gap             = calcGap([pMarket, pDraw, pAway]);
  const entropyH        = shannonEntropyNorm(pMarket, pDraw, pAway);
  const deltaPW         = calcDeltaPW(absenceRate);
  const marketDivergence = Math.abs(pW - pMarket);

  // Termos ponderados
  const termA = w.a * pW;
  const termB = w.b * gap;
  const termC = w.c * entropyH;
  const termD = w.d * deltaPW;
  const termE = w.e * marketDivergence;

  // Score_ancora (pode ser negativo em jogos muito incertos)
  const anchorScore = termA + termB - termC - termD - termE;

  return {
    pW, pMarket, pDraw, pAway,
    fairOdds: dvg.fairOdds,
    gap, entropyH, deltaPW, marketDivergence,
    termA, termB, termC, termD, termE,
    anchorScore,
    impliedOverround: dvg.impliedOverround,
    devigMethod: dvg.method,
  };
}

// ─── Geração de Alertas de Calibração (PRD §10) ───────────────────────────────

/**
 * Gera os alertas de transparência do BOB com base nos componentes da fórmula.
 * Cada alerta segue a linguagem operacional do PRD §10:
 *   - Metáforas curtas e operacionais
 *   - Fala em probabilidade, nunca em certeza
 *   - Justifica explicitamente o risco identificado
 */
function generateCalibrationAlerts(
  bd: AnchorScoreBreakdown,
  matchLabel: string
): string[] {
  const alerts: string[] = [];

  // Alerta de entropia crítica
  if (bd.entropyH >= ENTROPY_BLOCK_THRESHOLD) {
    alerts.push(
      `Sinal interrompido (${matchLabel}). ` +
      `Entropia H=${(bd.entropyH * 100).toFixed(1)}% — jogo em colapso probabilístico. ` +
      `Rebaixando nível de confiança da Âncora ao mínimo.`
    );
  } else if (bd.entropyH >= ENTROPY_ALERT_THRESHOLD) {
    alerts.push(
      `A entropia deste jogo é elevada (H=${(bd.entropyH * 100).toFixed(1)}%). ` +
      `Três resultados competem com probabilidades similares. ` +
      `A Âncora é tecnicamente válida, mas a rota calculada tem curvatura de risco alta.`
    );
  }

  // Alerta de desfalques críticos
  if (bd.deltaPW >= DELTA_PW_ALERT_THRESHOLD) {
    alerts.push(
      `A probabilidade de vitória cai ${(bd.deltaPW * 100).toFixed(1)} p.p. ` +
      `com os desfalques atuais (Δ=${(bd.deltaPW * 100).toFixed(1)}%). ` +
      `Esta é uma âncora de alto risco. ` +
      `Confirme a escalação na janela T-1h antes de congelar a decisão.`
    );
  }

  // Alerta de divergência BOB ↔ Mercado
  if (bd.marketDivergence >= DIVERGENCE_ALERT_THRESHOLD) {
    const direction = bd.pW > bd.pMarket
      ? `o Modelo BOB superaprecia (+${((bd.pW - bd.pMarket) * 100).toFixed(1)} p.p. acima do mercado)`
      : `o Mercado superaprecia (+${((bd.pMarket - bd.pW) * 100).toFixed(1)} p.p. acima do modelo)`;
    alerts.push(
      `Divergência de mercado elevada: ${direction}. ` +
      `Até que a Fase 3 calibre os pesos, esta discordância é penalizada. ` +
      `A rota calculada se apoia no xGD superior — mas o mercado discorda.`
    );
  }

  // Alerta: odd acima do limiar de confiança
  if (bd.pMarket < 0.45) {
    alerts.push(
      `Mercado desvigado atribui menos de ${(bd.pMarket * 100).toFixed(1)}% ` +
      `ao mandante — a odd justa seria ${(1 / bd.pMarket).toFixed(2)}. ` +
      `Favorito fraco. Confirme a margem: este jogo exige o Modo Crítico Interno.`
    );
  }

  return alerts;
}

// ─── Pipeline Oficial de Seleção (Fase 2) ─────────────────────────────────────

/**
 * Seleção oficial das âncoras pelo algoritmo PRD §6.
 *
 * Pipeline:
 *   1. Para cada jogo: `scoreMatch()` (15 fatores) → `devig()` (mercado limpo)
 *   2. Calcular os 5 termos da fórmula → `anchorScore`
 *   3. Gerar alertas de calibração (PRD §10)
 *   4. Ordenar por `anchorScore` DESC
 *   5. Selecionar Top 4 com critérios de qualidade → retornar `AnchorSelectionResult`
 *
 * Modo "primary": 4 âncoras passam em todos os critérios estritos.
 * Modo "fallback": menos de 2 no modo primário — critérios relaxados
 *                  (odd ≤ 2.50, clássicos ainda excluídos).
 *
 * @param matches      — Lista de jogos da rodada (MatchInput[])
 * @param round        — Número da rodada (para metadados e rastreabilidade)
 * @param weights      — Pesos da fórmula (default: ANCHOR_FORMULA_WEIGHTS)
 * @param devigMethod  — Método de devigging ("simple" | "power"; default: "simple")
 */
export function selectAnchorsV2(
  matches: MatchInput[],
  round?: number,
  weights: AnchorFormulaWeights = ANCHOR_FORMULA_WEIGHTS,
  devigMethod: "simple" | "power" = "simple"
): AnchorSelectionResult {
  const allRanked: AnchorCandidate[] = [];

  for (const m of matches) {
    // ── Passo 1: Score dos 15 fatores (BOB Model) ──────────────────────────
    const scored: ScoredMatch = scoreMatch(m);

    // ── Passo 2: Devigging (Mercado limpo) ─────────────────────────────────
    const devigOutcome = devig(
      { homeOdd: m.homeOdd, drawOdd: m.drawOdd, awayOdd: m.awayOdd },
      devigMethod
    );

    if (!devigOutcome.ok) {
      // Odds inválidas — reportar e excluir do ranking
      console.warn(
        `[AnchorScore] Odds inválidas para "${m.match}" — excluído do ranking. Motivo: ${devigOutcome.error}`
      );
      continue;
    }

    // Atribuição estrutural segura: após o guard, DevigOutcome estreita para
    // { ok: true } & DevigResult, que é compatível com DevigResult por subtipagem.
    const dvg: DevigResult = devigOutcome;

    // ── Passo 3: Fórmula PRD §6 ────────────────────────────────────────────
    const breakdown = computeAnchorScore(
      scored.score,
      dvg,
      m.homeAbsenceRate,
      weights
    );

    // ── Passo 4: Alertas de calibração (PRD §10) ───────────────────────────
    const calibrationAlerts = generateCalibrationAlerts(breakdown, m.match);

    allRanked.push({
      ...scored,
      anchorRank:         0,     // definido após sorting
      isAnchor:           false, // definido após seleção
      anchorScore:        breakdown.anchorScore,
      anchorBreakdown:    breakdown,
      calibrationAlerts,
    });
  }

  // ── Passo 5: Ordenar por anchorScore DESC ──────────────────────────────────
  allRanked.sort((a, b) => b.anchorScore - a.anchorScore);
  allRanked.forEach((c, i) => { c.anchorRank = i + 1; });

  // ── Passo 6: Selecionar as 4 âncoras ──────────────────────────────────────
  //
  // Critérios PRIMÁRIOS (todos obrigatórios):
  //   ① Não é clássico regional (RN05 — volatilidade imprevisível)
  //   ② homeOdd ≤ 2.20 (mercado confirma o favorito)
  //   ③ Entropia H < 0.97 (não está em colapso probabilístico)
  //   ④ anchorScore > 0 (a soma dos termos positivos supera os negativos)
  const primaryCandidates = allRanked.filter(
    (c) =>
      !c.isClassico &&
      c.homeOdd <= ANCHOR_MAX_ODD_PRIMARY &&
      c.anchorBreakdown.entropyH < ENTROPY_BLOCK_THRESHOLD &&
      c.anchorScore > 0
  );

  let anchors: AnchorCandidate[];
  let selectionMode: "primary" | "fallback";

  if (primaryCandidates.length >= 2) {
    anchors = primaryCandidates.slice(0, 4);
    selectionMode = "primary";
  } else {
    // Fallback: relaxar odd (≤ 2.50) e manter exclusão de clássicos
    // Acionado apenas quando a rodada tem poucos favoritos claros
    const fallbackCandidates = allRanked.filter(
      (c) =>
        !c.isClassico &&
        c.homeOdd <= ANCHOR_MAX_ODD_FALLBACK &&
        c.anchorScore > -0.2 // aceita scores levemente negativos no fallback
    );

    anchors = fallbackCandidates.slice(0, 3).map((c) => ({
      ...c,
      calibrationAlerts: [
        ...c.calibrationAlerts,
        "Modo fallback ativo: rodada com poucos favoritos claros. " +
          "A rota calculada opera com critérios relaxados. " +
          "Considere reduzir o número de apostas nesta rodada.",
      ],
    }));
    selectionMode = "fallback";
  }

  // Marcar âncoras no allRanked
  const anchorIds = new Set(anchors.map((a) => a.id));
  allRanked.forEach((c) => {
    if (anchorIds.has(c.id)) {
      c.isAnchor = true;
    }
  });
  anchors.forEach((a) => { a.isAnchor = true; });

  return {
    anchors,
    allRanked,
    meta: {
      round:          round ?? null,
      totalMatches:   matches.length,
      anchorCount:    anchors.length,
      selectionMode,
      formulaWeights: weights,
      generatedAt:    new Date().toISOString(),
    },
  };
}

// ─── Utilidades Públicas ──────────────────────────────────────────────────────

/**
 * Formata o breakdown de uma âncora em texto legível.
 * Usado pelo BOB Live Brain Console (Fase 4) e pelo log de Reflexões.
 *
 * Segue a diretriz de linguagem do PRD §10:
 *   "Fale em processos e probabilidade, nunca em certezas."
 */
export function explainAnchorScore(candidate: AnchorCandidate): string {
  const b  = candidate.anchorBreakdown;
  const w  = ANCHOR_FORMULA_WEIGHTS;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  const lines = [
    `=== Âncora ${candidate.anchorRank}º: ${candidate.match} ===`,
    `Score BOB (15 fatores): ${candidate.score}/100  |  Score Fórmula PRD: ${b.anchorScore.toFixed(4)}`,
    `Odd original: ${candidate.homeOdd}  |  Odd justa (devig): ${b.fairOdds.home.toFixed(2)}  ` +
      `|  Margem da casa: ${pct(b.impliedOverround)} (método ${b.devigMethod})`,
    ``,
    `Score_ancora = a·pW + b·gap − c·H − d·ΔpW − e·|div|`,
    `  +A  (${w.a} × pW=${pct(b.pW)})        → +${b.termA.toFixed(4)}`,
    `  +B  (${w.b} × gap=${pct(b.gap)})       → +${b.termB.toFixed(4)}`,
    `  −C  (${w.c} × H=${pct(b.entropyH)})    → −${b.termC.toFixed(4)}`,
    `  −D  (${w.d} × ΔpW=${pct(b.deltaPW)})   → −${b.termD.toFixed(4)}`,
    `  −E  (${w.e} × div=${pct(b.marketDivergence)}) → −${b.termE.toFixed(4)}`,
    `  ─────────────────────────────────────────────`,
    `  Score_ancora: ${b.anchorScore.toFixed(4)}`,
    ``,
    `Probabilidades desvigadas:`,
    `  Home: ${pct(b.pMarket)} | Draw: ${pct(b.pDraw)} | Away: ${pct(b.pAway)}  ` +
      `(BOB Model: ${pct(b.pW)})`,
    `  Divergência BOB↔Mkt: ${pct(b.marketDivergence)}  |  Entropia H: ${pct(b.entropyH)}`,
  ];

  if (candidate.calibrationAlerts.length > 0) {
    lines.push(``, `⚠️  Alertas de Calibração:`);
    candidate.calibrationAlerts.forEach((a) => lines.push(`  • ${a}`));
  }

  if (candidate.isAnchor) {
    lines.push(``, `✓ ÂNCORA OFICIAL — compõe o portfólio das 5 Variações da rodada.`);
  }

  return lines.join("\n");
}

/**
 * Recalcula o `anchorScore` de um único `AnchorCandidate` com novos pesos.
 * Usado pela Fase 3 (Backtesting) para testar o impacto de mudanças de calibração
 * sem reprocessar toda a rodada.
 */
export function recalculateWithWeights(
  candidate: AnchorCandidate,
  newWeights: AnchorFormulaWeights
): number {
  const b = candidate.anchorBreakdown;
  return (
    newWeights.a * b.pW +
    newWeights.b * b.gap -
    newWeights.c * b.entropyH -
    newWeights.d * b.deltaPW -
    newWeights.e * b.marketDivergence
  );
}
