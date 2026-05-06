/**
 * BOB — Orquestrador de Backtesting Cego (Blind Replay Simulator)
 *
 * PRD §7 — "Simulação Cega e Aprendizado (Backtesting)":
 *
 *   "Ao simular rodadas passadas, o orquestrador oculta os resultados
 *    oficiais e entrega apenas estatísticas até o dia T-1 do jogo."
 *
 * ─── Por que "Cego" é natural nesta arquitetura ─────────────────────────────
 *
 * `MatchInput` (o tipo de entrada do motor) NÃO tem campo de resultado.
 * Ele contém apenas dados pré-jogo: forma, posição, odds, desfalques, clima...
 * O motor (scoring → anchor-score → beam-search) é estruturalmente cego
 * porque nunca recebe o placar do jogo em questão.
 *
 * O que este módulo adiciona:
 *   1. Coleta os resultados REAIS da rodada passada (para o Pós-Mortem).
 *   2. Executa o motor cego com os dados pré-jogo (via Data Gateway).
 *   3. Cruza as variações geradas com os resultados reais → Pós-Mortem.
 *   4. Monta um Payload estruturado para envio à LLM (Reflexão — Passo 2 da Fase 3).
 *
 * ─── Anti-Leakage (Limitação documentada da Fase 3) ─────────────────────────
 *
 * O Data Gateway computa forma e classificação com dados ATUAIS do
 * banco. Para rodadas recentes, isso cria leakage potencial: a forma calculada
 * já inclui o resultado da rodada simuada.
 *
 * Mitigação Fase 3: o `MatchInput.id` não carrega resultado — o motor jamais
 * "vê" o placar da rodada-alvo. A leakage afeta apenas o contexto de forma (F2)
 * e posição (F1), e é documentada nos warnings do SimulationReport.
 *
 * Solução definitiva (Fase 5): snapshots históricos de stats por rodada,
 * gravados ao final de cada rodada pelo cron `post-round`.
 *
 * ─── Relação com o Pipeline da Fase 2 ────────────────────────────────────────
 *
 *   getGatewayRoundDataset() → MatchInput[] (pré-jogo, sem resultado)
 *   selectAnchorsV2()        → AnchorSelectionResult (4 âncoras)
 *   generateVariations()     → VariationsResult (5 bilhetes)
 *   [blind-simulator.ts]      → cruzamento com resultados reais → SimulationReport
 *
 * PRD §7 | Fase 3 | Output consumido pela LLM (Passo 2) e pelo backtesting cron
 */

import { getGatewayMatchesByMatchday, getGatewayRoundDataset } from "@/lib/data/sports-data-gateway";
import type { FDMatch } from "@/lib/data/sports-data-gateway";

import {
  selectAnchorsV2,
} from "../engine/anchor-score";
import type { AnchorSelectionResult, AnchorFormulaWeights } from "../engine/anchor-score";

import {
  generateVariations,
} from "../engine/beam-search";
import type { VariationsResult, PickOutcome } from "../engine/beam-search";

// ─── Tipos Públicos de Saída ──────────────────────────────────────────────────

/**
 * Resultado real de um jogo, extraído após "tirar a venda".
 * Mapeado de FDMatch.score.winner para a linguagem interna do motor.
 */
export type ActualOutcome = "Home" | "Draw" | "Away";

/**
 * Resultado verificado de um jogo da rodada simulada.
 * Chave de cruzamento: `matchId === MatchInput.id === FDMatch.id.toString()`.
 */
export type MatchActualResult = {
  /** ID numérico da API convertido para string (coincide com MatchInput.id). */
  matchId: string;
  /** Label legível: "Flamengo x Palmeiras". */
  match: string;
  homeTeam: string;
  awayTeam: string;
  /** O que realmente aconteceu no jogo. */
  outcome: ActualOutcome;
  homeScore: number;
  awayScore: number;
};

/**
 * Auditoria de uma única perna do bilhete após o resultado real ser conhecido.
 */
export type PickPostMortem = {
  matchId: string;
  match: string;
  /** Palpite gerado pelo motor cego. */
  predicted: PickOutcome;
  /** Resultado real do jogo. */
  actual: ActualOutcome;
  correct: boolean;
  /** Odd bruta da casa de aposta para o pick gerado. */
  pickOdd: number;
  /** Probabilidade implícita limpa (desvigada) usada no cálculo da massa. */
  cleanProb: number;
  isAnchor: boolean;
};

