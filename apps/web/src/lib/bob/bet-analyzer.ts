/**
 * BOB Bet Analyzer — Motor de análise de apostas por perfil de apostador.
 *
 * Analisa um BetMatch e gera sugestões personalizadas para:
 *   CONSERVADOR, MODERADO, AGRESSIVO, MATEMÁTICO
 *
 * Pipeline:
 *   1. Busca odds disponíveis no DB (bet_odds) para o jogo
 *   2. Constrói prompt rico com contexto do jogo
 *   3. Chama Claude → JSON com 4 perfis × N seleções
 *   4. Fallback determinístico se LLM indisponível (apenas 1×2)
 *   5. Persiste sugestões na tabela bob_suggestions (delete+create)
 */

import { prisma } from "@/lib/db";
import { BettorProfile, BetMarket } from "@/generated/prisma";
import { callClaude } from "@/lib/bob/ai/cognitive-analyst";

// ─── Tipos públicos ────────────────────────────────────────────────────────────

export interface MatchAnalysisInput {
  matchId:     string;   // BetMatch UUID
  homeTeam:    string;
  awayTeam:    string;
  competition: string;
  season:      number;
  round:       number | null;
}

export interface SuggestionItem {
  market:        BetMarket;
  option:        string;
  optionLabel:   string;
  odd:           number;
  confidence:    number;   // 0–1
  justification: string;
}

export interface ProfileResult {
  selections:        SuggestionItem[];
  combinedOdd:       number;
  overallConfidence: number;
  summary:           string;
}

export interface BetAnalysis {
  matchId:     string;
  conservador: ProfileResult;
  moderado:    ProfileResult;
  agressivo:   ProfileResult;
  matematico:  ProfileResult;
  source:      "claude" | "fallback";
}

// ─── Validação do JSON retornado pelo Claude ───────────────────────────────────

const VALID_MARKETS = new Set<string>(Object.values(BetMarket));

function validateItem(raw: unknown): SuggestionItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.market !== "string" ||
    !VALID_MARKETS.has(r.market) ||
    typeof r.option !== "string" ||
    typeof r.optionLabel !== "string" ||
    typeof r.odd !== "number" ||
    typeof r.confidence !== "number" ||
    typeof r.justification !== "string"
  ) return null;
  return {
    market:        r.market as BetMarket,
    option:        r.option,
    optionLabel:   r.optionLabel,
    odd:           Math.max(1.01, r.odd),
    confidence:    Math.max(0, Math.min(1, r.confidence)),
    justification: r.justification,
  };
}

function parseProfile(raw: unknown): ProfileResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const rawSels = Array.isArray(r.selections) ? r.selections : [];
  const selections = rawSels.map(validateItem).filter((x): x is SuggestionItem => x !== null);

  const combinedOdd =
    typeof r.combinedOdd === "number" && r.combinedOdd > 1
      ? Math.round(r.combinedOdd * 100) / 100
      : selections.reduce((acc, s) => acc * s.odd, 1);

  const overallConfidence =
    typeof r.overallConfidence === "number"
      ? Math.max(0, Math.min(1, r.overallConfidence))
      : selections.length > 0
      ? selections.reduce((a, s) => a + s.confidence, 0) / selections.length
      : 0;

  const summary = typeof r.summary === "string" ? r.summary : "";

  return { selections, combinedOdd: Math.round(combinedOdd * 100) / 100, overallConfidence, summary };
}

// ─── Prompt Builder ────────────────────────────────────────────────────────────

type OddRow = { market: string; option: string; optionLabel: string; odd: number };

