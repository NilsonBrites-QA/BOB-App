import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { scoreMatch } from "@/lib/bob/engine";
import type {
  VariationEnrichment,
  VariationReplacement,
  JudgeResult,
} from "@/lib/bob/engine/variation-judge";
import { analyzeRoundDifficulty } from "@/lib/bob/engine/round-analyzer";
import { loadOfficialRoundData, resolveOfficialRoundContext } from "@/lib/bob/round-loader";
import { loadDeliveredRound } from "@/lib/bob/persist";
import { loadAllBadgesFromDb, resolveBadge } from "@/lib/badges/badge-service";
import { DEMO_ROUND_LABEL, DEMO_FIRST_MATCH, DEMO_CUTOFF } from "@/lib/bob/demo-matches";
import { isRealDataSource } from "@/lib/bob/data/source-policy";
import { buildOfficialVariationsPipeline } from "@/lib/bob/analytics/official-variation-pipeline";
import { VariacoesClient } from "./variacoes-client";
import type { VariationView, AnchorView, AuditView, RoundView, VariationLeg } from "./variacoes-client";

// ISR de 5 min: leitura do DB é instantânea (~30ms).
// Preferência DB-first; se não houver snapshot, o Motor Oficial pode montar candidato
// e exigir revisão cognitiva antes de exibir como geração oficial.
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
    const fmt = new Intl.DateTimeFormat("pt-BR", opts);
    const toParts = (date: Date) => {
      const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
      return `${p.weekday} ${p.day} ${p.month} · ${p.hour}:${p.minute}`;
    };
    const label = toParts(d);
    const cutoffDate = new Date(d.getTime() - 60 * 60 * 1000);
    const cutoff = toParts(cutoffDate);
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
    aiProvider:    "none",
  };

  console.info(`[BOB/Variacoes] source=cache status=loaded_snapshot round=${dbRound.number} version=${(dbRound as { version?: number }).version ?? 1}`);

  return (
    <VariacoesClient
      round={roundView}
      anchors={anchorsView}
      variations={variations}
      audit={audit}
    />
  );
}