/**
 * Auditoria completa de uma variação pós-resultado.
 * "Green" = todas as pernas corretas → bilhete vencedor (raro, objetivo).
 * "Red"   = uma ou mais pernas erradas → bilhete perdedor.
 */
export type VariationPostMortem = {
  /** Identificador da variação (V1–V5). */
  variationId: "V1" | "V2" | "V3" | "V4" | "V5";
  /** Resultado do bilhete: Green = acertou todas; Red = errou alguma. */
  status: "Green" | "Red";
  totalPicks: number;
  correctPicks: number;
  /**
   * true se errou por EXATAMENTE 1 perna.
   * Quase-acertos são informação crítica para calibrar o motor:
   * identificam sistematicamente qual âncora/jogo é o elo fraco.
   */
  nearMiss: boolean;
  /** Odd combinada projetada pelo motor (sem saber o resultado). */
  projectedOdd: number;
  /** Detalhamento pick-a-pick. */
  picks: PickPostMortem[];
  /**
   * Picks incorretos (subset de `picks` onde !correct).
   * Atalho para relatórios e para montar o `PostMortemLLMPayload`.
   */
  missedPicks: PickPostMortem[];
};

/**
 * Auditoria de uma âncora específica pós-resultado.
 * Âncoras falhadas são a variável mais importante para a Reflexão da LLM:
 * indicam onde o Anchor Score superestimou a segurança do favorito.
 */
export type AnchorPostMortem = {
  matchId: string;
  match: string;
  /** Posição da âncora no ranking PRD §6 (1 = melhor Score_ancora da rodada). */
  anchorRank: number;
  /** Score_ancora calculado pelo motor. */
  anchorScore: number;
  /** Score do motor de 15 fatores (0–100). */
  bobScore: number;
  /** Pick gerado para esta âncora (quase sempre "Home"). */
  predictedOutcome: PickOutcome;
  /** Resultado real. */
  actualOutcome: ActualOutcome;
  correct: boolean;
  /** homeOdd bruta usada no cálculo. */
  homeOdd: number;
  /**
   * Alertas de calibração que o motor gerou PRÉ-JOGO.
   * Âncoras com alertas que depois falharam são especialmente informativos:
   * o motor JÁ SABIA do risco e ainda assim não desqualificou o jogo.
   * Fonte de ajuste de parâmetros na Fase 3.
   */
  preGameCalibrationAlerts: string[];
};

/**
 * Payload estruturado para envio à LLM (Claude/GPT) para geração da Reflexão.
 *
 * PRD §7: "O cérebro gera uma Reflexão sobre o erro e grava na Memória de Padrões
 * para ajustar os multiplicadores matemáticos nas próximas rodadas."
 *
 * PRD §10: "Fale em processos e probabilidade, nunca em certezas."
 *
 * Este payload é o INPUT do Passo 2 da Fase 3 (integração com LLM).
 * Inclui um `diagnosticPrompt` pré-formatado no estilo do PRD §10.
 */
export type PostMortemLLMPayload = {
  round: number;
  season: number;
  /**
   * Resumo em linguagem operacional do resultado da simulação.
   * ex: "3/5 variações na Rodada 12 de 2026: 1 Green, 4 Red. 2 quase-acertos."
   */
  summary: string;
  variationsGreen: number;
  variationsRed: number;
  nearMisses: number;
  anchorsCorrect: number;
  anchorsTotal: number;
  /** Taxa geral de acerto (picks corretos / total de picks nas 5 variações). */
  overallPickAccuracy: number;
  /** Âncoras que falharam — cada uma com alertas pré-gerados pelo motor. */
  failedAnchors: AnchorPostMortem[];
  /** Variações que falharam por exatamente 1 perna — quase-acertos. */
  nearMissDetails: VariationPostMortem[];
  /** Detalhamento completo de todas as 5 variações. */
  variationDetails: VariationPostMortem[];
  /**
   * Versão do algoritmo que gerou as variações simuladas.
   * Crítico para rastreabilidade no banco: cada Reflexão referencia a versão
   * que a gerou, permitindo filtrar no backtesting histórico.
   */
  algorithmVersion: string;
  /**
   * Fragmento de prompt pré-montado no estilo operacional do PRD §10.
   * A LLM recebe este texto como contexto para gerar o texto da Reflexão.
   * Construído automaticamente pelo simulador com base nos dados do Pós-Mortem.
   *
   * Formato:
   * "Analise os seguintes dados pós-mortem da Rodada N/AAAA e gere uma Reflexão..."
   */
  diagnosticPrompt: string;
};