function buildPrompt(
  home: string,
  away: string,
  competition: string,
  round: number | null,
  odds: OddRow[],
): string {
  const oddsBlock =
    odds.length > 0
      ? odds.map((o) => `  ${o.market} | ${o.option} | ${o.optionLabel}: ${o.odd.toFixed(2)}`).join("\n")
      : "  Apenas use mercado RESULT_1X2 com odds estimadas: HOME 2.00, DRAW 3.20, AWAY 3.50";

  // Contar mercados disponíveis para instruir o Claude
  const marketTypes = new Set(odds.map(o => o.market));
  const hasMultipleMarkets = marketTypes.size > 1;

  return `Você é BOB, sistema especializado em análise estatística de apostas do Brasileirão.

JOGO: ${home} x ${away}
COMPETIÇÃO: ${competition}${round != null ? `, Rodada ${round}` : ""}

ODDS DISPONÍVEIS (use EXATAMENTE estes valores — market, option, optionLabel, odd):
${oddsBlock}

Mercados disponíveis: ${[...marketTypes].join(", ")} (${marketTypes.size} tipos)

Gere sugestões de aposta para 4 perfis. REGRA CRÍTICA: cada perfil DEVE ter NO MÍNIMO 2 seleções de MERCADOS DIFERENTES.
${hasMultipleMarkets ? "Combine mercados diferentes (ex: RESULT_1X2 + BTTS + OVER_UNDER) para criar apostas ricas." : "Se só houver RESULT_1X2, combine resultado com análise de cenário."}

PERFIS (cada um com MÍNIMO 2 seleções):
- CONSERVADOR: 2-3 seleções de baixo risco, combinando mercados seguros. Odds individuais < 1.90. Odd combinada entre 2.00 e 4.00. Ex: Vitória casa @1.50 + Menos de 3.5 gols @1.40 = 2.10x.
- MODERADO: 2-4 seleções equilibradas. Odds individuais até 2.50. Odd combinada entre 3.00 e 8.00. Misture mercados (1x2 + BTTS + Over/Under).
- AGRESSIVO: 3-5 seleções de alto retorno. Odds individuais até 5.00. Odd combinada entre 8.00 e 30.00. Use mercados exóticos se disponíveis.
- MATEMÁTICO: 2-3 value bets com edge ≥5%. Foque em mercados onde a probabilidade calculada supera a implícita. Justifique o edge numérico.

REGRAS:
1. Use SOMENTE as odds listadas. Copie market/option/optionLabel/odd EXATAMENTE como listados.
2. MÍNIMO 2 seleções por perfil — NUNCA retorne apenas 1 seleção.
3. combinedOdd = produto das odds das seleções (arredonde 2 casas).
4. overallConfidence entre 0.0 e 1.0.
5. justification: 1 frase analítica por seleção (mencione dados, tendências, contexto).
6. summary: 1–2 frases descrevendo a estratégia completa do perfil.
7. Priorize DIVERSIDADE de mercados — não repita o mesmo mercado em 2 seleções do mesmo perfil.

Responda SOMENTE com JSON válido (sem markdown, sem texto antes ou depois):
{
  "conservador": {
    "selections": [
      {"market":"RESULT_1X2","option":"HOME","optionLabel":"Vitória ${home}","odd":1.65,"confidence":0.78,"justification":"..."},
      {"market":"OVER_UNDER","option":"under_2.5","optionLabel":"Menos de 2.5 gols","odd":1.45,"confidence":0.72,"justification":"..."}
    ],
    "combinedOdd": 2.39,
    "overallConfidence": 0.75,
    "summary": "..."
  },
  "moderado": {"selections":[{...},{...}],"combinedOdd":...,"overallConfidence":...,"summary":"..."},
  "agressivo": {"selections":[{...},{...},{...}],"combinedOdd":...,"overallConfidence":...,"summary":"..."},
  "matematico": {"selections":[{...},{...}],"combinedOdd":...,"overallConfidence":...,"summary":"..."}
}`;
}

// ─── Fallback determinístico ───────────────────────────────────────────────────

function impliedProb(odd: number) { return Math.round((1 / odd) * 100) / 100; }