function renderInsufficientData(
  reason: string,
  context?: {
    season: number;
    round: number | null;
    source: string;
    fixturesCount?: number;
    firstMatchAt?: string | null;
  },
) {
  const hasRealRound = Boolean(context?.round && context.round > 0);
  const { label: firstMatch, cutoff } = hasRealRound
    ? formatFirstMatch(context?.firstMatchAt ?? null)
    : { label: DEMO_FIRST_MATCH, cutoff: DEMO_CUTOFF };
  const audit: AuditView = {
    status: "APPROVED_WITH_ALERTS",
    passed: false,
    alerts: [
      reason === "missing_round_dataset"
        ? "dados da rodada não conectados ao motor"
        : reason === "blind_replay_available"
          ? "rodada passada sem snapshot oficial carregado"
          : reason === "missing_llm_review"
            ? "revisão cognitiva LLM pendente ou indisponível"
            : reason === "llm_review_rejected" || reason === "critical_data_requested_by_llm"
              ? "revisão cognitiva bloqueou a entrega oficial"
              : "dados insuficientes para geração responsável",
    ],
    warnings: [reason],
    checks: [
      { label: "Dataset real da rodada disponível", ok: false },
      { label: "Geração oficial bloqueada", ok: true },
    ],
  };

  const roundView: RoundView = {
    label: hasRealRound ? `Rodada ${context!.round} · ${context!.season}` : DEMO_ROUND_LABEL,
    source: context && context.source !== "demo" ? "api" : "demo",
    firstMatch,
    cutoff,
    totalMatches: context?.fixturesCount ?? 0,
    difficulty: "hard",
    difficultyLabel: reason === "missing_round_dataset"
      ? "Dados da rodada não conectados ao motor"
      : reason === "blind_replay_available"
        ? "Rodada passada — replay cego disponível"
        : reason === "missing_llm_review"
          ? "Revisão cognitiva pendente"
          : reason === "llm_review_rejected" || reason === "critical_data_requested_by_llm"
            ? "Revisão cognitiva bloqueou entrega"
            : "Dados insuficientes",
    bobMessage: reason === "invalid_round_context"
      ? "Geração oficial bloqueada: a rodada recebida é inválida para o motor."
      : reason === "missing_round_dataset"
        ? "Geração oficial bloqueada: a rodada foi resolvida, mas o dataset dessa rodada ainda não está disponível para o motor."
        : reason === "blind_replay_available"
          ? "Rodada passada solicitada. Nenhum snapshot oficial histórico foi encontrado; o replay cego pode ser executado em etapa própria."
          : reason === "missing_llm_review"
            ? "Geração oficial bloqueada: o pacote analítico foi montado, mas a revisão cognitiva LLM obrigatória não aprovou a entrega."
            : reason === "llm_review_rejected" || reason === "critical_data_requested_by_llm"
              ? "Geração oficial bloqueada: a revisão cognitiva encontrou risco ou dado crítico ausente."
              : "Geração oficial bloqueada: o dataset real ainda não tem cobertura suficiente para uma geração responsável.",
    aiProvider: "none",
  };

  return (
    <VariacoesClient
      round={roundView}
      anchors={[]}
      variations={[]}
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
  const parsedSeason = params.season ? parseInt(params.season, 10) : new Date().getFullYear();
  const season = Number.isInteger(parsedSeason) && parsedSeason >= 2000 ? parsedSeason : new Date().getFullYear();
  const requestedRound = params.round ? parseInt(params.round, 10) : null;
  const roundContext = await resolveOfficialRoundContext({ season, round: requestedRound });

  if (!roundContext.ok) {
    console.warn(`[BOB/Variacoes] blocked reason=invalid_round_context received_round=${roundContext.receivedRound ?? "missing"}`);
    return renderInsufficientData("invalid_round_context", {
      season,
      round: null,
      source: roundContext.source,
      fixturesCount: 0,
      firstMatchAt: null,
    });
  }

  console.info(
    `[BOB/Variacoes] round_context season=${roundContext.season} round=${roundContext.round} source=${roundContext.source} fixtures=${roundContext.fixturesCount}`,
  );

  if (roundContext.roundMode === "past" && roundContext.requestedRound !== null) {
    const badgeMap = await loadAllBadgesFromDb();
    const historicalRound = await loadDeliveredRound(roundContext.season, roundContext.round).catch(() => null);
    if (historicalRound && historicalRound.status === "DELIVERED" && historicalRound.variations.length > 0) {
      return await renderFromDb({
        season: roundContext.season,
        dbRound: historicalRound as DbRound,
        badgeMap,
      });
    }
    console.warn(`[BOB/Variacoes] blocked reason=blind_replay_available round=${roundContext.round}`);
    return renderInsufficientData("blind_replay_available", {
      season: roundContext.season,
      round: roundContext.round,
      source: roundContext.source,
      fixturesCount: roundContext.fixturesCount,
      firstMatchAt: roundContext.firstMatchAt,
    });
  }

  const roundData = await loadOfficialRoundData(roundContext);
  console.info(
    `[BOB/Variacoes] dataset_loaded round=${roundContext.round} matches=${roundData.matches.length} source=${roundData.source}`,
  );

  if (!isRealDataSource(roundData.source)) {
    console.warn(`[BOB/Variacoes] blocked reason=missing_round_dataset round=${roundContext.round}`);
    return renderInsufficientData("missing_round_dataset", {
      season: roundContext.season,
      round: roundContext.round,
      source: roundData.source,
      fixturesCount: roundContext.fixturesCount,
      firstMatchAt: roundContext.firstMatchAt,
    });
  }

  if (roundData.matches.length === 0) {
    console.warn(`[BOB/Variacoes] blocked reason=missing_round_dataset round=${roundContext.round}`);
    return renderInsufficientData("missing_round_dataset", {
      season: roundContext.season,
      round: roundContext.round,
      source: roundData.source,
      fixturesCount: 0,
      firstMatchAt: roundContext.firstMatchAt,
    });
  }

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
  const effectiveRoundForDb = roundContext.round;
  const dbRound = await loadDeliveredRound(roundContext.season, effectiveRoundForDb).catch(() => null);

  if (dbRound && dbRound.status !== "SUPERSEDED" && dbRound.variations.length > 0) {
    return await renderFromDb({
      season: roundContext.season,
      dbRound: dbRound as DbRound,
      badgeMap,
    });
  }
  // ── Fim do branch DB-first ────────────────────────────────────────

  const effectiveRound = roundContext.round;
  const pipeline = await buildOfficialVariationsPipeline({
    matches: roundData.matches,
    source: roundData.source,
    round: effectiveRound,
    season: roundContext.season,
    roundContext: {
      season: roundContext.season,
      round: effectiveRound,
      competition: roundContext.competition,
      source: roundContext.source,
      reason: roundContext.reason,
      fixturesCount: roundContext.fixturesCount,
      firstKickoffAt: roundContext.firstKickoffAt,
      roundMode: roundContext.roundMode,
    },
    sourceSnapshotIds: [`round:${roundContext.season}:${effectiveRound}:${roundData.source}`],
  });

  if (!pipeline.ok || !pipeline.variationsResult) {
    return renderInsufficientData(pipeline.reason ?? "Dados insuficientes para gerar as 5 Variações oficiais.", {
      season: roundContext.season,
      round: roundContext.round,
      source: roundData.source,
      fixturesCount: roundData.matches.length,
      firstMatchAt: roundContext.firstMatchAt,
    });
  }

  const allScored = roundData.matches.map(scoreMatch);
  const anchors = pipeline.anchors;
  const variationsResult = pipeline.variationsResult;

  // ── Enriquecimento editorial legado: LER do DB quando existir ──
  // A aprovação oficial do pacote já ocorreu no pipeline via cognitive review.
  const judgement = await prisma.variationJudgement
    .findUnique({ where: { season_round: { season: roundContext.season, round: effectiveRound } } })
    .catch(() => null);

  let enrichments: VariationEnrichment[];
  let replacements: VariationReplacement[] = [];
  let aiProvider: RoundView["aiProvider"] = "none";

  if (judgement) {
    const payload = judgement.payload as unknown as {
      enrichments: VariationEnrichment[];
      replacements?: VariationReplacement[];
    };
    enrichments = payload.enrichments;
    replacements = payload.replacements ?? [];
    aiProvider = judgement.provider as JudgeResult["provider"];
    console.log(
      `[BOB/Variacoes] source=cache status=loaded_judgement provider=${aiProvider} round=${effectiveRound} approved_replacements=${replacements.filter((r) => r.approved).length}/${replacements.length}`,
    );
  } else {
    // Enriquecimento diagnóstico instantâneo: não escolhe picks nem gera Variações.
    enrichments = variationsResult.variations.map((v) =>
      quickHeuristicEnrichment({
        id: v.id,
        combinedOdd: v.combinedOdd,
        legCount: v.legCount,
        anchorPrimaryCount: v.anchorPrimaryCount,
      }),
    );
    console.log(
      `[BOB/Variacoes] source=diagnostic status=missing_judgement round=${effectiveRound} enrichment=deterministic_text_only`,
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
  const { label: firstMatch, cutoff } = roundData.meta
    ? formatFirstMatch(roundData.meta.firstMatchAt)
    : { label: DEMO_FIRST_MATCH, cutoff: DEMO_CUTOFF };

  const roundLabel = `Rodada ${roundContext.round} · ${roundContext.season}`;

  const difficultyLabel =
    difficulty.difficulty === "easy" ? "Rodada favorável" :
    difficulty.difficulty === "balanced" ? "Rodada equilibrada" :
    "Rodada delicada";

  const roundView: RoundView = {
    label: roundLabel,
    source: isRealDataSource(roundData.source) ? "api" : "demo",
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