/**
 * Relatório completo de uma simulação cega de uma rodada passada.
 * Ponto de integração entre:
 *   — Motor Fase 2 (variações geradas cegamente)
 *   — Resultados reais (football-data.org)
 *   — Payload LLM (Passo 2 da Fase 3)
 */
export type SimulationReport = {
  round: number;
  season: number;
  /** Variações geradas pelo motor sem acesso aos resultados. */
  blindVariations: VariationsResult;
  /** Âncoras selecionadas pelo algoritmo PRD §6. */
  anchors: AnchorSelectionResult;
  /**
   * Resultados reais dos jogos da rodada (desmascarados após a geração).
   * Contém apenas jogos com status FINISHED.
   * matchId coincide com MatchInput.id para cruzamento direto.
   */
  matchActualResults: MatchActualResult[];
  /** Análise cruzada: previsão × realidade. */
  postMortem: {
    variations: VariationPostMortem[];
    anchors: AnchorPostMortem[];
    summary: {
      variationsGreen: number;
      variationsRed: number;
      /** Variações que perderam por exatamente 1 pick incorreto. */
      nearMisses: number;
      anchorsCorrect: number;
      anchorsTotal: number;
      /**
       * Acurácia geral: (picks corretos) / (total picks) nas 5 variações.
       * Calculada sobre picks donde o resultado real é conhecido.
       */
      overallPickAccuracy: number;
    };
  };
  /** Payload pronto para envio ao Passo 2 (LLM → Reflexão). */
  llmPayload: PostMortemLLMPayload;
  meta: {
    simulatedAt: string;
    /** Sempre "beam-search-v1" para rastreabilidade de versão no banco. */
    algorithmVersion: "beam-search-v1";
    /**
     * "full"    = todos os jogos da rodada têm resultado conhecido.
     * "partial" = alguns jogos ainda sem resultado (rodada não encerrada).
     */
    dataQuality: "full" | "partial";
    matchesWithResults: number;
    matchesWithoutResults: number;
    /**
     * Avisos operacionais:
     *   - leakage em forma/posição (documentado)
     *   - jogos sem odds válidas
     *   - motor em fallback (menos de 4 âncoras primárias)
     *   - rodada ainda não encerrada (resultado parcial)
     */
    warnings: string[];
  };
};

// ─── Mapeamento de Winner API → ActualOutcome ─────────────────────────────────

/**
 * football-data.org FDMatch.score.winner retorna:
 *   "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null (não encerrado)
 */
function parseActualOutcome(match: FDMatch): ActualOutcome | null {
  const winner = match.score.winner;
  if (winner === "HOME_TEAM") return "Home";
  if (winner === "AWAY_TEAM") return "Away";
  if (winner === "DRAW")      return "Draw";
  // Fallback: inferir do placar quando score.winner está null mas status=FINISHED
  if (match.status === "FINISHED") {
    const h = match.score.fullTime.home;
    const a = match.score.fullTime.away;
    if (h !== null && a !== null) {
      if (h > a) return "Home";
      if (h < a) return "Away";
      return "Draw";
    }
  }
  return null; // jogo não encerrado ou cancelado
}

// ─── Extração de Resultados Reais ─────────────────────────────────────────────

/**
 * Busca os resultados reais dos jogos de uma rodada passada via Data Gateway.
 *
 * Retorna apenas jogos com resultado conhecido (FINISHED).
 * `matchId` == `FDMatch.id.toString()` == `MatchInput.id` — chave de cruzamento.
 */