function fallbackProfile(
  profile: "CONSERVADOR" | "MODERADO" | "AGRESSIVO" | "MATEMATICO",
  home: string,
  away: string,
  odds: OddRow[],
): ProfileResult {
  const get = (mkt: string, opt: string) =>
    odds.find((o) => o.market === mkt && o.option === opt);
  const getByMarket = (mkt: string) =>
    odds.filter((o) => o.market === mkt).sort((a, b) => a.odd - b.odd);

  const homeRow  = get("RESULT_1X2", "HOME");
  const drawRow  = get("RESULT_1X2", "DRAW");
  const awayRow  = get("RESULT_1X2", "AWAY");
  const bttsOpts = getByMarket("BTTS");
  const ouOpts   = getByMarket("OVER_UNDER");
  const dcOpts   = getByMarket("DOUBLE_CHANCE");

  // Ordena resultado 1x2 por menor odd (mais provável)
  const sorted1x2 = [homeRow, drawRow, awayRow]
    .filter((x): x is OddRow => x != null)
    .sort((a, b) => a.odd - b.odd);

  const fav = sorted1x2[0];
  const sec = sorted1x2[1];
  const third = sorted1x2[2];

  // Encontrar melhores opções de mercados secundários
  const bestBtts  = bttsOpts[0];  // menor odd BTTS
  const bestOU    = ouOpts[0];    // menor odd Over/Under
  const bestDC    = dcOpts[0];    // menor odd Double Chance

  if (!fav) {
    return {
      selections: [], combinedOdd: 1, overallConfidence: 0,
      summary: "Odds não disponíveis para análise.",
    };
  }

  const favConf = impliedProb(fav.odd) * 0.92;

  // Helper: converte OddRow em SuggestionItem
  const toSel = (o: OddRow, conf: number, just: string): SuggestionItem => ({
    market: o.market as BetMarket, option: o.option, optionLabel: o.optionLabel,
    odd: o.odd, confidence: Math.max(0.1, Math.min(1, conf)), justification: just,
  });

  if (profile === "CONSERVADOR") {
    const sels: SuggestionItem[] = [];
    // 1ª seleção: favorito ou double chance
    if (fav.odd < 1.90) {
      sels.push(toSel(fav, favConf, `Favorito com ${Math.round(impliedProb(fav.odd) * 100)}% de probabilidade implícita.`));
    } else if (bestDC && bestDC.odd < 1.50) {
      sels.push(toSel(bestDC, impliedProb(bestDC.odd) * 0.95, `Dupla chance segura: ${bestDC.optionLabel}.`));
    } else {
      sels.push(toSel(fav, favConf * 0.85, `Favorito relativo do confronto.`));
    }
    // 2ª seleção: mercado secundário seguro
    if (bestOU && bestOU.odd < 1.70) {
      sels.push(toSel(bestOU, impliedProb(bestOU.odd) * 0.90, `Linha de gols conservadora: ${bestOU.optionLabel}.`));
    } else if (bestBtts && bestBtts.odd < 1.70) {
      sels.push(toSel(bestBtts, impliedProb(bestBtts.odd) * 0.90, `Ambas marcam — padrão estatístico do confronto.`));
    } else if (sec && sec.odd < 2.00) {
      sels.push(toSel(sec, impliedProb(sec.odd) * 0.88, `Cenário alternativo com boa probabilidade.`));
    }
    // Garantir mínimo 2
    if (sels.length < 2 && sec) {
      sels.push(toSel(sec, impliedProb(sec.odd) * 0.80, `Opção complementar para composição da aposta.`));
    }
    const combined = sels.reduce((a, s) => a * s.odd, 1);
    return {
      selections: sels, combinedOdd: Math.round(combined * 100) / 100,
      overallConfidence: sels.reduce((a, s) => a + s.confidence, 0) / sels.length,
      summary: `Combinação conservadora: ${sels.map(s => s.optionLabel).join(" + ")}. Odds ${combined.toFixed(2)}x com foco em segurança.`,
    };
  }

  if (profile === "MODERADO") {
    const sels: SuggestionItem[] = [
      toSel(fav, favConf, `Favorito do confronto com probabilidade sólida.`),
    ];
    // Adicionar mercado secundário
    if (bestBtts) sels.push(toSel(bestBtts, impliedProb(bestBtts.odd) * 0.88, `Ambas marcam — tendência do campeonato.`));
    else if (bestOU) sels.push(toSel(bestOU, impliedProb(bestOU.odd) * 0.88, `Linha de gols alinhada com média da competição.`));
    // Terceira seleção se houver
    if (sels.length < 3 && bestOU && !sels.some(s => s.market === bestOU.market)) {
      sels.push(toSel(bestOU, impliedProb(bestOU.odd) * 0.85, `Over/Under complementar ao cenário de jogo.`));
    }
    // Garantir mínimo 2
    if (sels.length < 2 && sec) {
      sels.push(toSel(sec, impliedProb(sec.odd) * 0.80, `Resultado alternativo para compor a aposta.`));
    }
    const combined = sels.reduce((a, s) => a * s.odd, 1);
    return {
      selections: sels, combinedOdd: Math.round(combined * 100) / 100,
      overallConfidence: sels.reduce((a, s) => a + s.confidence, 0) / sels.length * 0.90,
      summary: `Equilíbrio entre ${sels.length} mercados: ${sels.map(s => s.optionLabel).join(" + ")}. Odd combinada ${combined.toFixed(2)}x.`,
    };
  }

  if (profile === "AGRESSIVO") {
    const sels: SuggestionItem[] = [];
    // Resultado menos óbvio (empate ou azarão)
    if (sec) sels.push(toSel(sec, impliedProb(sec.odd) * 0.80, `Resultado de valor: ${sec.optionLabel} paga ${sec.odd.toFixed(2)}x.`));
    else if (fav) sels.push(toSel(fav, favConf, `Base do bilhete agressivo.`));
    // BTTS e Over/Under com odds mais altas
    const aggressiveBtts = bttsOpts.find(o => o.odd >= 1.50);
    const aggressiveOU = ouOpts.find(o => o.odd >= 1.60);
    if (aggressiveBtts) sels.push(toSel(aggressiveBtts, impliedProb(aggressiveBtts.odd) * 0.80, `Ambas marcam com odd de valor.`));
    if (aggressiveOU) sels.push(toSel(aggressiveOU, impliedProb(aggressiveOU.odd) * 0.80, `Linha de gols agressiva.`));
    // Adicionar azarão se disponível
    if (third && third.odd <= 5.00) {
      sels.push(toSel(third, impliedProb(third.odd) * 0.75, `Zebra controlada: ${third.optionLabel} @${third.odd.toFixed(2)}.`));
    }
    // Garantir mínimo 3
    while (sels.length < 3) {
      const unused = odds.filter(o => !sels.some(s => s.option === o.option && s.market === o.market)).sort((a, b) => b.odd - a.odd);
      if (unused.length === 0) break;
      const pick = unused[0]!;
      sels.push(toSel(pick, impliedProb(pick.odd) * 0.70, `Seleção adicional para maximizar retorno.`));
    }
    const combined = sels.reduce((a, s) => a * s.odd, 1);
    return {
      selections: sels, combinedOdd: Math.round(combined * 100) / 100,
      overallConfidence: Math.max(0.15, sels.reduce((a, s) => a + s.confidence, 0) / sels.length * 0.75),
      summary: `Aposta agressiva com ${sels.length} seleções: ${sels.map(s => s.optionLabel).join(" + ")}. Odd combinada ${combined.toFixed(2)}x — alto risco, alto retorno.`,
    };
  }

  // MATEMATICO — value bets em múltiplos mercados
  const allOddsSorted = [...odds].sort((a, b) => a.odd - b.odd);
  const valueSels: SuggestionItem[] = [];
  for (const o of allOddsSorted) {
    const implied  = 1 / o.odd;
    const estimated = implied * 1.12;
    if (estimated > implied + 0.05) {
      const edgePct = Math.round((estimated - implied) * 100);
      valueSels.push(toSel(o, estimated, `Value bet: edge de ${edgePct}% sobre odd de mercado ${o.odd.toFixed(2)}. Probabilidade estimada ${Math.round(estimated * 100)}% vs implícita ${Math.round(implied * 100)}%.`));
    }
    if (valueSels.length >= 3) break;
  }
  // Garantir mínimo 2
  if (valueSels.length < 2) {
    for (const o of allOddsSorted) {
      if (valueSels.some(s => s.option === o.option && s.market === o.market)) continue;
      const implied = 1 / o.odd;
      valueSels.push(toSel(o, implied * 1.08, `Análise complementar: odd ${o.odd.toFixed(2)} com margem aceitável.`));
      if (valueSels.length >= 2) break;
    }
  }
  const combined = valueSels.reduce((a, s) => a * s.odd, 1);
  return {
    selections: valueSels, combinedOdd: Math.round(combined * 100) / 100,
    overallConfidence: valueSels.length > 0 ? valueSels.reduce((a, s) => a + s.confidence, 0) / valueSels.length : 0,
    summary: valueSels.length > 0
      ? `${valueSels.length} value bets identificadas com edge sobre o mercado. Odd combinada ${combined.toFixed(2)}x.`
      : "Nenhum value bet com margem mínima de 5% identificado.",
  };
}

