/**
 * BOB — Busca em Feixe (Beam Search) para Geração das 5 Variações
 *
 * PRD §4 — "Decisão": montagem matemática do portfólio via Busca em Feixe.
 * PRD §6 — "Geração de Variações": algoritmo de busca combinatória em escala
 * logarítmica para encontrar as 5 permutações disjuntas que atinjam a odd
 * mínima com a maior massa de probabilidade possível.
 *
 * ─── Estabilidade Numérica (Escala Logarítmica) ──────────────────────────────
 *
 * Multiplicar N probabilidades brutas gera underflow para N ≥ 10:
 *   (0.60)^10 ≈ 0.006 — ainda OK.
 *   (0.30)^10 ≈ 5.9e-6 — perda de precisão relativa significativa.
 *
 * O algoritmo NUNCA multiplica probabilidades nem odds durante a busca.
 * Toda acumulação é feita no espaço logarítmico:
 *
 *   logP = Σ log(cleanProb_i)   →   exp(logP)  = Π cleanProb_i
 *   logO = Σ log(rawOdd_i)      →   exp(logO)  = Π rawOdd_i  (odd combinada)
 *
 * Math.exp() é chamado UMA ÚNICA VEZ, apenas na saída final de cada variação.
 *
 * ─── Regra das Âncoras (PRD §3) ──────────────────────────────────────────────
 *
 *   • As 4 âncoras estão presentes em TODOS os 5 bilhetes.
 *   • O pick primário das âncoras (campo `suggestedResult` de scoring.ts)
 *     deve aparecer em ≥ ANCHOR_PRIMARY_MIN_COVERAGE = 3 variações.
 *   • Nas 2 variações restantes (V4, V5), uma âncora é "flipada" para explorar
 *     o segundo outcome mais provável — "cercamento probabilístico" (PRD §3).
 *
 * ─── Disjunção (PRD §3 + §6) ─────────────────────────────────────────────────
 *
 *   Cada variação DEVE diferir de todas as outras em ≥ 1 seleção.
 *   Implementação: penalidade logarítmica suave (REUSE_PENALTY) nas pernas
 *   já utilizadas em variações anteriores. Não é bloqueio rígido — isso evita
 *   travar rodadas com pools reduzidos onde as opções são limitadas.
 *   Warnings são emitidos quando dois bilhetes resultam idênticos.
 *
 * ─── Relação com os Outros Módulos ───────────────────────────────────────────
 *
 *   scoring.ts      → 15 fatores (0-100 score), fornece `suggestedResult`
 *   devigging.ts    → remove margem das odds, fornece cleanProb
 *   anchor-score.ts → seleciona 4 âncoras → beam-search.ts recebe via AnchorSelectionResult
 *   beam-search.ts  → gera 5 variações → cron pre-round + UI consomem VariationsResult
 *
 * PRD §6 | Fase 2 | Output consumido pela Fase 3 (backtesting) e Fase 4 (console)
 */

import { devig } from "./devigging";
import type { DevigResult, RawOdds } from "./devigging";
import type { AnchorCandidate, AnchorSelectionResult } from "./anchor-score";
import type { MatchInput } from "./scoring";

// ─── Configuração Exportada ───────────────────────────────────────────────────

/**
 * Odd combinada alvo padrão da estratégia Big Odds (PRD §3).
 * O portfólio visa bilhetes que, se acertados, rendem ≥ 1.000× o valor apostado.
 */
export const BEAM_TARGET_ODD_DEFAULT = 1000.0;

/**
 * Largura do feixe: quantos estados parciais são retidos por iteração de expansão.
 * 60 = balanço entre cobertura do espaço e performance (<5ms por variação típica).
 */
export const BEAM_WIDTH = 60;

/** Número mínimo de pernas (jogos) por bilhete — PRD §3. */
export const TICKET_MIN_LEGS = 7;

/** Número máximo de pernas por bilhete — PRD §3. */
export const TICKET_MAX_LEGS = 10;