async function fetchActualResults(
  round: number
): Promise<{ results: MatchActualResult[]; warnings: string[] }> {
  const warnings: string[] = [];

  let matches: FDMatch[];
  try {
    const response = await getGatewayMatchesByMatchday(round);
    if (!response) {
      warnings.push(`Sinal interrompido: sem resultados reais cacheados para a Rodada ${round}.`);
      return { results: [], warnings };
    }
    matches = response.matches;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(
      `Sinal interrompido: falha ao buscar resultados reais da Rodada ${round}. ` +
        `Pós-Mortem comprometido. Motivo: ${msg}`
    );
    return { results: [], warnings };
  }

  const results: MatchActualResult[] = [];

  for (const m of matches) {
    const outcome = parseActualOutcome(m);
    if (outcome === null) continue; // jogo não encerrado

    const homeTeam = m.homeTeam.shortName || m.homeTeam.name;
    const awayTeam = m.awayTeam.shortName || m.awayTeam.name;

    results.push({
      matchId:   m.id.toString(),
      match:     `${homeTeam} x ${awayTeam}`,
      homeTeam,
      awayTeam,
      outcome,
      homeScore: m.score.fullTime.home ?? 0,
      awayScore: m.score.fullTime.away ?? 0,
    });
  }

  return { results, warnings };
}

// ─── Pós-Mortem: Cruzamento Pick × Resultado Real ────────────────────────────

/**
 * Constrói o Pós-Mortem das 5 variações cruzando cada pick com o resultado real.
 *
 * Picks de jogos sem resultado (ex: postponed, não encerrado) são marcados
 * como `correct = false` com nota de aviso — conservador e transparente.
 */
function buildVariationPostMortems(
  variations: VariationsResult,
  actualMap: Map<string, ActualOutcome>
): VariationPostMortem[] {
  return variations.variations.map((v) => {
    const picks: PickPostMortem[] = v.legs.map((leg) => {
      const actual = actualMap.get(leg.matchId);
      const correct = actual !== undefined && actual === leg.pickOutcome;
      return {
        matchId:   leg.matchId,
        match:     leg.match,
        predicted: leg.pickOutcome,
        actual:    actual ?? "Home", // fallback para tipagem (não deve ocorrer)
        correct:   actual !== undefined ? correct : false,
        pickOdd:   leg.pickOdd,
        cleanProb: leg.cleanProb,
        isAnchor:  leg.isAnchor,
      };
    });

    const correctCount = picks.filter((p) => p.correct).length;
    const missed       = picks.filter((p) => !p.correct);
    const isGreen      = correctCount === picks.length && picks.length > 0;
    const nearMiss     = !isGreen && missed.length === 1;

    return {
      variationId:   v.id,
      status:        isGreen ? "Green" : "Red",
      totalPicks:    picks.length,
      correctPicks:  correctCount,
      nearMiss,
      projectedOdd:  v.combinedOdd,
      picks,
      missedPicks:   missed,
    };
  });
}

/**
 * Constrói o Pós-Mortem das 4 âncoras.
 *
 * Para cada âncora, verifica se o pick gerado pelo motor (suggestedResult
 * de scoring.ts, representado na perna da variação V1) acertou o resultado.
 *
 * Âncoras falhadas são o insumo mais valioso para a Reflexão da LLM.
 */
function buildAnchorPostMortems(
  anchorResult: AnchorSelectionResult,
  actualMap: Map<string, ActualOutcome>,
  variationPostMortems: VariationPostMortem[]
): AnchorPostMortem[] {
  return anchorResult.anchors.map((anchor) => {
    // O pick da âncora é o que aparece na V1 (variação com todos picks primários)
    const v1 = variationPostMortems.find((v) => v.variationId === "V1");
    const anchorPickInV1 = v1?.picks.find((p) => p.matchId === anchor.id);

    const predictedOutcome: PickOutcome = anchorPickInV1?.predicted ?? "Home";
    const actualOutcome    = actualMap.get(anchor.id);
    const correct          = actualOutcome !== undefined && actualOutcome === predictedOutcome;

    return {
      matchId:                  anchor.id,
      match:                    anchor.match,
      anchorRank:               anchor.anchorRank,
      anchorScore:              anchor.anchorScore,
      bobScore:                 anchor.score,
      predictedOutcome,
      actualOutcome:            actualOutcome ?? "Home", // fallback para tipagem
      correct:                  actualOutcome !== undefined ? correct : false,
      homeOdd:                  anchor.homeOdd,
      preGameCalibrationAlerts: anchor.calibrationAlerts,
    };
  });
}