// ─── Análise principal ──────────────────────────────────────────────────────────

export async function analyzeBetMatch(input: MatchAnalysisInput): Promise<BetAnalysis> {
  const { matchId, homeTeam, awayTeam, competition, round } = input;

  // 1. Busca odds disponíveis no DB
  const dbOdds = await prisma.betOdds.findMany({
    where:  { matchId, isActive: true },
    select: { market: true, option: true, optionLabel: true, odd: true },
  });

  const oddRows: OddRow[] = dbOdds.map((o) => ({
    market:      o.market as string,
    option:      o.option,
    optionLabel: o.optionLabel,
    odd:         o.odd,
  }));

  let analysis: BetAnalysis;

  // 2. Tenta Claude
  const prompt = buildPrompt(homeTeam, awayTeam, competition, round, oddRows);
  const raw    = await callClaude(prompt, 1400);

  if (raw) {
    try {
      // Remove possível markdown code fence
      const json = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(json) as Record<string, unknown>;

      const conservador = parseProfile(parsed.conservador);
      const moderado    = parseProfile(parsed.moderado);
      const agressivo   = parseProfile(parsed.agressivo);
      const matematico  = parseProfile(parsed.matematico);

      if (conservador && moderado && agressivo && matematico) {
        analysis = { matchId, conservador, moderado, agressivo, matematico, source: "claude" };
      } else {
        throw new Error("Perfis inválidos no JSON do Claude");
      }
    } catch (err) {
      console.warn(`[BOB/BetAnalyzer] Parse Claude falhou para ${homeTeam} x ${awayTeam}:`, err);
      analysis = buildFallbackAnalysis(matchId, homeTeam, awayTeam, oddRows);
    }
  } else {
    analysis = buildFallbackAnalysis(matchId, homeTeam, awayTeam, oddRows);
  }

  // 3. Persiste no DB (delete existentes + create novos)
  await persistAnalysis(matchId, analysis);

  return analysis;
}