/**
 * Quantas das 5 variações devem ter o pick primário de TODAS as âncoras.
 * PRD §3: "o resultado Vencedor das âncoras deve aparecer em pelo menos 3 das 5 variações".
 */
export const ANCHOR_PRIMARY_MIN_COVERAGE = 3;

// ─── Constantes Internas ──────────────────────────────────────────────────────

/** Epsilon para evitar log(0) em probabilidades muito pequenas. */
const PROB_EPSILON = 1e-9;

/**
 * Penalidade em logProb aplicada a pernas já utilizadas em variações anteriores.
 * Suave o suficiente para não bloquear, forte o suficiente para diversificar.
 * 0.10 ≈ reduz a "atratividade" de uma perna repeated em ~10%.
 */
const REUSE_PENALTY = 0.10;

// ─── Tipos de Saída ───────────────────────────────────────────────────────────

/** Palpite exato selecionado para uma perna do bilhete. */
export type PickOutcome = "Home" | "Draw" | "Away";

// Mapping: suggestedResult de scoring.ts → PickOutcome
const SCORE_TO_PICK: Record<string, PickOutcome | undefined> = {
  "1": "Home",
  "X": "Draw",
  "2": "Away",
};

/**
 * Perna individual de um bilhete: um jogo + palpite exato + métricas.
 * Exposta ao BOB Live Brain Console, ao front-end e ao backtesting.
 */
export type TicketLeg = {
  /** ID único do jogo (de MatchInput.id). */
  matchId: string;
  /** Label legível: ex. "Flamengo x Palmeiras". */
  match: string;
  homeTeam: string;
  awayTeam: string;
  /**
   * Palpite selecionado pelo algoritmo para esta perna.
   * "Home" = mandante vence | "Draw" = empate | "Away" = visitante vence.
   */
  pickOutcome: PickOutcome;
  /** Odd decimal bruta da casa de aposta para este pick (ex: 1.75). */
  pickOdd: number;
  /**
   * Odd justa desvigada: 1 / cleanProb.
   * A diferença entre `pickOdd` e `fairOdd` revela a margem embutida da casa.
   * Ex: pickOdd=1.80 + fairOdd=1.72 → margem paga ≈ 4.4%.
   */
  fairOdd: number;
  /**
   * Probabilidade implícita limpa pós-devigging (sem margem da casa).
   * Usada no cálculo da massa de probabilidade total do bilhete.
   */
  cleanProb: number;
  /** Esta perna é uma das 4 âncoras oficiais da rodada? */
  isAnchor: boolean;
  /**
   * log(pickOdd) — componente logarítmica da odd combinada.
   * Σ logOdd = log(odd combinada) → nenhum overflow.
   */
  logOdd: number;
  /**
   * log(cleanProb) — componente logarítmica da massa de probabilidade.
   * Σ logProb = log(probabilidade de acertar todas as pernas).
   */
  logProb: number;
};

/**
 * Uma Variação (bilhete múltiplo) do portfólio Big Odds.
 * Contém 7–10 pernas e visa odd combinada ≥ targetOdd (default: 1.000).
 */
