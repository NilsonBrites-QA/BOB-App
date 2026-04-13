/**
 * BOB — Gerador de Variações (Método BOB)
 *
 * Recebe os 4 âncoras selecionados pelo motor de scoring e um pool de outros
 * jogos da rodada, e gera as 5 variações canônicas do método.
 *
 * V1 Segurança    — 4 âncoras + 4 fills conservadores  (8–9 jogos) | piso 500x
 * V2 Equilíbrio   — 3 âncoras + empates em score médio  (9 jogos)  | piso 800x
 * V3 Lógica Pura  — 4 âncoras + 5 fills todos favoritos (9 jogos)  | piso 800x
 * V4 Curta        — 3 âncoras + fills seletivos limpos   (7 jogos) | piso 1000x
 * V5 Extrema      — 2–3 âncoras + empates e azarões      (10 jogos)| piso 1000x
 *
 * Quando a odd projetada fica abaixo do piso, o sistema substitui picks
 * de menor odd por alternativas de maior valor (empate/azarão) até atingir
 * o alvo. Isso mantém os âncoras intactos e eleva o multiplicador.
 *
 * Determinístico: mesmo input, mesma saída. Sem LLM, sem randomização.
 */

import { type ScoredMatch } from "./scoring";
import { type Variation, type VariationPick } from "../types";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type VariationInput = {
  /** Até 4 âncoras retornadas por selectAnchors() */
  anchors: ScoredMatch[];
  /** Demais jogos da rodada já pontuados (não-âncoras) */
  pool: ScoredMatch[];
};

// ─── Helpers de conversão ─────────────────────────────────────────────────────

function toAnchorPick(m: ScoredMatch): VariationPick {
  return {
    fixtureId: m.id,
    match: m.match,
    result: "1",
    odd: m.homeOdd,
    isAnchor: true,
    isMarginal: m.isMarginalAnchor ?? false,
  };
}

function toWinPick(m: ScoredMatch): VariationPick {
  return {
    fixtureId: m.id,
    match: m.match,
    result: m.suggestedResult,
    odd: pickOdd(m, m.suggestedResult),
  };
}

function toDrawPick(m: ScoredMatch): VariationPick {
  return { fixtureId: m.id, match: m.match, result: "X", odd: m.drawOdd };
}

function toUpsetPick(m: ScoredMatch): VariationPick {
  // Prefere azarão fora de casa; cai para empate se odd do visitante for muito alta
  if (m.awayOdd <= 3.60) return { fixtureId: m.id, match: m.match, result: "2", odd: m.awayOdd };
  return { fixtureId: m.id, match: m.match, result: "X", odd: m.drawOdd };
}

function pickOdd(m: ScoredMatch, result: "1" | "X" | "2"): number {
  if (result === "1") return m.homeOdd;
  if (result === "X") return m.drawOdd;
  return m.awayOdd;
}

function projectedOdd(picks: VariationPick[]): number {
  if (picks.length === 0) return 1;
  return Math.round(picks.reduce((acc, p) => acc * p.odd, 1));
}

// ─── Pisos mínimos de odds por variação ───────────────────────────────────────

const ODD_FLOORS: Record<string, number> = {
  V1: 500,
  V2: 800,
  V3: 800,
  V4: 1000,
  V5: 1000,
};

/**
 * Eleva a odd projetada até o piso mínimo substituindo picks de menor odd
 * por suas alternativas de empate/azarão (mantendo âncoras intactos).
 *
 * Estratégia:
 *   1. Ordena picks não-âncora pela odd crescente (menores primeiro)
 *   2. Substitui pelo empate (drawOdd) — geralmente 2x a 4x maior
 *   3. Se ainda não atingiu o piso, substitui pelo azarão (awayOdd)
 *   4. Como último recurso, adiciona mais picks do pool disponível
 */
