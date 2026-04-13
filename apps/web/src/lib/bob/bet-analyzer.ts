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

  return `Você é BOB, sistema especializado em análise estatística de apostas do Brasileirão.

JOGO: ${home} x ${away}
COMPETIÇÃO: ${competition}${round != null ? `, Rodada ${round}` : ""}

ODDS DISPONÍVEIS (use EXATAMENTE estes valores — market, option, optionLabel, odd):
${oddsBlock}

Gere sugestões de aposta para 4 perfis. USE SOMENTE as odds listadas acima.

PERFIS:
- CONSERVADOR: 1–2 seleções de baixo risco. Odds < 1.80. Alta certeza. Se não houver opção segura, selections=[].
- MODERADO: 2–3 seleções com equilíbrio risco/retorno. Odds até 2.50.
- AGRESSIVO: 3–5 seleções de maior risco/retorno. Aceita odds até 5.00. Inclua mercados variados se disponíveis.
- MATEMÁTICO: Apenas value bets onde probabilidade real estimada supera a implícita da odd em ≥5%. Explique o edge numérico na justification.

REGRAS:
1. Use SOMENTE as odds listadas. Copie market/option/optionLabel/odd EXATAMENTE como listados.
2. combinedOdd = produto das odds das seleções (arredonde 2 casas).
3. overallConfidence entre 0.0 e 1.0.
4. justification: 1 frase objetiva por seleção.
5. summary: 1–2 frases descrevendo a estratégia do perfil para este jogo.

Responda SOMENTE com JSON válido (sem markdown, sem texto antes ou depois):
{
  "conservador": {
    "selections": [{"market":"RESULT_1X2","option":"HOME","optionLabel":"Vitória ${home}","odd":1.65,"confidence":0.78,"justification":"..."}],
    "combinedOdd": 1.65,
    "overallConfidence": 0.78,
    "summary": "..."
  },
  "moderado": {"selections":[...],"combinedOdd":...,"overallConfidence":...,"summary":"..."},
  "agressivo": {"selections":[...],"combinedOdd":...,"overallConfidence":...,"summary":"..."},
  "matematico": {"selections":[...],"combinedOdd":...,"overallConfidence":...,"summary":"..."}
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

  const homeRow  = get("RESULT_1X2", "HOME");
  const drawRow  = get("RESULT_1X2", "DRAW");
  const awayRow  = get("RESULT_1X2", "AWAY");

  // Ordena por menor odd (mais provável)
  const sorted = [homeRow, drawRow, awayRow]
    .filter((x): x is OddRow => x != null)
    .sort((a, b) => a.odd - b.odd);

  const fav = sorted[0];
  const sec = sorted[1];

  if (!fav) {
    return {
      selections:        [],
      combinedOdd:       1,
      overallConfidence: 0,
      summary:           "Odds não disponíveis para análise.",
    };
  }

  const favConf  = impliedProb(fav.odd) * 0.92; // 8% vigorish adjustment

  if (profile === "CONSERVADOR") {
    if (fav.odd >= 1.80) {
      return { selections: [], combinedOdd: 1, overallConfidence: 0, summary: "Sem opção conservadora segura neste jogo." };
    }
    return {
      selections:        [{ ...fav as SuggestionItem, market: fav.market as BetMarket, confidence: favConf, justification: `Favorito com probabilidade implícita de ${Math.round(impliedProb(fav.odd) * 100)}%.` }],
      combinedOdd:       fav.odd,
      overallConfidence: favConf,
      summary:           `Aposta simples no favorito ${fav.optionLabel}. Risco reduzido.`,
    };
  }

  if (profile === "MODERADO") {
    const sels: SuggestionItem[] = [
      { ...fav as SuggestionItem, market: fav.market as BetMarket, confidence: favConf, justification: `Principal favorito do confronto.` },
    ];
    if (sec && sec.odd <= 2.50) {
      sels.push({ ...sec as SuggestionItem, market: sec.market as BetMarket, confidence: impliedProb(sec.odd) * 0.9, justification: `Segunda opção com odd atraente.` });
    }
    const combined = sels.reduce((a, s) => a * s.odd, 1);
    return { selections: sels, combinedOdd: Math.round(combined * 100) / 100, overallConfidence: favConf * 0.85, summary: `Estratégia balanceada combinando ${sels.length} seleção(ões).` };
  }

  if (profile === "AGRESSIVO") {
    const sels: SuggestionItem[] = sorted.slice(0, Math.min(3, sorted.length)).map((o) => ({
      ...o as SuggestionItem,
      market: o.market as BetMarket,
      confidence: impliedProb(o.odd) * 0.85,
      justification: `Seleção agressiva para maximizar retorno.`,
    }));
    const combined = sels.reduce((a, s) => a * s.odd, 1);
    return { selections: sels, combinedOdd: Math.round(combined * 100) / 100, overallConfidence: Math.max(0.2, favConf * 0.6), summary: `Perfil agressivo com ${sels.length} seleções para alto retorno.` };
  }

  // MATEMATICO — análise de valor
  const valueItems = sorted.filter((o) => {
    const implied  = 1 / o.odd;
    const estimated = implied * 1.12; // assume edge de 12% no mercado
    return estimated > implied + 0.05;
  });
  if (valueItems.length === 0) {
    return { selections: [], combinedOdd: 1, overallConfidence: 0, summary: `Nenhum value bet identificado com margem mínima de 5%.` };
  }
  const best = valueItems[0]!;
  const edge = Math.round((1 / best.odd * 1.12 - 1 / best.odd) * 100);
  return {
    selections: [{ ...best as SuggestionItem, market: best.market as BetMarket, confidence: 1 / best.odd * 1.12, justification: `Value bet com edge estimado de ${edge}% sobre a odd de mercado.` }],
    combinedOdd: best.odd,
    overallConfidence: 1 / best.odd * 1.12,
    summary: `Aposta matemática baseada em edge de ${edge}% identificado para ${best.optionLabel}.`,
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