export type Variation = {
  /** Identificador sequencial da variação. */
  id: "V1" | "V2" | "V3" | "V4" | "V5";
  /**
   * Pernas do bilhete: âncoras primeiro (isAnchor=true), depois complementares.
   * Cada perna carrega o palpite exato (Home | Draw | Away).
   */
  legs: TicketLeg[];
  /**
   * Odd combinada real do bilhete: exp(Σ log(pickOdd_i)) = Π pickOdd_i.
   * Calculada em log-space — zero underflow numérico.
   * Ex: 1.247 = bilhete abaixo do alvo; 1.089 = bilhete acima do alvo.
   */
  combinedOdd: number;
  /**
   * Σ log(pickOdd_i) — para auditoria e re-cálculo sem Math.exp() no backtesting.
   */
  logCombinedOdd: number;
  /**
   * Massa de probabilidade: exp(Σ log(cleanProb_i)) = Π cleanProb_i.
   * Estimativa de acertar TODAS as N pernas usando probabilidades desvigadas.
   * Ex: 0.000082 = 0.0082% de chance de acerto total do bilhete.
   */
  probabilityMass: number;
  /**
   * Σ log(cleanProb_i) — para ranking estável entre variações no backtesting.
   * Variação com maior logProbabilityMass tem maior chance esperada de acerto.
   */
  logProbabilityMass: number;
  /**
   * Quantas das 4 âncoras têm pick primário (suggestedResult) nesta variação.
   * V1/V2/V3 = 4 (todas com pick primário).
   * V4/V5    = 3 (1 âncora com pick alternativo para cercamento PRD §3).
   */
  anchorPrimaryCount: number;
  /** Número total de pernas selecionadas (7–10). */
  legCount: number;
  /**
   * Notas de transparência operacional — PRD §10.
   * Descreve picks contrarian, cercamentos e alertas de contexto.
   */
  transparencyNotes: string[];
};

/**
 * Resultado da geração das 5 Variações — output final do Motor Big Odds.
 * Consumido pelo cron `pre-round`, pela Fase 3 (backtesting) e pela Fase 4 (console).
 */
export type VariationsResult = {
  /** As 5 variações do portfólio da rodada. */
  variations: Variation[];
  meta: {
    round: number | null;
    /** Odd combinada alvo configurada (default: 1000.0). */
    targetOdd: number;
    /** log(targetOdd) — salvo para auditoria sem re-exponenciação. */
    logTargetOdd: number;
    /** Largura do feixe utilizada nesta execução. */
    beamWidth: number;
    /** IDs das 4 âncoras que compõem todos os bilhetes. */
    anchorIds: string[];
    /** Modo de seleção herdado de anchor-score.ts. */
    anchorSelectionMode: "primary" | "fallback";
    /**
     * Versão do algoritmo — campo crítico para rastreabilidade.
     * O backtesting deve filtrar rodadas por `algorithmVersion` para reprodução exata.
     */
    algorithmVersion: "beam-search-v1";
    generatedAt: string;
    /** Avisos operacionais: pool insuficiente, odds inválidas, disjunção comprometida. */
    warnings: string[];
  };
};

// ─── Tipos Internos do Algoritmo ──────────────────────────────────────────────

/**
 * Leg candidata expandida: uma possibilidade de pick (outcome) para um jogo.
 * Uma por (jogo × outcome) = até 3 candidatos por jogo.
 * Idêntica ao TicketLeg, mas mantida internamente para evitar alocações duplicadas.
 */
type CandidateLeg = {
  matchId: string;
  match: string;
  homeTeam: string;
  awayTeam: string;
  pickOutcome: PickOutcome;
  pickOdd: number;
  fairOdd: number;
  cleanProb: number;
  isAnchor: boolean;
  logOdd: number;
  logProb: number;
};

/**
 * Nó do feixe: estado parcial de um bilhete em construção.
 * Acumula logOdd e logProb em vez de multiplicar — estabilidade numérica garantida.
 */
type BeamNode = {
  legs: CandidateLeg[];
  /** Σ log(pickOdd_i) acumulado. */
  logOdd: number;
  /** Σ log(cleanProb_i) acumulado (com penalidades de reuso). */
  logProb: number;
  /** Jogos já incluídos neste nó — impede duplicar o mesmo jogo. */
  usedMatchIds: Set<string>;
};

// ─── Construção do Pool de Candidatos ────────────────────────────────────────

/**
 * Expande um jogo nos seus 3 picks candidatos (Home, Draw, Away).
 * Aplica devigging para obter cleanProb e fairOdd sem margem da casa.
 * Retorna array vazio se as odds forem inválidas (devig guard).
 */