function boostToFloor(
  picks: VariationPick[],
  floor: number,
  allMatches: ScoredMatch[],
): VariationPick[] {
  let current = projectedOdd(picks);
  if (current >= floor) return picks;

  const result = [...picks];
  const usedIds = new Set(result.map((p) => p.fixtureId));

  // Fase 1: substituir fills por empates (não tocar âncoras)
  const fillIndices = result
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.isAnchor)
    .sort((a, b) => a.p.odd - b.p.odd); // menores odds primeiro

  for (const { i } of fillIndices) {
    if (current >= floor) break;
    const match = allMatches.find((m) => m.id === result[i]!.fixtureId);
    if (!match) continue;
    const drawOdd = match.drawOdd;
    if (drawOdd > result[i]!.odd) {
      const oldOdd = result[i]!.odd;
      result[i] = { ...result[i]!, result: "X", odd: drawOdd };
      current = Math.round((current / oldOdd) * drawOdd);
    }
  }

  // Fase 2: trocar empates por azarões se ainda precisar
  if (current < floor) {
    const drawIndices = result
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => !p.isAnchor && p.result === "X")
      .sort((a, b) => a.p.odd - b.p.odd);

    for (const { i } of drawIndices) {
      if (current >= floor) break;
      const match = allMatches.find((m) => m.id === result[i]!.fixtureId);
      if (!match || match.awayOdd <= result[i]!.odd) continue;
      const oldOdd = result[i]!.odd;
      result[i] = { ...result[i]!, result: "2", odd: match.awayOdd };
      current = Math.round((current / oldOdd) * match.awayOdd);
    }
  }

  // Fase 3: adicionar mais jogos do pool se ainda não bateu o piso
  if (current < floor) {
    const available = allMatches
      .filter((m) => !usedIds.has(m.id))
      .sort((a, b) => b.drawOdd - a.drawOdd); // maior draw odd primeiro

    for (const m of available) {
      if (current >= floor) break;
      result.push({ fixtureId: m.id, match: m.match, result: "X", odd: m.drawOdd });
      current = Math.round(current * m.drawOdd);
    }
  }

  return result;
}

// ─── Classificadores de pool ──────────────────────────────────────────────────

/** Jogo "sujo": alta incerteza, score baixo — evitar em variações conservadoras */
function isDirty(m: ScoredMatch): boolean {
  return m.score < 35;
}

/**
 * Bom candidato a empate:
 * - Odds de empate não absurdas (< 3.60)
 * - Relação odd_empate / odd_mandante razoável (abaixo de 2.6x)
 * - Score intermediário (35–65): nem âncora nem jogo sujíssimo
 */
function isDrawCandidate(m: ScoredMatch): boolean {
  const ratio = m.drawOdd / m.homeOdd;
  return (
    !m.isAnchorCandidate &&
    m.drawOdd < 3.60 &&
    ratio < 2.6 &&
    m.score >= 35
  );
}

/**
 * Bom fill (vitória do favorito):
 * - Score ≥ 40, não âncora, não jogo sujo
 * - Resultado sugerido = "1"
 */
function isFillCandidate(m: ScoredMatch): boolean {
  return !m.isAnchorCandidate && m.score >= 40 && !isDirty(m);
}

/**
 * Azarão válido para V5: vitória do visitante com odd < 3.60
 */
function isUpsetCandidate(m: ScoredMatch): boolean {
  return !m.isAnchorCandidate && m.awayOdd < 3.60;
}

// ─── Diversificação de pools ──────────────────────────────────────────────────

/**
 * Calcula % de sobreposição de picks entre duas variações (pelo fixtureId).
 * Retorna valor entre 0 (nenhum pick comum) e 1 (100% iguais).
 */
