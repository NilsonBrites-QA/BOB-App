/**
 * Helpers compartilhados para construir os ViewModels (`AnchorView`, `VariationView`,
 * `AuditView`, `RoundView`) consumidos pelo `<VariacoesClient />`.
 *
 * Usado por:
 *   - apps/web/src/app/variacoes/page.tsx
 *   - apps/web/src/app/dashboard/page.tsx
 *
 * O objetivo é garantir que ambas as telas mostrem a mesma UI limpa
 * (sem botões de seleção/exclusão, sanfonas individuais por âncora) e a
 * mesma lógica de classificação/justificativa.
 */

import type { ScoredMatch } from "./engine/scoring";
import type { Variation as BeamVariation } from "./engine/beam-search";
import type {
  VariationView,
  AnchorView,
  AuditView,
  VariationLeg,
} from "@/app/variacoes/variacoes-client";

// ─── Helpers de label e classificação ────────────────────────────────────────

export function pickLabel(
  outcome: "Home" | "Draw" | "Away",
  homeTeam: string,
  awayTeam: string,
): string {
  if (outcome === "Home") return homeTeam;
  if (outcome === "Away") return awayTeam;
  return "Empate";
}

export function variationMeta(
  id: "V1" | "V2" | "V3" | "V4" | "V5",
): { title: string; intention: string } {
  switch (id) {
    case "V1":
      return {
        title: "Estabilidade Máxima",
        intention: "Combinação mais estável da rodada — âncoras fortes, sem zebras forçadas.",
      };
    case "V2":
      return {
        title: "Proteção de Cenários",
        intention:
          "Cobre os pontos onde V1 pode falhar — empates de proteção e remoções táticas.",
      };
    case "V3":
      return {
        title: "Leitura Principal do BOB",
        intention: "Melhor análise da rodada — a variação mais defendida pelos dados.",
      };
    case "V4":
      return {
        title: "Expansão de Valor",
        intention:
          "Aumenta a odd com risco controlado — favoritos mal precificados ou empates de valor.",
      };
    case "V5":
      return {
        title: "Cobertura Assimétrica",
        intention:
          "Cenário de maior retorno ainda defensável — picks contra mercado justificados.",
      };
  }
}

export function classifyRisk(
  combinedOdd: number,
  anchorPrimaryCount: number,
): VariationView["riskLevel"] {
  if (combinedOdd < 100 && anchorPrimaryCount >= 4) return "LOW";
  if (combinedOdd < 500 && anchorPrimaryCount >= 3) return "MEDIUM";
  if (combinedOdd < 2000) return "HIGH";
  return "EXTREME";
}

export function classifyAnchorType(
  anchorScore: number,
  isClassico: boolean,
): AnchorView["type"] {
  if (isClassico) return "CONDITIONAL";
  if (anchorScore >= 0.5) return "STRONG";
  if (anchorScore >= 0.2) return "ACCEPTABLE";
  return "CONDITIONAL";
}

export function buildAnchorReason(anchor: ScoredMatch): string {
  const team =
    anchor.suggestedResult === "1"
      ? anchor.homeTeam
      : anchor.suggestedResult === "2"
      ? anchor.awayTeam
      : "empate";
  const topReasons = (anchor.reasons ?? []).slice(0, 2).join(" · ");
  if (topReasons) {
    return `${team} é a melhor leitura: ${topReasons.toLowerCase()}. Score ${anchor.score}/100.`;
  }
  return `${team} oferece o melhor equilíbrio entre forma, mando, odd e contexto da rodada (score ${anchor.score}/100).`;
}

export function buildShortJustification(v: VariationView, anchorCount: number): string {
  const anchorRatio = `${v.anchorPrimaryCount} de ${anchorCount} âncoras com pick primário`;
  return `${v.legCount} jogos · odd combinada ${v.combinedOdd.toFixed(2)}× · ${anchorRatio}.`;
}

export function buildDetailedJustification(v: VariationView): string {
  const lines: string[] = [];
  const homePicks = v.legs.filter((l) => l.pickOutcome === "Home").length;
  const drawPicks = v.legs.filter((l) => l.pickOutcome === "Draw").length;
  const awayPicks = v.legs.filter((l) => l.pickOutcome === "Away").length;

  lines.push(
    `Distribuição de picks: ${homePicks} mandantes · ${drawPicks} empates · ${awayPicks} visitantes.`,
  );
  lines.push(
    `Probabilidade estimada de acerto total: ${(v.probabilityMass * 100).toFixed(3)}%.`,
  );

  if (v.id === "V1") {
    lines.push(
      "Esta é a variação de maior estabilidade. Prioriza âncoras fortes e descarta jogos caóticos.",
    );
  } else if (v.id === "V2") {
    lines.push(
      "Esta variação protege os pontos frágeis da V1 com empates ou substituições táticas.",
    );
  } else if (v.id === "V3") {
    lines.push(
      "Leitura principal do BOB. Equilíbrio entre dados e contexto — base de referência da rodada.",
    );
  } else if (v.id === "V4") {
    lines.push(
      "Expansão de valor: 1 âncora flipada para o segundo outcome mais provável (cercamento PRD §3).",
    );
  } else if (v.id === "V5") {
    lines.push(
      "Cobertura assimétrica: máxima exploração de odd ainda defensável por dados.",
    );
  }

  return lines.join("\n\n");
}