function buildCandidateLegs(
  m: MatchInput,
  isAnchor: boolean,
  devigMethod: "simple" | "power"
): CandidateLeg[] {
  const rawOdds: RawOdds = {
    homeOdd: m.homeOdd,
    drawOdd: m.drawOdd,
    awayOdd: m.awayOdd,
  };

  const outcome = devig(rawOdds, devigMethod);
  if (!outcome.ok) {
    console.warn(
      `[BeamSearch] Odds inválidas para "${m.match}" — excluído do pool. Motivo: ${outcome.error}`
    );
    return [];
  }

  // Atribuição estrutural segura: { ok: true } & DevigResult ⊆ DevigResult
  const dvg: DevigResult = outcome;

  const triplet: Array<{ pick: PickOutcome; rawOdd: number; cleanProb: number }> = [
    { pick: "Home", rawOdd: m.homeOdd, cleanProb: dvg.pHome },
    { pick: "Draw", rawOdd: m.drawOdd, cleanProb: dvg.pDraw },
    { pick: "Away", rawOdd: m.awayOdd, cleanProb: dvg.pAway },
  ];

  return triplet
    .filter((o) => o.rawOdd > 1 + PROB_EPSILON && o.cleanProb > PROB_EPSILON)
    .map((o) => ({
      matchId:     m.id,
      match:       m.match,
      homeTeam:    m.homeTeam,
      awayTeam:    m.awayTeam,
      pickOutcome: o.pick,
      pickOdd:     o.rawOdd,
      fairOdd:     1 / o.cleanProb,
      cleanProb:   o.cleanProb,
      isAnchor,
      logOdd:      Math.log(o.rawOdd),
      logProb:     Math.log(Math.max(o.cleanProb, PROB_EPSILON)),
    }));
}

/** Converte CandidateLeg no tipo de saída pública TicketLeg (cópia rasa). */
function toTicketLeg(c: CandidateLeg): TicketLeg {
  return {
    matchId:     c.matchId,
    match:       c.match,
    homeTeam:    c.homeTeam,
    awayTeam:    c.awayTeam,
    pickOutcome: c.pickOutcome,
    pickOdd:     c.pickOdd,
    fairOdd:     c.fairOdd,
    cleanProb:   c.cleanProb,
    isAnchor:    c.isAnchor,
    logOdd:      c.logOdd,
    logProb:     c.logProb,
  };
}

// ─── Núcleo do Beam Search ────────────────────────────────────────────────────

/**
 * Busca em Feixe sobre o pool de pernas complementares.
 *
 * Estratégia de expansão:
 *   1. Inicializa com um único nó contendo apenas as pernas âncora pré-definidas.
 *   2. A cada passo, expande cada nó com cada perna disponível no pool.
 *   3. Aplica penalidade de reuso em logProb para pernas já vistas em variações anteriores.
 *   4. Ordena os nós candidatos:
 *      — "Válidos" (logOdd ≥ target E legs ≥ TICKET_MIN_LEGS): por logProb DESC.
 *      — "Inválidos": por logOdd DESC (os mais próximos do alvo sobrevivem).
 *   5. Retém os `width` melhores nós (o feixe).
 *   6. Para assim que o melhor nó satisfaz todas as restrições, ou esgota maxLegs.
 *
 * @param anchorLegs    — Pernas fixas das âncoras (ponto de partida do feixe)
 * @param pool          — Pool de pernas complementares (pré-ordenado por logOdd DESC)
 * @param targetLogOdd  — log(targetOdd): alvo logarítmico de odds
 * @param maxLegs       — Máximo de pernas totais no bilhete (inclui âncoras)
 * @param width         — Largura do feixe (quantos nós manter por iteração)
 * @param penalized     — "matchId:outcome" já usados em variações anteriores
 * @returns             — Melhor BeamNode encontrado
 */