function overlapRatio(a: VariationPick[], b: VariationPick[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const idsA = new Set(a.map((p) => p.fixtureId));
  const shared = b.filter((p) => idsA.has(p.fixtureId)).length;
  return shared / Math.max(a.length, b.length);
}

/**
 * Se duas variações tiverem sobreposição > 70%, força divergência
 * substituindo o último fill não-âncora da variação B por um pick de
 * um pool reserva (alternativas ainda não usadas).
 */
function enforceDivergence(
  primary: VariationPick[],
  target: VariationPick[],
  reserve: ScoredMatch[],
): VariationPick[] {
  if (overlapRatio(primary, target) <= 0.70) return target;

  const usedIds = new Set([
    ...primary.map((p) => p.fixtureId),
    ...target.map((p) => p.fixtureId),
  ]);

  // Encontrar candidatos do reserve ainda não usados
  const candidates = reserve.filter((m) => !usedIds.has(m.id));
  if (candidates.length === 0) return target; // reserva esgotada, retorna como está

  // Substituir o último fill não-âncora de target por um candidato do reserve
  const result = [...target];
  const lastFillIndex = result.map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.isAnchor)
    .at(-1)?.i;

  if (lastFillIndex === undefined) return result;

  const sub = candidates[0]!;
  result[lastFillIndex] = toWinPick(sub);
  return result;
}

// ─── Gerador principal ────────────────────────────────────────────────────────