// ─── Construção do Payload LLM (Reflexão) ─────────────────────────────────────

/**
 * Constrói o `diagnosticPrompt` no estilo operacional do PRD §10.
 *
 * PRD §10: "Fale em processos e probabilidade, nunca em certezas."
 * PRD §10: "Se os dados de xG conflitam com a escalação, reduza o nível de
 *           confiança explicitamente."
 * PRD §4:  "Explicação & Evolução: justificativa da escolha gerada para o
 *           front-end e log salvo para autoavaliação futura."
 */
function buildDiagnosticPrompt(
  round: number,
  season: number,
  anchors: AnchorPostMortem[],
  varPMs: VariationPostMortem[]
): string {
  const green = varPMs.filter((v) => v.status === "Green").length;
  const red   = varPMs.filter((v) => v.status === "Red").length;
  const failedAnchors = anchors.filter((a) => !a.correct);
  const nearMissVars  = varPMs.filter((v) => v.nearMiss);

  const lines: string[] = [
    `Você é o BOB — Orquestrador Cognitivo (PRD §2). Analise os dados de Pós-Mortem`,
    `da Rodada ${round}/${season} e gere uma Reflexão estruturada.`,
    ``,
    `REGRAS DA REFLEXÃO (PRD §10):`,
    `  1. Fale em processos e probabilidade, nunca em certezas.`,
    `  2. Justifique cada conclusão com dados presentes neste relatório.`,
    `  3. Não use "talvez" ou "eu acho". Use: "A rota calculada se apoia em...".`,
    `  4. Se um padrão de erro se repete, nomeie-o como Padrão de Falha.`,
    `  5. Proponha ajustes numéricos específicos nos pesos da fórmula (a, b, c, d, e),`,
    `     se os dados justificarem.`,
    `  6. O texto deve ser salvo na Memória de Padrões — seja preciso e conciso.`,
    ``,
    `RESULTADO DA RODADA:`,
    `  Variações Green: ${green}/5 | Red: ${red}/5`,
    `  Quase-acertos (1 perna falhada): ${nearMissVars.length}`,
    ``,
    `ÂNCORAS FALHADAS (${failedAnchors.length}/${anchors.length}):`,
  ];

  for (const a of failedAnchors) {
    lines.push(
      `  [Âncora #${a.anchorRank}] ${a.match}`,
      `    BOB Score: ${a.bobScore}/100 | AnchorScore: ${a.anchorScore.toFixed(4)}`,
      `    Previsto: ${a.predictedOutcome} (odd ${a.homeOdd.toFixed(2)}) | Real: ${a.actualOutcome}`,
    );
    if (a.preGameCalibrationAlerts.length > 0) {
      lines.push(`    Alertas pré-jogo gerados pelo motor:`);
      a.preGameCalibrationAlerts.forEach((alert) =>
        lines.push(`      • ${alert}`)
      );
    }
  }

  if (nearMissVars.length > 0) {
    lines.push(``, `QUASE-ACERTOS — pernas únicas que causaram o Red:`);
    for (const v of nearMissVars) {
      const missed = v.missedPicks[0];
      if (!missed) continue;
      lines.push(
        `  [${v.variationId}] Faltou: "${missed.match}" → ` +
          `previsto ${missed.predicted}, real ${missed.actual} | odd ${missed.pickOdd.toFixed(2)}`
      );
    }
  }

  lines.push(
    ``,
    `TAREFA: Gere a Reflexão em JSON com os campos:`,
    `  { "patternKey": string, "condition": string, "factors": string[],`,
    `    "recommendation": string, "weightAdjustments": {a?,b?,c?,d?,e?},`,
    `    "severity": "low"|"medium"|"high", "language": "pt-br" }`,
    ``,
    `A Reflexão será gravada append-only na tabela conditional_patterns (PRD §13 Critério 3).`,
    `Nunca sugira deletar ou sobrescrever registros existentes.`,
  );

  return lines.join("\n");
}

/**
 * Monta o payload completo para a LLM, síntese do Pós-Mortem.
 */