export function buildAudit(variations: VariationView[]): AuditView {
  const checks: { label: string; ok: boolean }[] = [];
  const alerts: string[] = [];
  const warnings: string[] = [];

  // V1-V5 presentes
  const ids = new Set(variations.map((v) => v.id));
  (["V1", "V2", "V3", "V4", "V5"] as const).forEach((id) => {
    checks.push({ label: `${id} presente`, ok: ids.has(id) });
    if (!ids.has(id)) alerts.push(`Variação ${id} ausente`);
  });

  // Cada variação tem >= 5 jogos (RN Big Odds)
  variations.forEach((v) => {
    const ok5 = v.legCount >= 5;
    checks.push({ label: `${v.id} tem ≥ 5 jogos`, ok: ok5 });
    if (!ok5) alerts.push(`${v.id} com apenas ${v.legCount} jogo(s) — abaixo do mínimo de 5`);
  });

  // Odd >= 900
  variations.forEach((v) => {
    const ok900 = v.combinedOdd >= 900;
    checks.push({ label: `${v.id} odd ≥ 900`, ok: ok900 });
    if (!ok900)
      warnings.push(`${v.id} com odd ${v.combinedOdd.toFixed(0)}× (alvo Big Odds: 900+)`);
  });

  // Sem jogo duplicado dentro da mesma variação
  variations.forEach((v) => {
    const matchIds = v.legs.map((l) => l.matchId);
    const noDup = new Set(matchIds).size === matchIds.length;
    checks.push({ label: `${v.id} sem jogos duplicados`, ok: noDup });
    if (!noDup) alerts.push(`${v.id} tem jogos duplicados`);
  });

  // Variações únicas (assinatura)
  const sigs = variations.map((v) =>
    v.legs.map((l) => `${l.matchId}:${l.pickOutcome}`).sort().join("|"),
  );
  const allUnique = new Set(sigs).size === sigs.length;
  checks.push({ label: "Variações únicas (sem duplicatas)", ok: allUnique });
  if (!allUnique) warnings.push("Duas variações resultaram idênticas — pool reduzido");

  const passed = alerts.length === 0;
  return {
    status: passed ? "APPROVED" : "APPROVED_WITH_ALERTS",
    passed,
    alerts,
    warnings,
    checks,
  };
}

// ─── Builders principais ─────────────────────────────────────────────────────

export function buildVariationsView(
  beamVariations: BeamVariation[],
  anchorCount: number,
  teamBadges: Record<string, string | null>,
): VariationView[] {
  return beamVariations.map((v) => {
    const legs: VariationLeg[] = v.legs.map((leg) => ({
      matchId: leg.matchId,
      homeTeam: leg.homeTeam,
      awayTeam: leg.awayTeam,
      pickOutcome: leg.pickOutcome,
      pickLabel: pickLabel(leg.pickOutcome, leg.homeTeam, leg.awayTeam),
      pickOdd: leg.pickOdd,
      fairOdd: leg.fairOdd,
      cleanProb: leg.cleanProb,
      isAnchor: leg.isAnchor,
      homeBadge: teamBadges[leg.homeTeam] ?? null,
      awayBadge: teamBadges[leg.awayTeam] ?? null,
    }));

    const meta = variationMeta(v.id);
    const view: VariationView = {
      id: v.id,
      title: meta.title,
      intention: meta.intention,
      combinedOdd: v.combinedOdd,
      probabilityMass: v.probabilityMass,
      legCount: v.legCount,
      anchorPrimaryCount: v.anchorPrimaryCount,
      riskLevel: classifyRisk(v.combinedOdd, v.anchorPrimaryCount),
      legs,
      shortJustification: "",
      detailedJustification: "",
      alerts: v.transparencyNotes ?? [],
    };
    view.shortJustification = buildShortJustification(view, anchorCount);
    view.detailedJustification = buildDetailedJustification(view);
    return view;
  });
}

export function buildAnchorsView(
  anchors: ScoredMatch[],
  teamBadges: Record<string, string | null>,
): AnchorView[] {
  return anchors.map((a) => {
    const outcome =
      a.suggestedResult === "1" ? "Home" : a.suggestedResult === "2" ? "Away" : "Draw";
    return {
      matchId: a.id,
      homeTeam: a.homeTeam,
      awayTeam: a.awayTeam,
      pick: outcome as "Home" | "Draw" | "Away",
      pickLabel: pickLabel(outcome as "Home" | "Draw" | "Away", a.homeTeam, a.awayTeam),
      type: classifyAnchorType(
        (a as { anchorScore?: number }).anchorScore ?? 0,
        Boolean((a as { isClassico?: boolean }).isClassico),
      ),
      confidence: a.score,
      reason: buildAnchorReason(a),
      risks: ((a as { calibrationAlerts?: string[] }).calibrationAlerts ?? []).slice(0, 3),
      homeBadge: teamBadges[a.homeTeam] ?? null,
      awayBadge: teamBadges[a.awayTeam] ?? null,
    };
  });
}