function runBeamSearch(
  anchorLegs: CandidateLeg[],
  pool: CandidateLeg[],
  targetLogOdd: number,
  maxLegs: number,
  width: number,
  penalized: Set<string>
): BeamNode {
  const initLogOdd  = anchorLegs.reduce((s, l) => s + l.logOdd,  0);
  const initLogProb = anchorLegs.reduce((s, l) => s + l.logProb, 0);
  const initUsed    = new Set<string>(anchorLegs.map((l) => l.matchId));

  const initial: BeamNode = {
    legs:         anchorLegs,
    logOdd:       initLogOdd,
    logProb:      initLogProb,
    usedMatchIds: initUsed,
  };

  const maxComplement = maxLegs - anchorLegs.length;
  let beams: BeamNode[] = [initial];

  for (let step = 0; step < maxComplement; step++) {
    const next: BeamNode[] = [];

    for (const beam of beams) {
      for (const cand of pool) {
        // Pular jogos já incluídos neste nó
        if (beam.usedMatchIds.has(cand.matchId)) continue;

        const penKey  = `${cand.matchId}:${cand.pickOutcome}`;
        const penalty = penalized.has(penKey) ? REUSE_PENALTY : 0;

        const newUsed = new Set<string>(beam.usedMatchIds);
        newUsed.add(cand.matchId);

        next.push({
          legs:         [...beam.legs, cand],
          logOdd:       beam.logOdd  + cand.logOdd,
          // logProb acumula a penalidade: não afeta a odd real, só o ranking interno
          logProb:      beam.logProb + cand.logProb - penalty,
          usedMatchIds: newUsed,
        });
      }
    }

    if (next.length === 0) break;

    // Ordenação: distingue "válido" de "inválido" para priorizar corretamente.
    // Válido: logOdd ≥ target E pernas ≥ mínimo obrigatório.
    next.sort((a, b) => {
      const aValid = a.logOdd >= targetLogOdd && a.legs.length >= TICKET_MIN_LEGS;
      const bValid = b.logOdd >= targetLogOdd && b.legs.length >= TICKET_MIN_LEGS;
      if (aValid !== bValid) return aValid ? -1 : 1;
      // Ambos válidos: maximizar massa de probabilidade
      if (aValid) return b.logProb - a.logProb;
      // Ambos inválidos: aproximar do alvo (maior logOdd)
      return b.logOdd - a.logOdd;
    });

    beams = next.slice(0, width);

    // Early stop: o melhor nó já satisfaz todas as restrições
    const top = beams[0];
    if (
      top !== undefined &&
      top.logOdd >= targetLogOdd &&
      top.legs.length >= TICKET_MIN_LEGS
    ) {
      break;
    }
  }

  // Retornar o melhor nó válido (atingiu target + min_legs), por logProb DESC.
  // Se nenhum for válido, retornar o de maior logOdd (mais próximo do alvo).
  const validBeams = beams.filter(
    (b) => b.logOdd >= targetLogOdd && b.legs.length >= TICKET_MIN_LEGS
  );

  if (validBeams.length > 0) {
    return validBeams.sort((a, b) => b.logProb - a.logProb)[0]!;
  }

  return (
    [...beams].sort((a, b) => b.logOdd - a.logOdd)[0] ?? initial
  );
}

// ─── Função Pública Principal ─────────────────────────────────────────────────

/**
 * Gera as 5 Variações do portfólio Big Odds via Busca em Feixe.
 *
 * Pipeline oficial (PRD §4 — Etapa "Decisão"):
 *
 *   1. Constrói o pool de pernas candidatas:
 *      3 outcomes × (N − anchors.length) jogos não-âncora.
 *      Ordenado por logOdd DESC: games de odds maiores primeiro
 *      (permite atingir targetLogOdd com menos pernas, preservando slots para diversidade).
 *
 *   2. Pré-computa as 3 pernas candidatas de cada âncora via devigging.
 *
 *   3. Para cada variação, define o conjunto de legs âncora:
 *      — V1, V2, V3: 4 âncoras com pick primário (suggestedResult de scoring.ts).
 *      — V4:         âncora rank-0 flipada para o 2° outcome mais provável.
 *      — V5:         âncora rank-1 flipada para o 2° outcome mais provável.
 *
 *   4. Executa Beam Search complementar com penalidades de reuso para diversidade.
 *
 *   5. Valida:
 *      - Alvo de odd atingido (warning se não)
 *      - Disjunção entre variações (warning se idênticas)
 *      - Regra PRD §3: ≥ ANCHOR_PRIMARY_MIN_COVERAGE (3) variações com picks primários
 *
 * @param anchorResult — Resultado de `selectAnchorsV2()` (4 âncoras oficiais da rodada)
 * @param allMatches   — Lista completa de jogos da rodada (MatchInput[])
 * @param options      — Configuração opcional
 * @returns            — `VariationsResult` com as 5 variações e metadados auditáveis
 */