function buildLLMPayload(
  round: number,
  season: number,
  varPMs: VariationPostMortem[],
  anchorPMs: AnchorPostMortem[],
  algorithmVersion: string
): PostMortemLLMPayload {
  const green         = varPMs.filter((v) => v.status === "Green").length;
  const red           = varPMs.filter((v) => v.status === "Red").length;
  const nearMissCount = varPMs.filter((v) => v.nearMiss).length;
  const anchorCorrect = anchorPMs.filter((a) => a.correct).length;
  const anchorTotal   = anchorPMs.length;

  // Acurácia geral: soma todos os picks de todas as variações
  const allPicks = varPMs.flatMap((v) => v.picks);
  const correctTotal = allPicks.filter((p) => p.correct).length;
  const overallAccuracy = allPicks.length > 0 ? correctTotal / allPicks.length : 0;

  const summary =
    `Rodada ${round}/${season}: ${green} Green, ${red} Red de 5 variações. ` +
    `${nearMissCount} quase-acerto(s). ` +
    `Âncoras: ${anchorCorrect}/${anchorTotal} corretas. ` +
    `Acurácia geral: ${(overallAccuracy * 100).toFixed(1)}%.`;

  return {
    round,
    season,
    summary,
    variationsGreen:     green,
    variationsRed:       red,
    nearMisses:          nearMissCount,
    anchorsCorrect:      anchorCorrect,
    anchorsTotal:        anchorTotal,
    overallPickAccuracy: overallAccuracy,
    failedAnchors:       anchorPMs.filter((a) => !a.correct),
    nearMissDetails:     varPMs.filter((v) => v.nearMiss),
    variationDetails:    varPMs,
    algorithmVersion,
    diagnosticPrompt:    buildDiagnosticPrompt(round, season, anchorPMs, varPMs),
  };
}

// ─── Função Pública Principal ─────────────────────────────────────────────────

/**
 * Executa a simulação cega de uma rodada passada.
 *
 * Pipeline:
 *   1. [PARALELO] Busca dados pré-jogo E resultados reais pelo Data Gateway.
 *   2. Executa o motor Fase 2 com os dados pré-jogo (cego por design do MatchInput).
 *   3. Cruza variações geradas × resultados reais → Pós-Mortem.
 *   4. Monta PostMortemLLMPayload (pronto para Passo 2: LLM Reflexão).
 *   5. Retorna SimulationReport completo.
 *
 * @param season  — Ano da temporada (ex: 2026)
 * @param round   — Número da rodada (1–38 no Brasileirão)
 * @param options — Configuração opcional do motor (pesos, targetOdd, beamWidth)
 * @returns       — SimulationReport com variações cegas, pós-mortem e payload LLM
 */