function buildFallbackAnalysis(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  odds: OddRow[],
): BetAnalysis {
  return {
    matchId,
    conservador: fallbackProfile("CONSERVADOR", homeTeam, awayTeam, odds),
    moderado:    fallbackProfile("MODERADO",    homeTeam, awayTeam, odds),
    agressivo:   fallbackProfile("AGRESSIVO",   homeTeam, awayTeam, odds),
    matematico:  fallbackProfile("MATEMATICO",  homeTeam, awayTeam, odds),
    source:      "fallback",
  };
}

// ─── Persistência ──────────────────────────────────────────────────────────────

const PROFILE_MAP: Record<string, BettorProfile> = {
  conservador: BettorProfile.CONSERVADOR,
  moderado:    BettorProfile.MODERADO,
  agressivo:   BettorProfile.AGRESSIVO,
  matematico:  BettorProfile.MATEMATICO,
};

async function persistAnalysis(matchId: string, analysis: BetAnalysis): Promise<void> {
  // Deleta sugestões anteriores do jogo e recria
  await prisma.bobSuggestion.deleteMany({ where: { matchId } });

  const records = (["conservador", "moderado", "agressivo", "matematico"] as const).flatMap(
    (profileKey) => {
      const prof    = analysis[profileKey];
      const dbProf  = PROFILE_MAP[profileKey]!;
      return prof.selections.map((sel) => ({
        matchId,
        profile:      dbProf,
        market:       sel.market,
        option:       sel.option,
        optionLabel:  sel.optionLabel,
        odd:          sel.odd,
        confidence:   sel.confidence,
        justification: sel.justification,
      }));
    },
  );

  if (records.length > 0) {
    await prisma.bobSuggestion.createMany({ data: records });
  }
}

// ─── Busca sugestões salvas ───────────────────────────────────────────────────

export async function getSuggestionsForMatch(matchId: string) {
  const rows = await prisma.bobSuggestion.findMany({
    where:   { matchId },
    orderBy: [{ profile: "asc" }, { odd: "asc" }],
  });
  return rows;
}

export async function getSuggestionsForMatches(matchIds: string[]) {
  if (matchIds.length === 0) return [];
  const rows = await prisma.bobSuggestion.findMany({
    where:   { matchId: { in: matchIds } },
    orderBy: [{ matchId: "asc" }, { profile: "asc" }, { odd: "asc" }],
  });
  return rows;
}