export function generateVariations(
  anchorResult: AnchorSelectionResult,
  allMatches: MatchInput[],
  options?: {
    /** Odd combinada alvo (default: 1000.0). */
    targetOdd?: number;
    /** Largura do feixe (default: 60). */
    beamWidth?: number;
    /** Método de devigging (default: "simple"). */
    devigMethod?: "simple" | "power";
  }
): VariationsResult {
  const targetOdd   = options?.targetOdd   ?? BEAM_TARGET_ODD_DEFAULT;
  const beamWidth   = options?.beamWidth   ?? BEAM_WIDTH;
  const devigMethod = options?.devigMethod ?? "simple";
  const logTarget   = Math.log(targetOdd);

  const { anchors, meta: anchorMeta } = anchorResult;
  const anchorIdSet = new Set<string>(anchors.map((a) => a.id));
  const warnings: string[] = [];

  // ── Passo 1: Construir pool de pernas não-âncora ────────────────────────────
  //
  // Ordenado por logOdd DESC: games de odds maiores primeiro.
  // O Beam Search atinge targetLogOdd mais rápido com pernas de odds altas,
  // liberando os slots finais para maximizar logProb (massa de probabilidade).
  const nonAnchorPool: CandidateLeg[] = allMatches
    .filter((m) => !anchorIdSet.has(m.id))
    .flatMap((m) => buildCandidateLegs(m, false, devigMethod))
    .sort((a, b) => b.logOdd - a.logOdd);

  if (nonAnchorPool.length === 0) {
    warnings.push(
      "Sinal interrompido: pool de jogos complementares vazio. " +
        "Todos os jogos foram selecionados como âncoras ou possuem odds inválidas."
    );
  }

  // ── Passo 2: Pré-computar legs candidatas de cada âncora ────────────────────
  const anchorLegsMap = new Map<string, CandidateLeg[]>();
  for (const anchor of anchors) {
    const legs = buildCandidateLegs(anchor, true, devigMethod);
    if (legs.length > 0) anchorLegsMap.set(anchor.id, legs);
  }

  /**
   * Retorna a leg do pick primário de uma âncora (baseada em `suggestedResult`).
   * Fallback para a leg de maior logProb se o pick primário for inválido.
   */
  function primaryLeg(anchor: AnchorCandidate): CandidateLeg | null {
    const legs = anchorLegsMap.get(anchor.id);
    if (!legs || legs.length === 0) return null;
    const primaryPick: PickOutcome = SCORE_TO_PICK[anchor.suggestedResult] ?? "Home";
    return (
      legs.find((l) => l.pickOutcome === primaryPick) ??
      legs.slice().sort((a, b) => b.logProb - a.logProb)[0] ??
      null
    );
  }

  /**
   * Retorna a leg do pick alternativo de uma âncora
   * (segundo outcome mais provável, excluindo `excludePick`).
   */
  function alternativeLeg(
    anchor: AnchorCandidate,
    excludePick: PickOutcome
  ): CandidateLeg | null {
    const legs = anchorLegsMap.get(anchor.id);
    if (!legs || legs.length === 0) return null;
    const alts = legs
      .filter((l) => l.pickOutcome !== excludePick)
      .sort((a, b) => b.logProb - a.logProb);
    return alts[0] ?? null;
  }

  // ── Passo 3: Gerar as 5 Variações ───────────────────────────────────────────

  /** Set de "matchId:outcome" já utilizados — penaliza reuso no beam search. */
  const usedLegKeys = new Set<string>();

  const variations: Variation[] = [];
  const VARIATION_IDS: Array<"V1" | "V2" | "V3" | "V4" | "V5"> = [
    "V1", "V2", "V3", "V4", "V5",
  ];

  for (let vi = 0; vi < 5; vi++) {
    const vid = VARIATION_IDS[vi]!;
    const notes: string[] = [];
    let anchorPrimaryCount = 0;

    // ── Montar legs fixas das âncoras para esta variação ──────────────────────
    //
    // Regra de flipping (PRD §3 — cercamento probabilístico):
    //   V4 flipa âncora de rank-0 (a âncora mais forte);
    //   V5 flipa âncora de rank-1 (a segunda âncora mais forte).
    // Isso garante que o espaço de probabilidade seja coberto nos dois eixos.
    const anchorLegs: CandidateLeg[] = [];

    for (let ai = 0; ai < anchors.length; ai++) {
      const anchor = anchors[ai]!;
      const primaryPick: PickOutcome = SCORE_TO_PICK[anchor.suggestedResult] ?? "Home";

      // V4 flipa âncora [0]; V5 flipa âncora [1]
      const shouldFlip = (vi === 3 && ai === 0) || (vi === 4 && ai === 1);

      if (shouldFlip) {
        const altLeg = alternativeLeg(anchor, primaryPick);
        if (altLeg !== null) {
          anchorLegs.push(altLeg);
          notes.push(
            `Âncora "${anchor.match}" com pick alternativo "${altLeg.pickOutcome}" ` +
              `(odd ${altLeg.pickOdd.toFixed(2)}, p=${(altLeg.cleanProb * 100).toFixed(1)}%). ` +
              `Cercamento probabilístico — PRD §3.`
          );
          // anchorPrimaryCount NÃO incrementado (pick não-primário)
        } else {
          // Sem alternativa válida: manter pick primário com aviso
          const priLeg = primaryLeg(anchor);
          if (priLeg !== null) {
            anchorLegs.push(priLeg);
            anchorPrimaryCount++;
          }
          warnings.push(
            `${vid}: sem pick alternativo válido para âncora "${anchor.match}". ` +
              `Mantendo pick primário.`
          );
        }
      } else {
        const priLeg = primaryLeg(anchor);
        if (priLeg !== null) {
          anchorLegs.push(priLeg);
          anchorPrimaryCount++;
        } else {
          warnings.push(
            `${vid}: odds inválidas para âncora "${anchor.match}" — perna omitida do bilhete.`
          );
        }
      }
    }

    // ── Beam Search para pernas complementares ─────────────────────────────────
    const best = runBeamSearch(
      anchorLegs,
      nonAnchorPool,
      logTarget,
      TICKET_MAX_LEGS,
      beamWidth,
      usedLegKeys
    );

    // ── Verificação: alvo de odd atingido? ────────────────────────────────────
    if (best.logOdd < logTarget) {
      warnings.push(
        `${vid}: odd combinada ${Math.exp(best.logOdd).toFixed(0)} ` +
          `abaixo do alvo de ${targetOdd.toFixed(0)}. ` +
          `Pool desta rodada insuficiente para o alvo — rota calculada com o máximo disponível.`
      );
    }

    // ── Registrar pernas para penalização nas próximas variações ──────────────
    for (const leg of best.legs) {
      usedLegKeys.add(`${leg.matchId}:${leg.pickOutcome}`);
    }

    // ── Verificação de disjunção ───────────────────────────────────────────────
    const fingerprint = best.legs
      .map((l) => `${l.matchId}:${l.pickOutcome}`)
      .sort()
      .join("|");

    const isDuplicate = variations.some((prev) => {
      const prevFp = prev.legs
        .map((l) => `${l.matchId}:${l.pickOutcome}`)
        .sort()
        .join("|");
      return prevFp === fingerprint;
    });

    if (isDuplicate) {
      warnings.push(
        `${vid}: bilhete idêntico a uma variação anterior detectado. ` +
          `Pool de jogos muito limitado para esta rodada — diversidade comprometida.`
      );
    }

    // ── Notas de transparência adicionais (PRD §10) ────────────────────────────
    if (vi >= 3 && anchorPrimaryCount < anchors.length) {
      const flippedCount = anchors.length - anchorPrimaryCount;
      notes.push(
        `${flippedCount} âncora(s) com pick alternativo. ` +
          `Massa de probabilidade ajustada para cercamento da distribuição — PRD §3.`
      );
    }

    // ── Montar Variation de saída ──────────────────────────────────────────────
    variations.push({
      id:                 vid,
      legs:               best.legs.map(toTicketLeg),
      combinedOdd:        Math.exp(best.logOdd),
      logCombinedOdd:     best.logOdd,
      probabilityMass:    Math.exp(best.logProb),
      logProbabilityMass: best.logProb,
      anchorPrimaryCount,
      legCount:           best.legs.length,
      transparencyNotes:  notes,
    });
  }

  // ── Passo 4: Validação PRD §3 — cobertura mínima de picks primários ──────────
  const fullPrimaryCoverage = variations.filter(
    (v) => v.anchorPrimaryCount === anchors.length
  ).length;

  if (anchors.length > 0 && fullPrimaryCoverage < ANCHOR_PRIMARY_MIN_COVERAGE) {
    warnings.push(
      `Aviso PRD §3: apenas ${fullPrimaryCoverage}/5 variações têm todas as ` +
        `âncoras com pick primário (mínimo exigido: ${ANCHOR_PRIMARY_MIN_COVERAGE}). ` +
        `Revisar se âncoras possuem picks primários com odds válidas na API.`
    );
  }

  return {
    variations,
    meta: {
      round:               anchorMeta.round,
      targetOdd,
      logTargetOdd:        logTarget,
      beamWidth,
      anchorIds:           anchors.map((a) => a.id),
      anchorSelectionMode: anchorMeta.selectionMode,
      algorithmVersion:    "beam-search-v1",
      generatedAt:         new Date().toISOString(),
      warnings,
    },
  };
}