export async function simulateRound(
  season: number,
  round: number,
  options?: {
    targetOdd?: number;
    beamWidth?: number;
    devigMethod?: "simple" | "power";
    anchorWeights?: AnchorFormulaWeights;
  }
): Promise<SimulationReport> {
  const warnings: string[] = [];

  // ── Passo 1: Busca paralela — dados pré-jogo + resultados reais ────────────
  //
  // As duas fontes são INDEPENDENTES: não há dependência de dados entre elas.
  // getGatewayRoundDataset: lê standings, forma, odds, clima → MatchInput[]
  // fetchActualResults:     lê placares finais → MatchActualResult[]
  const [roundData, actualFetch] = await Promise.all([
    getGatewayRoundDataset(season, round).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(
        `Sinal interrompido: falha ao buscar dados pré-jogo da Rodada ${round}/${season}. ` +
          `Simulação abortada. Motivo: ${msg}`
      );
      return null;
    }),
    fetchActualResults(round),
  ]);

  // Acumular warnings de ambas as fontes
  warnings.push(...actualFetch.warnings);

  // Abortar se os dados pré-jogo não chegaram
  if (roundData === null || roundData.matches.length === 0) {
    warnings.push(
      `Motor incapaz de simular a Rodada ${round}/${season}: ` +
        `nenhum jogo disponível em MatchInput.`
    );
    // Retornar relatório vazio mas tipado — não lançar exceção
    const emptyAnchors: AnchorSelectionResult = {
      anchors: [],
      allRanked: [],
      meta: {
        round,
        totalMatches: 0,
        anchorCount: 0,
        selectionMode: "fallback",
        formulaWeights: options?.anchorWeights ?? ({} as AnchorFormulaWeights),
        generatedAt: new Date().toISOString(),
      },
    };
    const emptyVariations: VariationsResult = {
      variations: [],
      meta: {
        round,
        targetOdd:           options?.targetOdd ?? 1000,
        logTargetOdd:        Math.log(options?.targetOdd ?? 1000),
        beamWidth:           options?.beamWidth ?? 60,
        anchorIds:           [],
        anchorSelectionMode: "fallback",
        algorithmVersion:    "beam-search-v1",
        generatedAt:         new Date().toISOString(),
        warnings:            ["Motor abortado: sem dados de entrada."],
      },
    };
    return {
      round,
      season,
      blindVariations:    emptyVariations,
      anchors:            emptyAnchors,
      matchActualResults: actualFetch.results,
      postMortem: {
        variations: [],
        anchors:    [],
        summary: {
          variationsGreen: 0, variationsRed: 0, nearMisses: 0,
          anchorsCorrect: 0, anchorsTotal: 0, overallPickAccuracy: 0,
        },
      },
      llmPayload: buildLLMPayload(round, season, [], [], "beam-search-v1"),
      meta: {
        simulatedAt:            new Date().toISOString(),
        algorithmVersion:       "beam-search-v1",
        dataQuality:            "partial",
        matchesWithResults:     actualFetch.results.length,
        matchesWithoutResults:  0,
        warnings,
      },
    };
  }

  const { matches: matchInputs } = roundData;

  // ── Aviso de Leakage (documentado — PRD §7 Limitação Fase 3) ──────────────
  warnings.push(
    `[Leakage documentado] Forma (F2) e classificação (F1) calculados com dados ` +
      `atuais — para rodadas recentes podem incluir jogos posteriores à rodada ${round}. ` +
      `Impacto: leve. A "cegueira" do motor refere-se à ausência de placares no MatchInput, ` +
      `não às métricas de contexto. Solução definitiva: snapshots históricos (Fase 5).`
  );

  // ── Passo 2: Motor cego — engine Fase 2 (sem acesso a resultados) ──────────
  //
  // MatchInput NÃO tem campo de resultado: o motor é estruturalmente cego.
  // O único "masking" necessário é não passar os resultados reais para cá.
  const anchorResult = selectAnchorsV2(
    matchInputs,
    round,
    options?.anchorWeights,
    options?.devigMethod
  );

  if (anchorResult.meta.selectionMode === "fallback") {
    warnings.push(
      `Motor em modo fallback para Rodada ${round}/${season}: ` +
        `menos de 2 âncoras passaram nos critérios primários. ` +
        `Qualidade da simulação reduzida — âncoras com critérios relaxados.`
    );
  }

  const blindVariations = generateVariations(anchorResult, matchInputs, {
    targetOdd:   options?.targetOdd,
    beamWidth:   options?.beamWidth,
    devigMethod: options?.devigMethod,
  });

  // Acumular warnings do beam-search
  warnings.push(...blindVariations.meta.warnings);

  // ── Passo 3: "Tirar a venda" — cruzamento com resultados reais ────────────
  //
  // Construir mapa matchId → ActualOutcome para O(1) lookup no Pós-Mortem.
  const actualMap = new Map<string, ActualOutcome>(
    actualFetch.results.map((r) => [r.matchId, r.outcome])
  );

  // Quantos jogos da rodada têm resultado real disponível?
  const matchIdsInEngine = new Set(matchInputs.map((m) => m.id));
  const matchesWithResults    = actualFetch.results.filter((r) =>
    matchIdsInEngine.has(r.matchId)
  ).length;
  const matchesWithoutResults = matchInputs.length - matchesWithResults;

  if (matchesWithoutResults > 0) {
    warnings.push(
      `${matchesWithoutResults} de ${matchInputs.length} jogos da rodada ${round} ` +
        `ainda não têm resultado disponível. ` +
        `Picks sem resultado são contados como Red (conservador). ` +
        `Re-executar após encerramento da rodada para relatório definitivo.`
    );
  }

  // ── Passo 4: Pós-Mortem das variações e âncoras ───────────────────────────
  const variationPMs = buildVariationPostMortems(blindVariations, actualMap);
  const anchorPMs    = buildAnchorPostMortems(anchorResult, actualMap, variationPMs);

  // ── Passo 5: Calcular sumário ──────────────────────────────────────────────
  const green        = variationPMs.filter((v) => v.status === "Green").length;
  const red          = variationPMs.filter((v) => v.status === "Red").length;
  const nearMisses   = variationPMs.filter((v) => v.nearMiss).length;
  const anchorOk     = anchorPMs.filter((a) => a.correct).length;
  const allPicks     = variationPMs.flatMap((v) => v.picks);
  const correctTotal = allPicks.filter((p) => p.correct).length;
  const overallAcc   = allPicks.length > 0 ? correctTotal / allPicks.length : 0;

  // ── Passo 6: Montar PostMortemLLMPayload ──────────────────────────────────
  const llmPayload = buildLLMPayload(
    round, season, variationPMs, anchorPMs, blindVariations.meta.algorithmVersion
  );

  const dataQuality: "full" | "partial" =
    matchesWithoutResults === 0 ? "full" : "partial";

  return {
    round,
    season,
    blindVariations,
    anchors:            anchorResult,
    matchActualResults: actualFetch.results,
    postMortem: {
      variations: variationPMs,
      anchors:    anchorPMs,
      summary: {
        variationsGreen:     green,
        variationsRed:       red,
        nearMisses,
        anchorsCorrect:      anchorOk,
        anchorsTotal:        anchorPMs.length,
        overallPickAccuracy: overallAcc,
      },
    },
    llmPayload,
    meta: {
      simulatedAt:           new Date().toISOString(),
      algorithmVersion:      "beam-search-v1",
      dataQuality,
      matchesWithResults,
      matchesWithoutResults,
      warnings,
    },
  };
}

