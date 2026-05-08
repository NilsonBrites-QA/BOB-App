import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { scoreMatch, selectAnchorsFromScored, generateVariations } from "@/lib/bob/engine";
import type {
  VariationEnrichment,
  VariationReplacement,
  JudgeResult,
} from "@/lib/bob/engine/variation-judge";
import { analyzeRoundDifficulty } from "@/lib/bob/engine/round-analyzer";
import { loadRoundData } from "@/lib/bob/round-loader";
import { loadDeliveredRound } from "@/lib/bob/persist";
import { loadAllBadgesFromDb, resolveBadge } from "@/lib/badges/badge-service";
import { DEMO_ROUND_LABEL, DEMO_FIRST_MATCH, DEMO_CUTOFF } from "@/lib/bob/demo-matches";
import { VariacoesClient } from "./variacoes-client";
import type { VariationView, AnchorView, AuditView, RoundView, VariationLeg } from "./variacoes-client";

// ISR de 5 min: leitura do DB é instantânea (~30ms).
// LLM NUNCA roda no SSR — análise vem pré-computada do cron /api/cron/judge-variations.
export const revalidate = 300;

// Heurística mínima de fallback (se cron nunca rodou para a rodada).
function quickHeuristicEnrichment(
  variation: { id: "V1" | "V2" | "V3" | "V4" | "V5"; combinedOdd: number; legCount: number; anchorPrimaryCount: number },
): VariationEnrichment {
  const titles: Record<typeof variation.id, string> = {
    V1: "linha de segurança máxima — base de favoritos",
    V2: "equilíbrio entre proteção e prêmio",
    V3: "leitura lógica pura do motor",
    V4: "pressão curta com viés de valor",
    V5: "extrema — caça odd alta",
  };
  const conf: VariationEnrichment["confidence"] =
    variation.combinedOdd < 1500 && variation.anchorPrimaryCount >= 3
      ? "alta"
      : variation.combinedOdd < 3000
        ? "média"
        : "baixa";
  return {
    variationId: variation.id,
    bobNarrative: `${variation.id}: ${titles[variation.id]}. Odd ${variation.combinedOdd.toFixed(0)}x em ${variation.legCount} jogos.`,
    keyInsight:
      variation.anchorPrimaryCount > 0
        ? `${variation.anchorPrimaryCount} âncora(s) sustentam o bilhete`
        : `Bilhete sem âncoras — leitura puramente quantitativa`,
    riskAlerts: [],
    confidence: conf,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pickLabel(outcome: "Home" | "Draw" | "Away", homeTeam: string, awayTeam: string): string {
  if (outcome === "Home") return homeTeam;
  if (outcome === "Away") return awayTeam;
  return "Empate";
}

function variationTitle(id: "V1" | "V2" | "V3" | "V4" | "V5"): { title: string; intention: string } {
  switch (id) {
    case "V1":
      return { title: "Estabilidade Máxima", intention: "Combinação mais estável da rodada — âncoras fortes, sem zebras forçadas." };
    case "V2":
      return { title: "Proteção de Cenários", intention: "Cobre os pontos onde V1 pode falhar — empates de proteção e remoções táticas." };
    case "V3":
      return { title: "Leitura Principal do BOB", intention: "Melhor análise da rodada — a variação mais defendida pelos dados." };
    case "V4":
      return { title: "Expansão de Valor", intention: "Aumenta a odd com risco controlado — favoritos mal precificados ou empates de valor." };
    case "V5":
      return { title: "Cobertura Assimétrica", intention: "Cenário de maior retorno ainda defensável — picks contra mercado justificados." };
  }
}

function classifyRisk(combinedOdd: number, anchorPrimaryCount: number): VariationView["riskLevel"] {
  if (combinedOdd < 100 && anchorPrimaryCount >= 4) return "LOW";
  if (combinedOdd < 500 && anchorPrimaryCount >= 3) return "MEDIUM";
  if (combinedOdd < 2000) return "HIGH";
  return "EXTREME";
}

function classifyAnchorType(score: number, isClassico: boolean): AnchorView["type"] {
  if (isClassico) return "CONDITIONAL";
  if (score >= 0.5) return "STRONG";
  if (score >= 0.2) return "ACCEPTABLE";
  return "CONDITIONAL";
}

function buildAnchorReason(anchor: { match: string; homeTeam: string; awayTeam: string; suggestedResult: string; score: number }): string {
  const team = anchor.suggestedResult === "1" ? anchor.homeTeam :
               anchor.suggestedResult === "2" ? anchor.awayTeam : "empate";
  return `${team} oferece o melhor equilíbrio entre forma, mando, odd e contexto da rodada (score ${anchor.score}/100).`;
}

function formatFirstMatch(isoDate: string | null): { label: string; cutoff: string } {
  if (!isoDate) return { label: DEMO_FIRST_MATCH, cutoff: DEMO_CUTOFF };
  try {
    const d = new Date(isoDate);
    const opts: Intl.DateTimeFormatOptions = {
      weekday: "short", day: "numeric", month: "short",
      hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
    };
    const label = d.toLocaleString("pt-BR", opts).replace(",", " ·");
    const cutoffDate = new Date(d.getTime() - 60 * 60 * 1000);
    const cutoff = cutoffDate.toLocaleString("pt-BR", opts).replace(",", " ·");
    return { label, cutoff };
  } catch {
    return { label: DEMO_FIRST_MATCH, cutoff: DEMO_CUTOFF };
  }
}

function buildAudit(variations: VariationView[]): AuditView {
  const checks: { label: string; ok: boolean }[] = [];
  const alerts: string[] = [];
  const warnings: string[] = [];

  // Existência V1-V5
  const ids = new Set(variations.map((v) => v.id));
  (["V1", "V2", "V3", "V4", "V5"] as const).forEach((id) => {
    checks.push({ label: `${id} presente`, ok: ids.has(id) });
    if (!ids.has(id)) alerts.push(`Variação ${id} ausente`);
  });

  // Cada variação tem jogos
  variations.forEach((v) => {
    checks.push({ label: `${v.id} tem ≥ 1 jogo`, ok: v.legCount > 0 });
    if (v.legCount === 0) alerts.push(`${v.id} sem jogos`);
  });

  // Odd total presente
  variations.forEach((v) => {
    checks.push({ label: `${v.id} tem odd total`, ok: v.combinedOdd > 0 });
    if (v.combinedOdd <= 0) alerts.push(`${v.id} sem odd total`);
  });

  // Sem jogo duplicado
  variations.forEach((v) => {
    const ids = v.legs.map((l) => l.matchId);
    const noDup = new Set(ids).size === ids.length;
    checks.push({ label: `${v.id} sem jogos duplicados`, ok: noDup });
    if (!noDup) alerts.push(`${v.id} tem jogos duplicados`);
  });

  // Variações únicas (assinatura)
  const sigs = variations.map((v) =>
    v.legs.map((l) => `${l.matchId}:${l.pickOutcome}`).sort().join("|")
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

function buildShortJustification(v: VariationView, anchorCount: number): string {
  const anchorRatio = `${v.anchorPrimaryCount} de ${anchorCount} âncoras com pick primário`;
  return `${v.legCount} jogos · odd combinada ${v.combinedOdd.toFixed(2)}× · ${anchorRatio}.`;
}

function buildDetailedJustification(v: VariationView): string {
  const lines: string[] = [];
  const homePicks = v.legs.filter((l) => l.pickOutcome === "Home").length;
  const drawPicks = v.legs.filter((l) => l.pickOutcome === "Draw").length;
  const awayPicks = v.legs.filter((l) => l.pickOutcome === "Away").length;

  lines.push(`Distribuição de picks: ${homePicks} mandantes · ${drawPicks} empates · ${awayPicks} visitantes.`);
  lines.push(`Probabilidade estimada de acerto total: ${(v.probabilityMass * 100).toFixed(3)}%.`);

  if (v.id === "V1") {
    lines.push("Esta é a variação de maior estabilidade. Prioriza âncoras fortes e descarta jogos caóticos.");
  } else if (v.id === "V2") {
    lines.push("Esta variação protege os pontos frágeis da V1 com empates ou substituições táticas.");
  } else if (v.id === "V3") {
    lines.push("Leitura principal do BOB. Equilíbrio entre dados e contexto — base de referência da rodada.");
  } else if (v.id === "V4") {
    lines.push("Expansão de valor: 1 âncora flipada para o segundo outcome mais provável (cercamento PRD §3).");
  } else if (v.id === "V5") {
    lines.push("Cobertura assimétrica: máxima exploração de odd ainda defensável por dados.");
  }

  return lines.join("\n\n");
}

// ─── Renderização DB-first (Fase A1) ─────────────────────────────────────────
//
// Quando uma rodada está DELIVERED no banco, montamos a view diretamente do DB.
// Isso garante que TODA visita à página mostre exatamente as mesmas variações,
// até o admin clicar em "Regenerar" (o que cria nova versão e marca a antiga como
// SUPERSEDED).

// Tipos das rows do DB usadas pelo renderFromDb. Manuais porque loadDeliveredRound
// retorna `any` enquanto o Prisma client não foi regenerado pós-migration 011.
type DbPick = {
  id: string;
  fixtureId: string | null;
  match: string;
  result: string;
  odd: number;
  isAnchor: boolean;
  position: number;
};
type DbVariation = {
  id: string;
  code: string;
  title: string;
  posture: string;
  projectedOdd: number;
  gameCount: number;
  summary: string;
  picks: DbPick[];
};
type DbAnchor = {
  id: string;
  team: string;
  opponent: string;
  score: number;
  reasons: unknown;
  rank: number;
};
type DbRound = {
  id: string;
  number: number;
  status: string;
  firstMatchAt: Date | null;
  variations: DbVariation[];
  anchors: DbAnchor[];
};

function pickResultToOutcome(r: string): "Home" | "Draw" | "Away" {
  if (r === "HOME") return "Home";
  if (r === "AWAY") return "Away";
  return "Draw";
}

function splitMatch(s: string): { home: string; away: string } {
  // formato canônico: "Flamengo x Palmeiras" (também aceita "×")
  const parts = s.split(/\s+[x×]\s+/i);
  return { home: parts[0]?.trim() ?? "", away: parts[1]?.trim() ?? "" };
}

async function renderFromDb(args: {
  season: number;
  dbRound: DbRound;
  badgeMap: Map<string, string | null>;
}) {
  const { season, dbRound, badgeMap } = args;

  // Variações
  const variations: VariationView[] = dbRound.variations.map((v) => {
    const legs: VariationLeg[] = v.picks.map((p) => {
      const { home, away } = splitMatch(p.match);
      const outcome = pickResultToOutcome(p.result);
      return {
        matchId:    p.fixtureId ?? `db-${p.id}`,
        homeTeam:   home,
        awayTeam:   away,
        pickOutcome: outcome,
        pickLabel:  pickLabel(outcome, home, away),
        pickOdd:    p.odd,
        fairOdd:    p.odd, // sem snapshot — usa o próprio odd
        cleanProb:  p.odd > 0 ? 1 / p.odd : 0,
        isAnchor:   p.isAnchor,
        homeBadge:  resolveBadge(home, badgeMap),
        awayBadge:  resolveBadge(away, badgeMap),
      };
    });

    const anchorPrimaryCount = legs.filter((l) => l.isAnchor).length;
    const code = (v.code as "V1" | "V2" | "V3" | "V4" | "V5") ?? "V3";
    const meta = variationTitle(code);
    const combinedOdd = v.projectedOdd;
    const probabilityMass = combinedOdd > 0 ? 1 / combinedOdd : 0;

    const view: VariationView = {
      id:                  code,
      title:               meta.title,
      intention:           meta.intention,
      combinedOdd,
      probabilityMass,
      legCount:            legs.length,
      anchorPrimaryCount,
      riskLevel:           classifyRisk(combinedOdd, anchorPrimaryCount),
      legs,
      shortJustification:  v.summary || `${legs.length} jogos · odd ${combinedOdd.toFixed(2)}×`,
      detailedJustification: v.summary || meta.intention,
      alerts:              [],
    };
    return view;
  });

  // Âncoras — agora com escudos do banco
  const anchorsView: AnchorView[] = dbRound.anchors.map((a) => {
    const matchKeyHome = a.team;
    const matchKeyAway = a.opponent;
    return {
      matchId:    `anchor-${a.id}`,
      homeTeam:   matchKeyHome,
      awayTeam:   matchKeyAway,
      pick:       "Home" as const,
      pickLabel:  matchKeyHome,
      type:       a.score >= 50 ? "STRONG" : a.score >= 20 ? "ACCEPTABLE" : "CONDITIONAL",
      confidence: a.score,
      reason:     Array.isArray(a.reasons) && a.reasons.length > 0
        ? String((a.reasons as unknown[])[0])
        : `${matchKeyHome} oferece o melhor equilíbrio da rodada`,
      risks:      [],
      homeBadge:  resolveBadge(matchKeyHome, badgeMap),
      awayBadge:  resolveBadge(matchKeyAway, badgeMap),
    };
  });

  // Audit
  const audit = buildAudit(variations);

  // Round info
  const firstMatchAt = dbRound.firstMatchAt
    ? dbRound.firstMatchAt.toISOString()
    : null;
  const { label: firstMatch, cutoff } = formatFirstMatch(firstMatchAt);

  const roundView: RoundView = {
    label:         `Rodada ${dbRound.number} · ${season}`,
    source:        "api",
    firstMatch,
    cutoff,
    totalMatches:  variations[0]?.legCount ?? 0,
    difficulty:    "balanced",
    difficultyLabel: "Variações oficiais — leitura congelada",
    bobMessage:
      `Variações entregues e congeladas (versão ${
        (dbRound as { version?: number }).version ?? 1
      }). Para regerar, peça ao admin.`,
    aiProvider:    "heuristic",
  };

  return (
    <VariacoesClient
      round={roundView}
      anchors={anchorsView}
      variations={variations}
      audit={audit}
    />
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function VariacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; round?: string }>;
}) {
  // Auth gate
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const dbUser = await prisma.user
    .findUnique({ where: { email: user.email!.toLowerCase() }, select: { active: true } })
    .catch(() => null);
  if (!dbUser?.active) redirect("/login");

  const params = await searchParams;
  const season = params.season ? parseInt(params.season, 10) : new Date().getFullYear();
  const round = params.round ? parseInt(params.round, 10) : null;

  const roundData = await loadRoundData(season, round);

  // ── Escudos: DB-first + fallback com crests direto da API ──────────────────
  const badgeMap = await loadAllBadgesFromDb();
  for (const m of roundData.matches) {
    if (m.homeCrest) badgeMap.set(m.homeTeam, badgeMap.get(m.homeTeam) ?? m.homeCrest);
    if (m.awayCrest) badgeMap.set(m.awayTeam, badgeMap.get(m.awayTeam) ?? m.awayCrest);
  }

  // ── DB-FIRST: variações congeladas (Fase A1) ────────────────────────────────
  // Se a rodada já foi DELIVERED (admin clicou "Aprovar e entregar" ou cron rodou),
  // lemos as variações salvas — IMUTÁVEIS — em vez de recalcular a cada visita.
  // Isto resolve a sensação de "as variações ficam mudando sozinhas".
  const effectiveRoundForDb =
    roundData.source === "api" && roundData.meta ? roundData.meta.round : (round ?? 0);
  const dbRound = effectiveRoundForDb > 0
    ? await loadDeliveredRound(season, effectiveRoundForDb).catch(() => null)
    : null;

  if (dbRound && dbRound.status === "DELIVERED" && dbRound.variations.length > 0) {
    return await renderFromDb({
      season,
      dbRound: dbRound as DbRound,
      badgeMap,
    });
  }
  // ── Fim do branch DB-first ────────────────────────────────────────

  // Run engine
  const allScored = roundData.matches.map(scoreMatch);

  const anchors = selectAnchorsFromScored(allScored);
  const anchorIds = new Set(anchors.map((a) => a.id));
  const pool = allScored.filter((m) => !anchorIds.has(m.id));
  const variationsResult = generateVariations({ anchors, pool });

  // ── Camada cognitiva: LER do DB (pré-computado pelo cron) ──
  // LLM NUNCA roda no SSR. O cron /api/cron/judge-variations popula a tabela.
  const effectiveRound =
    roundData.source === "api" && roundData.meta ? roundData.meta.round : (round ?? 0);

  const judgement = await prisma.variationJudgement
    .findUnique({ where: { season_round: { season, round: effectiveRound } } })
    .catch(() => null);

  let enrichments: VariationEnrichment[];
  let replacements: VariationReplacement[] = [];
  let aiProvider: JudgeResult["provider"] = "heuristic";

  if (judgement) {
    const payload = judgement.payload as unknown as {
      enrichments: VariationEnrichment[];
      replacements?: VariationReplacement[];
    };
    enrichments = payload.enrichments;
    replacements = payload.replacements ?? [];
    aiProvider = judgement.provider as JudgeResult["provider"];
    console.log(
      `[BOB/Variacoes] análise pré-computada: ${aiProvider} (${replacements.filter((r) => r.approved).length}/${replacements.length} subs aprovadas)`,
    );
  } else {
    // Fallback instantâneo (sem LLM, sem latência)
    enrichments = variationsResult.variations.map((v) =>
      quickHeuristicEnrichment({
        id: v.id,
        combinedOdd: v.combinedOdd,
        legCount: v.legCount,
        anchorPrimaryCount: v.anchorPrimaryCount,
      }),
    );
    console.log(
      `[BOB/Variacoes] sem análise pré-computada — usando heurística rápida. Rode /api/cron/judge-variations.`,
    );
  }

  const enrichmentMap = new Map(enrichments.map((e) => [e.variationId, e]));
  const approvedReplacementsByVariation = new Map<string, VariationReplacement>();
  replacements.filter((r) => r.approved).forEach((r) => approvedReplacementsByVariation.set(r.variationId, r));

  // Convert variations to view
  const variations: VariationView[] = variationsResult.variations.map((v) => {
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
      homeBadge: resolveBadge(leg.homeTeam, badgeMap),
      awayBadge: resolveBadge(leg.awayTeam, badgeMap),
    }));

    const meta = variationTitle(v.id);
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
    // Enriquecer com análise LLM (ou heurística fallback)
    const enrichment = enrichmentMap.get(v.id);
    if (enrichment) {
      view.shortJustification = enrichment.keyInsight;
      view.detailedJustification = enrichment.bobNarrative;
      view.alerts = [...(v.transparencyNotes ?? []), ...enrichment.riskAlerts];
    } else {
      view.shortJustification = buildShortJustification(view, anchors.length);
      view.detailedJustification = buildDetailedJustification(view);
    }
    return view;
  });

  // Anchors view
  const anchorsView: AnchorView[] = anchors.map((a) => {
    const outcome = a.suggestedResult === "1" ? "Home" : a.suggestedResult === "2" ? "Away" : "Draw";
    return {
      matchId: a.id,
      homeTeam: a.homeTeam,
      awayTeam: a.awayTeam,
      pick: outcome as "Home" | "Draw" | "Away",
      pickLabel: pickLabel(outcome as "Home" | "Draw" | "Away", a.homeTeam, a.awayTeam),
      type: classifyAnchorType((a as { anchorScore?: number }).anchorScore ?? 0, Boolean((a as { isClassico?: boolean }).isClassico)),
      confidence: a.score,
      reason: buildAnchorReason(a),
      risks: ((a as { calibrationAlerts?: string[] }).calibrationAlerts ?? []).slice(0, 3),
      homeBadge: resolveBadge(a.homeTeam, badgeMap),
      awayBadge: resolveBadge(a.awayTeam, badgeMap),
    };
  });

  // Audit
  const audit = buildAudit(variations);

  // Round info
  const difficulty = analyzeRoundDifficulty(allScored);
  const { label: firstMatch, cutoff } = roundData.source === "api" && roundData.meta
    ? formatFirstMatch(roundData.meta.firstMatchAt)
    : { label: DEMO_FIRST_MATCH, cutoff: DEMO_CUTOFF };

  const roundLabel = roundData.source === "api" && roundData.meta
    ? `Rodada ${roundData.meta.round} · ${roundData.meta.season}`
    : DEMO_ROUND_LABEL;

  const difficultyLabel =
    difficulty.difficulty === "easy" ? "Rodada favorável" :
    difficulty.difficulty === "balanced" ? "Rodada equilibrada" :
    "Rodada delicada";

  const roundView: RoundView = {
    label: roundLabel,
    source: roundData.source,
    firstMatch,
    cutoff,
    totalMatches: allScored.length,
    difficulty: difficulty.difficulty,
    difficultyLabel,
    bobMessage: difficulty.bobMessage,
    aiProvider,
  };

  return (
    <VariacoesClient
      round={roundView}
      anchors={anchorsView}
      variations={variations}
      audit={audit}
    />
  );
}
