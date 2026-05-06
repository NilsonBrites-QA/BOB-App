import { Suspense } from "react";
import { NarrativeSection, NarrativeSkeleton } from "@/components/narrative-section";
import { ReflectionCard, ReflectionCardSkeleton } from "@/components/reflection-card";
import { GlossarySection } from "@/components/glossary";
import { AberturaDiariaBanner } from "@/components/abertura-diaria-banner";
import { PageHero } from "@/components/page-hero";
import { scoreMatch } from "@/lib/bob/engine";
import { analyzeRoundDifficulty } from "@/lib/bob/engine/round-analyzer";
import { detectZebras, type ZebraOpportunity } from "@/lib/bob/engine/zebra-detector";
import { demoMatches, DEMO_ROUND_LABEL, DEMO_FIRST_MATCH, DEMO_CUTOFF } from "@/lib/bob/demo-matches";
import { BOB_COPY } from "@/lib/bob/personality";
import { TeamIdentity } from "@/components/team-identity";
import { describeRoundFallback, loadRoundData, resolveCurrentRound } from "@/lib/bob/round-loader";
import { loadDeliveredRound } from "@/lib/bob/persist";
import { loadAllBadgesFromDb, resolveBadge } from "@/lib/badges/badge-service";
import type { Variation } from "@/lib/bob/types";
import type { Variation as BeamVariation, TicketLeg } from "@/lib/bob/engine/beam-search";
import { buildOfficialVariationsPipeline } from "@/lib/bob/analytics/official-variation-pipeline";

// ISR de 5 min: leitura do DB é instantânea (~30ms).
// Variações congeladas NUNCA mudam entre requests.
export const revalidate = 300;

// ─── Helper: converter beam-search variation para formato legado ─────────────

function convertBeamToLegacy(beamVar: BeamVariation): Variation {
  const titles: Record<string, string> = {
    V1: "Segurança", V2: "Equilíbrio", V3: "Lógica Pura", V4: "Curta de pressão", V5: "Extrema",
  };
  const postures: Record<string, string> = {
    V1: "Conservadora", V2: "Moderada", V3: "Neutra", V4: "Agressiva", V5: "Máxima agressão",
  };
  
  return {
    id: beamVar.id,
    title: titles[beamVar.id] || `Variação ${beamVar.id}`,
    posture: postures[beamVar.id] || "Neutra",
    projectedOdd: beamVar.combinedOdd,
    gameCount: beamVar.legCount,
    anchorsTogether: beamVar.anchorPrimaryCount >= 3,
    summary: beamVar.transparencyNotes?.[0] || `${beamVar.legCount} jogos selecionados`,
    picks: beamVar.legs.map((leg: TicketLeg) => ({
      fixtureId: leg.matchId,
      match: `${leg.homeTeam} x ${leg.awayTeam}`,
      result: leg.pickOutcome === "Home" ? "1" : leg.pickOutcome === "Away" ? "2" : "X" as "1" | "X" | "2",
      odd: leg.pickOdd,
      isAnchor: leg.isAnchor,
    })),
    oddsClass: beamVar.oddsClass,
    oddsClassLabel: beamVar.oddsClassLabel,
  };
}

// ─── Helper: formata ISO date → "Sáb, 12 Abr · 16:00" ───────────────────────

function formatFirstMatch(isoDate: string | null): { label: string; cutoff: string } {
  if (!isoDate) return { label: "Data a definir pelo CBF", cutoff: "1h antes do primeiro jogo" };
  try {
    const d = new Date(isoDate);
    const label = d.toLocaleString("pt-BR", {
      weekday: "short",
      day:     "numeric",
      month:   "short",
      hour:    "2-digit",
      minute:  "2-digit",
      timeZone: "America/Sao_Paulo",
    }).replace(",", " ·");
    // Cutoff = 1h antes
    const cutoffDate = new Date(d.getTime() - 60 * 60 * 1000);
    const cutoff = cutoffDate.toLocaleString("pt-BR", {
      weekday: "short",
      day:     "numeric",
      month:   "short",
      hour:    "2-digit",
      minute:  "2-digit",
      timeZone: "America/Sao_Paulo",
    }).replace(",", " ·");
    return { label, cutoff };
  } catch {
    return { label: "Data a definir pelo CBF", cutoff: "1h antes do primeiro jogo" };
  }
}