// ─── Utilidade Pública ────────────────────────────────────────────────────────

/**
 * Formata o SimulationReport em texto legível para observabilidade.
 * Usado pelo BOB Live Brain Console (Fase 4) e pelos logs de Reflexão.
 *
 * PRD §10: "Fale em processos e probabilidade, nunca em certezas."
 */
export function formatSimulationReport(report: SimulationReport): string {
  const { postMortem: pm, meta } = report;
  const { summary: s } = pm;

  const lines: string[] = [
    `╔══════════════════════════════════════════════════════════╗`,
    `  BOB Blind Replay — Rodada ${report.round}/${report.season}`,
    `╚══════════════════════════════════════════════════════════╝`,
    ``,
    `SUMÁRIO:`,
    `  Variações: ${s.variationsGreen} Green | ${s.variationsRed} Red  ` +
      `| Quase-acertos: ${s.nearMisses}`,
    `  Âncoras corretas: ${s.anchorsCorrect}/${s.anchorsTotal}`,
    `  Acurácia geral (picks): ${(s.overallPickAccuracy * 100).toFixed(1)}%`,
    `  Qualidade dos dados: ${meta.dataQuality} ` +
      `(${meta.matchesWithResults} de ${meta.matchesWithResults + meta.matchesWithoutResults} jogos com resultado)`,
    ``,
    `VARIAÇÕES:`,
  ];

  for (const v of pm.variations) {
    const missInfo = v.nearMiss
      ? ` (quase-acerto: "${v.missedPicks[0]?.match ?? "?"}")`
      : "";
    lines.push(
      `  ${v.variationId}: ${v.status.padEnd(5)} — ` +
        `${v.correctPicks}/${v.totalPicks} picks corretos | ` +
        `odd projetada ${v.projectedOdd.toFixed(0)}${missInfo}`
    );
  }

  lines.push(``, `ÂNCORAS:`);
  for (const a of pm.anchors) {
    const status = a.correct ? "✓" : "✗";
    lines.push(
      `  ${status} [#${a.anchorRank}] ${a.match.padEnd(32)} ` +
        `→ previsto ${a.predictedOutcome} | real ${a.actualOutcome}`
    );
  }

  if (meta.warnings.length > 0) {
    lines.push(``, `AVISOS OPERACIONAIS:`);
    meta.warnings.forEach((w) => lines.push(`  • ${w.slice(0, 120)}`));
  }

  lines.push(
    ``,
    `simulatedAt: ${report.meta.simulatedAt} | algorithm: ${report.meta.algorithmVersion}`
  );

  return lines.join("\n");
}