// ─── Utilidade Pública ────────────────────────────────────────────────────────

/**
 * Formata uma Variação em texto legível para observabilidade.
 * Usado pelo BOB Live Brain Console (Fase 4) e pelos logs de Reflexão (Fase 3).
 *
 * Segue a diretriz de linguagem operacional do PRD §10:
 *   "Fale em processos e probabilidade, nunca em certezas."
 */
export function explainVariation(v: Variation): string {
  const pct  = (n: number, d = 4) => `${(n * 100).toFixed(d)}%`;
  const fmt2 = (n: number)        => n.toFixed(2);
  const fmt4 = (n: number)        => n.toFixed(4);

  const lines: string[] = [
    `=== ${v.id} | ${v.legCount} pernas | Odd Combinada: ${v.combinedOdd.toFixed(0)} | P(acerto total): ${pct(v.probabilityMass)} ===`,
    `LogOdd: ${fmt4(v.logCombinedOdd)} | LogProb: ${fmt4(v.logProbabilityMass)} | Âncoras primárias: ${v.anchorPrimaryCount}`,
    ``,
  ];

  for (const leg of v.legs) {
    const tag = leg.isAnchor ? "[Â]" : "   ";
    lines.push(
      `  ${tag} ${leg.match.padEnd(32)} → ${leg.pickOutcome.padEnd(4)} ` +
        `odd=${fmt2(leg.pickOdd).padEnd(6)} fair=${fmt2(leg.fairOdd).padEnd(6)} ` +
        `p=${pct(leg.cleanProb, 2)}`
    );
  }

  if (v.transparencyNotes.length > 0) {
    lines.push(``, `  Notas de transparência:`);
    v.transparencyNotes.forEach((n) => lines.push(`  • ${n}`));
  }

  return lines.join("\n");
}