function describeIntegration(label: string, status: string) {
  if (status === "live" || status === "ready") return `${label} pronto`;
  if (status === "partial") return `${label} parcial`;
  if (status === "empty") return `${label} vazio`;
  return `${label} em fallback`;
}

// ─── Helper: extrai nomes de time a partir de pick.match ("Team A x Team B") ─
function splitTeamNames(match: string): [string, string] {
  const parts = match.split(/\s+[x×]\s+/i);
  return [(parts[0] ?? "").trim(), (parts[1] ?? "").trim()];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; round?: string; excluded?: string }>;
}) {
  const params = await searchParams;
  const paramSeason   = params.season   ? parseInt(params.season, 10) : new Date().getFullYear();
  const paramRound    = params.round    ? parseInt(params.round,  10) : null;
  const excludedParam = params.excluded ?? "";
  const excludedIds   = new Set(excludedParam ? excludedParam.split(",").filter(Boolean) : []);

  const roundData = await loadRoundData(paramSeason, paramRound);

  // ── CORREÇÃO CRÍTICA: Carregar escudos do banco (DB-first, PRD §9) ──
  // Substitui o antigo crestMap que dependia de URLs vindas da API externa.
  // Uma única query carrega TODOS os times. Zero chamadas externas.
  const badgeMap = await loadAllBadgesFromDb();

  // ── CORREÇÃO CRÍTICA: Verificar se há variações CONGELADAS no banco ──
  // Antes: scoreMatch() + generateVariations() rodava em todo SSR, gerando
  // variações diferentes a cada F5 (violação de RN-07 e conceito de
  // "Orquestrador Cognitivo Determinístico").
  // Agora: lemos as variações imutáveis do banco (DELIVERED).
  // O motor SÓ roda se não houver rodada congelada (draft/demo).
  //
  // TAREFA 2: Quando o round loader cai em demo (API indisponível), usamos
  // resolveCurrentRound() para tentar resolver a rodada via banco (L2).
  // Isso garante que variações congeladas apareçam mesmo sem API.
  let effectiveRound: number;
  let calendarInterrupted = false;

  if (roundData.source === "api" && roundData.meta) {
    effectiveRound = roundData.meta.round;
  } else if (paramRound) {
    effectiveRound = paramRound;
  } else {
    // API falhou — tentar resolver a rodada via cascata L1→L2→L3
    const resolution = await resolveCurrentRound(paramSeason);
    effectiveRound = resolution.round;
    calendarInterrupted = resolution.resolvedBy === "database";
    if (calendarInterrupted) {
      console.info(`[Dashboard] ${resolution.auditMessage}`);
    }
  }

  const dbRound = effectiveRound > 0
    ? await loadDeliveredRound(paramSeason, effectiveRound).catch(() => null)
    : null;

  // ── Caminho 1: Variações congeladas do banco (IDEAL — determinístico) ──
  const hasDelivered = dbRound && dbRound.status === "DELIVERED" && dbRound.variations?.length > 0;

  let variations: Variation[];
  let anchorsForDisplay: Array<{
    id: string; homeTeam: string; awayTeam: string; score: number;
    reasons: string[]; homeCrest: string | null; awayCrest: string | null;
    suggestedResult: string; factorBreakdown?: unknown[];
    isMarginalAnchor?: boolean;
  }>;
  let allScoredCount: number;
  let roundLabel: string;
  let firstMatch: string;
  let cutoff: string;
  let integrationMeta: unknown = null;
  let degradedIntegrations: string[] = [];
  let resolvedRound: number | null = null;
  let resolvedSeason: number | null = null;

  if (hasDelivered) {
    // ── DB-FIRST: variações imutáveis (mesmo comportamento do /variacoes) ──
    console.log(`[Dashboard] Renderizando variações congeladas da rodada ${effectiveRound} v${(dbRound as { version?: number }).version ?? 1}`);

    variations = (dbRound.variations ?? []).map((v: { code: string; title: string; posture: string; projectedOdd: number; gameCount: number; anchorsTogether?: boolean; summary: string; picks: Array<{ fixtureId?: string; match: string; result: string; odd: number; isAnchor: boolean }> }) => ({
      id: v.code ?? "V?",
      title: v.title,
      posture: v.posture,
      projectedOdd: v.projectedOdd,
      gameCount: v.gameCount,
      anchorsTogether: v.anchorsTogether ?? false,
      summary: v.summary,
      picks: (v.picks ?? []).map((p) => {
        const resultMap: Record<string, "1" | "X" | "2"> = { HOME: "1", DRAW: "X", AWAY: "2" };
        return {
          fixtureId: p.fixtureId ?? undefined,
          match: p.match,
          result: resultMap[p.result] ?? "1" as "1" | "X" | "2",
          odd: p.odd,
          isAnchor: p.isAnchor,
        };
      }),
    }));

    anchorsForDisplay = (dbRound.anchors ?? []).map((a: { id: string; team: string; opponent: string; score: number; reasons: unknown }) => ({
      id: `anchor-${a.id}`,
      homeTeam: a.team,
      awayTeam: a.opponent,
      score: a.score,
      reasons: Array.isArray(a.reasons) ? a.reasons.map(String) : [],
      homeCrest: resolveBadge(a.team, badgeMap),
      awayCrest: resolveBadge(a.opponent, badgeMap),
      suggestedResult: "1",
    }));

    allScoredCount = dbRound.variations?.[0]?.picks?.length ?? 10;
    roundLabel = `Rodada ${dbRound.number} · ${paramSeason}`;
    const fmResult = dbRound.firstMatchAt
      ? formatFirstMatch(dbRound.firstMatchAt.toISOString())
      : { label: DEMO_FIRST_MATCH, cutoff: DEMO_CUTOFF };
    firstMatch = fmResult.label;
    cutoff = fmResult.cutoff;
    resolvedRound = dbRound.number;
    resolvedSeason = paramSeason;
  } else {
    // ── Caminho 2: Motor on-the-fly (apenas para draft/demo sem rodada entregue) ──
    // NOTA: Este caminho existe apenas como fallback para quando o admin ainda não
    // congelou a rodada. As variações geradas aqui NÃO são as oficiais.
    console.log(`[Dashboard] Sem rodada congelada — gerando variações on-the-fly (não oficial)`);

    const filteredMatches = roundData.matches.filter((match) => !excludedIds.has(match.id));
    const pipeline = await buildOfficialVariationsPipeline({
      matches: filteredMatches,
      source: roundData.source,
      round: effectiveRound,
      sourceSnapshotIds: [`dashboard:${paramSeason}:${effectiveRound}:${roundData.source}`],
    });
    if (pipeline.ok && pipeline.variationsResult) {
      variations = (pipeline.variationsResult.variations as BeamVariation[]).map(convertBeamToLegacy);
      anchorsForDisplay = pipeline.anchors.map((a) => ({
        ...a,
        reasons: a.reasons ?? [],
        homeCrest: resolveBadge(a.homeTeam, badgeMap),
        awayCrest: resolveBadge(a.awayTeam, badgeMap),
      }));
    } else {
      console.info(`[Dashboard] Motor oficial bloqueado: ${pipeline.reason ?? pipeline.status}`);
      variations = [];
      anchorsForDisplay = [];
    }
    allScoredCount = filteredMatches.length;

    roundLabel = roundData.source === "api" && roundData.meta
      ? `Rodada ${roundData.meta.round} · ${roundData.meta.season}`
      : DEMO_ROUND_LABEL;
    const fmResult = roundData.source === "api" && roundData.meta
      ? formatFirstMatch(roundData.meta.firstMatchAt)
      : { label: DEMO_FIRST_MATCH, cutoff: DEMO_CUTOFF };
    firstMatch = fmResult.label;
    cutoff = fmResult.cutoff;

    integrationMeta = roundData.source === "api" && roundData.meta ? roundData.meta.integrations : null;
    degradedIntegrations = integrationMeta
      ? [
          (integrationMeta as Record<string, string>).odds !== "live" ? describeIntegration("odds", (integrationMeta as Record<string, string>).odds) : null,
          (integrationMeta as Record<string, string>).h2h !== "live" ? describeIntegration("H2H", (integrationMeta as Record<string, string>).h2h) : null,
          (integrationMeta as Record<string, string>).injuries !== "live" ? describeIntegration("desfalques", (integrationMeta as Record<string, string>).injuries) : null,
          (integrationMeta as Record<string, string>).cup !== "live" ? describeIntegration("copas", (integrationMeta as Record<string, string>).cup) : null,
          (integrationMeta as Record<string, string>).assets !== "ready" ? describeIntegration("escudos", (integrationMeta as Record<string, string>).assets) : null,
          (integrationMeta as Record<string, string>).weather !== "live" ? describeIntegration("clima", (integrationMeta as Record<string, string>).weather) : null,
        ].filter((value): value is string => Boolean(value))
      : [];

    resolvedRound = roundData.source === "api" ? roundData.meta.round : null;
    resolvedSeason = roundData.source === "api" ? roundData.meta.season : null;
  }

  // ── Construir mapa de badges para os componentes de variação ──
  // Extrai todos os nomes de time das variações e resolve contra o badgeMap.
  const teamBadges: Record<string, string | null> = {};
  for (const v of variations) {
    for (const pick of v.picks) {
      const [home, away] = splitTeamNames(pick.match);
      if (home && !(home in teamBadges)) teamBadges[home] = resolveBadge(home, badgeMap);
      if (away && !(away in teamBadges)) teamBadges[away] = resolveBadge(away, badgeMap);
    }
  }

  // Detect zebra opportunities (usa matches da API quando disponível)
  const sourceMatchesForZebra = !hasDelivered
    ? roundData.matches.filter((m) => !excludedIds.has(m.id))
    : demoMatches.filter((m) => !excludedIds.has(m.id));
  const zebras: ZebraOpportunity[] = !hasDelivered && sourceMatchesForZebra.length > 0
    ? detectZebras(sourceMatchesForZebra, 3)
    : [];

  // Dificuldade da rodada
  const roundDifficulty = !hasDelivered
    ? analyzeRoundDifficulty(roundData.matches.map(scoreMatch))
    : { difficulty: "balanced" as const, difficultyScore: 50, bobMessage: "Variações congeladas — determinismo garantido.", reasons: ["Rodada entregue e congelada"] };
  const anchorTarget = Math.min(4, allScoredCount);

  // Mensagem de abertura diária do BOB (wiring BOB_FAITH)
  const greeterRound = resolvedRound ?? 15; // fallback para demo rodada 15
  const aberturaMensagem = BOB_COPY.aberturaDiaria(greeterRound);
  const heroChips = [
    {
      label: hasDelivered ? "Variações oficiais" : (roundData.source === "api" ? "Dados ao vivo" : "Modo demonstrativo"),
      tone: hasDelivered ? ("accent" as const) : (roundData.source === "api" ? ("accent" as const) : ("signal" as const)),
    },
    {
      label: `${anchorsForDisplay.length} âncoras ativas`,
      tone: "neutral" as const,
    },
    excludedIds.size > 0
      ? {
          label: `${excludedIds.size} exclusão${excludedIds.size > 1 ? "ões" : ""} aplicada${excludedIds.size > 1 ? "s" : ""}`,
          tone: "signal" as const,
        }
      : null,
    !hasDelivered && integrationMeta
      ? {
          label: (integrationMeta as Record<string, string>).odds === "live" ? "Odds reais" : "Odds em fallback",
          tone: (integrationMeta as Record<string, string>).odds === "live" ? ("neutral" as const) : ("signal" as const),
        }
      : null,
  ].filter((value): value is NonNullable<typeof value> => Boolean(value));

  const heroMetrics = [
    { label: "Primeiro jogo", value: firstMatch, note: "abertura oficial da rodada" },
    { label: "Janela final", value: cutoff, note: "último ajuste antes do apito" },
    { label: "Âncoras", value: `${anchorsForDisplay.length} de ${anchorTarget}`, note: "base principal do portfólio" },
    { label: "Cenários", value: `${variations.length}`, note: "roteiros prontos para entrar" },
  ];

  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
      {/* Abertura diária — Client Component, exibe só na 1ª visita em 24h */}
      <AberturaDiariaBanner message={aberturaMensagem} />

      <PageHero
        eyebrow="Brasileirão Série A · painel premium da rodada"
        title={roundLabel}
        description={`${anchorsForDisplay.length} âncoras em destaque, ${variations.length} cenários prontos e ${allScoredCount} jogos no radar do BOB.`}
        chips={heroChips}
        metrics={heroMetrics}
        aside={(() => {
          const diffColors = {
            easy:     { border: "border-emerald-200/80", badge: "bg-emerald-100 text-emerald-700", text: "text-emerald-900 dark:text-emerald-100" },
            balanced: { border: "border-sky-200/80", badge: "bg-sky-100 text-sky-700", text: "text-sky-900 dark:text-sky-100" },
            hard:     { border: "border-amber-200/80", badge: "bg-amber-100 text-amber-700", text: "text-amber-900 dark:text-amber-100" },
          };
          const c = diffColors[roundDifficulty.difficulty];
          const label = roundDifficulty.difficulty === "easy"
            ? "Rodada favorável"
            : roundDifficulty.difficulty === "balanced"
              ? "Rodada equilibrada"
              : "Rodada delicada";

          return (
            <div className={`rounded-[28px] border bg-background/55 px-5 py-5 backdrop-blur ${c.border}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${c.badge}`}>
                  {label}
                </span>
                <span className={`text-sm font-medium ${c.text}`}>
                  Leitura {roundDifficulty.difficultyScore}/100
                </span>
              </div>
              <p className={`mt-3 text-sm leading-6 ${c.text}`}>{roundDifficulty.bobMessage}</p>
              <p className="mt-3 text-xs leading-6 text-muted">
                {roundDifficulty.reasons.join(" · ")}
              </p>
            </div>
          );
        })()}
      />

      {/* Banner de sinal de calendário interrompido — específico para L2 fallback */}
      {!hasDelivered && calendarInterrupted && (
        <div className="rounded-[24px] border border-amber-400/30 bg-amber-50/80 dark:bg-amber-950/20 px-5 py-4 text-sm text-foreground">
          <p className="font-semibold text-amber-700 dark:text-amber-400">
            ⚡ Sinal de calendário interrompido
          </p>
          <p className="mt-1 leading-6 text-muted">
            O provedor de calendário não respondeu — exibindo a rodada {effectiveRound} (última conhecida no banco).
            O BOB retomará a leitura ao vivo assim que o sinal se restabelecer.
          </p>
        </div>
      )}

      {/* Banner de modo demo ou degradação — SÓ aparece quando NÃO há rodada congelada */}
      {!hasDelivered && !calendarInterrupted && (roundData.source === "demo" || degradedIntegrations.length > 0) && (
        <div className="rounded-[24px] border border-signal/25 bg-signal/8 px-5 py-4 text-sm text-foreground">
          <p className="font-semibold text-signal">
            {roundData.source === "demo" ? "Leitura em modo demonstrativo" : "Leitura ao vivo com cobertura parcial"}
          </p>
          <p className="mt-1 leading-6 text-muted">
            {roundData.source === "demo"
              ? describeRoundFallback(roundData.fallbackReason)
              : `As integrações desta rodada chegaram com cobertura parcial: ${degradedIntegrations.join(" · ")}.`}
          </p>
        </div>
      )}

      {/* Banner de variações congeladas — quando DB-first está ativo */}
      {hasDelivered && (
        <div className="rounded-[24px] border border-accent/25 bg-accent/5 px-5 py-4 text-sm text-foreground">
          <p className="font-semibold text-accent-strong">
            ✓ Variações oficiais da rodada
          </p>
          <p className="mt-1 leading-6 text-muted">
            Estas variações foram geradas, analisadas e congeladas pelo BOB. Elas são idênticas para todos os usuários e não mudam ao recarregar a página.
          </p>
        </div>
      )}

      {/* ── Variações: CTA que leva à página dedicada ── */}
      <section className="bob-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-left">
            <p className="kicker text-xs text-muted text-left">Portfólio BOB da rodada</p>
            <h2 className="mt-1 text-2xl font-semibold text-left">5 cenários Big Odds prontos</h2>
            <p className="mt-2 text-sm leading-6 text-muted max-w-xl text-left">
              {anchorsForDisplay.length} âncoras analisadas · {variations.length} variações geradas · odd combinada mínima 900x ·
              mínimo 5 jogos por cenário. O BOB escolhe e justifica cada pick.
            </p>
          </div>
          <a
            href="/variacoes"
            className="bob-btn-primary inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold"
          >
            Ver variações completas →
          </a>
        </div>
      </section>

      {/* ── Oportunidades de Zebra (apenas quando não congelado — dados ao vivo) ── */}
      {zebras.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="kicker text-xs text-muted">Oportunidade de Zebra</p>
              <h2 className="mt-1 text-2xl font-semibold">⚡ Oportunidade de Zebra</h2>
            </div>
            <span className="rounded-full border border-signal/25 bg-signal/5 px-3 py-1 text-xs font-medium text-signal">
              {zebras.length} jogo{zebras.length > 1 ? "s" : ""} no radar
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {zebras.map((z) => (
               <div
                 key={z.matchId}
                 className="panel panel-hover rounded-[22px] border border-signal/20 bg-signal/5 p-5 space-y-3"
               >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1.5">
                    <TeamIdentity
                      teamName={z.homeTeam}
                      badgeUrl={resolveBadge(z.homeTeam, badgeMap)}
                      badgeSize={22}
                      className="min-w-0"
                      nameClassName="text-sm font-semibold"
                      subtitle={`Mandante \u00b7 ${z.homePosition}\u00ba na tabela`}
                    />
                    <div className="flex items-center gap-2 pl-1">
                      <span className="h-px w-3 shrink-0 bg-border/80" />
                      <TeamIdentity
                        teamName={z.awayTeam}
                        badgeUrl={resolveBadge(z.awayTeam, badgeMap)}
                        badgeSize={22}
                        className="min-w-0"
                        nameClassName="text-sm font-medium"
                        subtitle={`Visitante \u00b7 ${z.awayPosition}\u00ba na tabela`}
                      />
                    </div>
                  </div>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-signal/15">
                    <span className="font-mono text-xs font-bold text-signal">{z.zebraScore}</span>
                  </div>
                </div>
                {z.homeOdd > 0 && (
                  <p className="text-xs text-muted">
                    Odd do mandante:{" "}
                    <span className="font-mono font-semibold text-foreground">{z.homeOdd.toFixed(2)}</span>
                  </p>
                )}
                <ul className="space-y-1">
                  {z.reasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-muted">
                      <span className="mt-px text-signal shrink-0">·</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">
            Use a zebra como leitura complementar de valor. Quando ela aparecer, ajuste sua entrada com disciplina.
          </p>
        </section>
      )}

      {resolvedRound && resolvedSeason && (
        <Suspense fallback={<NarrativeSkeleton />}>
          <NarrativeSection
            season={resolvedSeason}
            round={resolvedRound}
            anchors={anchorsForDisplay as Parameters<typeof NarrativeSection>[0]["anchors"]}
            variations={variations}
          />
        </Suspense>
      )}

      {resolvedRound && resolvedSeason && (
        <Suspense fallback={<ReflectionCardSkeleton />}>
          <ReflectionCard season={resolvedSeason} round={resolvedRound} />
        </Suspense>
      )}

      <section className="panel rounded-3xl p-6">
        <GlossarySection />
      </section>
    </div>
  );
}