export function generateVariations({ anchors, pool }: VariationInput): Variation[] {
  // Pool ordenado por score decrescente (padrão: maior score → mais confiável)
  const sorted = [...pool].sort((a, b) => b.score - a.score);
  // Pool alternativo para V4: ordena por homeOdd crescente (favoritos mais arriscados)
  // Isso garante que V4 selecione fills diferentes de V3 (V3 usa score, V4 usa homeOdd)
  const sortedByOdd = [...pool]
    .filter(isFillCandidate)
    .sort((a, b) => b.homeOdd - a.homeOdd); // odds mais altas primeiro = favoritos menos óbvios

  const allMatches = [...anchors, ...pool]; // para boostToFloor

  const draws = sorted
    .filter(isDrawCandidate)
    .sort((a, b) => a.drawOdd / a.homeOdd - b.drawOdd / b.homeOdd); // menor ratio primeiro

  const fills = sorted.filter(isFillCandidate);
  const clean = sorted.filter((m) => !isDirty(m));
  const upsets = sorted.filter(isUpsetCandidate).sort((a, b) => a.awayOdd - b.awayOdd);

  // Pool de reserva para enforceDivergence: tudo que não está em fills nem em draws
  const reserveIds = new Set([...fills, ...draws].map((m) => m.id));
  const reserve = sorted.filter((m) => !reserveIds.has(m.id));

  // ── V1: Segurança (4 âncoras + 4 fills, ~8 jogos) ────────────────────────
  const v1PicksRaw: VariationPick[] = [
    ...anchors.map(toAnchorPick),
    ...fills.slice(0, 4).map(toWinPick),
  ];
  const v1Picks = boostToFloor(v1PicksRaw, ODD_FLOORS.V1!, allMatches);

  const v1: Variation = {
    id: "V1",
    title: "Segurança",
    posture: "Todos os 4 âncoras vencem e a rodada fica mais enxuta.",
    projectedOdd: projectedOdd(v1Picks),
    gameCount: v1Picks.length,
    anchorsTogether: true,
    summary:
      "Leitura de rodada mais limpa, cortando jogos com contexto nebuloso para preservar a força estrutural.",
    picks: v1Picks,
  };

  // ── V2: Equilíbrio (3 âncoras + empates + fills, ~9 jogos) ───────────────
  const v2PicksRaw: VariationPick[] = [
    ...anchors.slice(0, 3).map(toAnchorPick),
    ...draws.slice(0, 3).map(toDrawPick),
    ...fills.slice(0, 3).map(toWinPick),
  ].slice(0, 9);
  const v2Picks = boostToFloor(v2PicksRaw, ODD_FLOORS.V2!, allMatches);

  const v2: Variation = {
    id: "V2",
    title: "Equilíbrio",
    posture: "Âncoras fortes com empates em jogos de score intermediário.",
    projectedOdd: projectedOdd(v2Picks),
    gameCount: v2Picks.length,
    anchorsTogether: false,
    summary:
      "Aposta em empate onde o confronto tem tendência a travar o valor esperado e ainda sustenta as âncoras centrais.",
    picks: v2Picks,
  };

  // ── V3: Lógica Pura (4 âncoras + 5 fills, ~9 jogos) ──────────────────────
  // Usa score-ordered fills: os favoritos mais óbvios pelo algoritmo
  const v3FillPicks = fills.slice(0, 5).map((m, i) =>
    // Último fill inclui um empate para variedade de odd
    i === 4 ? toDrawPick(m) : toWinPick(m),
  );
  const v3PicksRaw: VariationPick[] = [
    ...anchors.map(toAnchorPick),
    ...v3FillPicks,
  ].slice(0, 9);
  const v3Picks = boostToFloor(v3PicksRaw, ODD_FLOORS.V3!, allMatches);

  const v3: Variation = {
    id: "V3",
    title: "Lógica Pura",
    posture: "A rodada responde ao favoritismo e os 4 pilares confirmam ao mesmo tempo.",
    projectedOdd: projectedOdd(v3Picks),
    gameCount: v3Picks.length,
    anchorsTogether: true,
    summary:
      "Variação central do método: todos os favoritos principais vencem e a leitura da rodada confirma o recorte mais racional.",
    picks: v3Picks,
  };

  // ── V4: Curta de pressão (3 âncoras + 4 fills, ~7 jogos) ──────────────
  // Usa odd-ordered fills: favoritos MENOS óbvios (homeOdd mais alta)
  // Isso garante perfil de risco distinto de V3 e diversidade de picks
  const v4OddFills = sortedByOdd
    .filter((m) => !anchors.some((a) => a.id === m.id))
    .slice(0, 4);
  const v4FillPicks = v4OddFills.map((m, i) => {
    // Último fill pode ser contrarian se tiver azarão viável
    if (i === v4OddFills.length - 1 && m.awayOdd <= 3.60) return toUpsetPick(m);
    return toWinPick(m);
  });
  const v4PicksRaw: VariationPick[] = [
    ...anchors.slice(0, 3).map(toAnchorPick),
    ...v4FillPicks,
  ].slice(0, 7);
  const v4PicksRawBoosted = boostToFloor(v4PicksRaw, ODD_FLOORS.V4!, allMatches);
  // Garantir divergência: se V3 e V4 ainda têm sobreposição > 70%, forçar substituição
  const v4Picks = enforceDivergence(v3Picks, v4PicksRawBoosted, [...clean, ...reserve]);

  const v4: Variation = {
    id: "V4",
    title: "Curta de pressão",
    posture: "Menos jogos, mas odd ainda alta para um cenário de corte seletivo.",
    projectedOdd: projectedOdd(v4Picks),
    gameCount: v4Picks.length,
    anchorsTogether: false,
    summary:
      "Remove parte dos confrontos mais sujos da rodada e força um pacote mais agressivo em valor por seleção.",
    picks: v4Picks,
  };

  // ── V5: Extrema (2–3 âncoras + empates e azarões, ~10 jogos) ─────────────
  const v5AnchorPicks = anchors.slice(0, 2).map(toAnchorPick);
  const v5DrawPicks = draws.slice(0, 5).map(toDrawPick);
  const v5UpsetPicks = upsets.slice(0, 3).map(toUpsetPick);
  const v5PicksRaw: VariationPick[] = [
    ...v5AnchorPicks,
    ...v5DrawPicks,
    ...v5UpsetPicks,
  ].slice(0, 10);
  const v5Picks = boostToFloor(v5PicksRaw, ODD_FLOORS.V5!, allMatches);

  const v5: Variation = {
    id: "V5",
    title: "Extrema",
    posture: "Rodada com mais fricção, mais empates e pontos de ruptura controlados.",
    projectedOdd: projectedOdd(v5Picks),
    gameCount: v5Picks.length,
    anchorsTogether: false,
    summary:
      "Variação de estresse do método, preservando o eixo das âncoras mas aceitando mais travas e um desenho mais raro.",
    picks: v5Picks,
  };

  return [v1, v2, v3, v4, v5];
}
