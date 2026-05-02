import { Suspense } from "react";
import { NarrativeSection, NarrativeSkeleton } from "@/components/narrative-section";
import { ReflectionCard, ReflectionCardSkeleton } from "@/components/reflection-card";
import { GlossarySection } from "@/components/glossary";
import { AberturaDiariaBanner } from "@/components/abertura-diaria-banner";
import { PageHero } from "@/components/page-hero";
import { scoreMatch, selectAnchorsFromScored, generateVariations } from "@/lib/bob/engine";
import { analyzeRoundDifficulty } from "@/lib/bob/engine/round-analyzer";
import { detectZebras, type ZebraOpportunity } from "@/lib/bob/engine/zebra-detector";
import { demoMatches, DEMO_ROUND_LABEL, DEMO_FIRST_MATCH, DEMO_CUTOFF } from "@/lib/bob/demo-matches";
import { BOB_COPY } from "@/lib/bob/personality";
import { TeamIdentity } from "@/components/team-identity";
import { describeRoundFallback, loadRoundData } from "@/lib/bob/round-loader";
import type { Variation } from "@/lib/bob/types";
import type { Variation as BeamVariation, TicketLeg } from "@/lib/bob/engine/beam-search";

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


  // Mapa matchId → crests (vem direto do football-data.org via homeCrest/awayCrest)
  const crestMap = new Map(
    roundData.matches.map((m) => [m.id, { home: m.homeCrest ?? null, away: m.awayCrest ?? null }])
  );

  const filteredMatches = roundData.matches.filter((match) => !excludedIds.has(match.id));
  const allScored = filteredMatches.map(scoreMatch);
  const anchors = selectAnchorsFromScored(allScored);
  const anchorIds = new Set(anchors.map((anchor) => anchor.id));
  const pool = allScored.filter((match) => !anchorIds.has(match.id));
  const variationsResult = generateVariations({ anchors, pool });
  const variations: Variation[] = (variationsResult.variations || []).map(convertBeamToLegacy);
  const roundLabel = roundData.source === "api" && roundData.meta
    ? `Rodada ${roundData.meta.round} · ${roundData.meta.season}`
    : DEMO_ROUND_LABEL;
  const { label: firstMatch, cutoff } = roundData.source === "api" && roundData.meta
    ? formatFirstMatch(roundData.meta.firstMatchAt)
    : { label: DEMO_FIRST_MATCH, cutoff: DEMO_CUTOFF };

  // Detect zebra opportunities
  const sourceMatches = filteredMatches.length > 0 ? filteredMatches : demoMatches.filter((m) => !excludedIds.has(m.id));
  const zebras: ZebraOpportunity[] = detectZebras(sourceMatches, 3);

  // Dificuldade da rodada
  const roundDifficulty = analyzeRoundDifficulty(allScored);
  const anchorTarget = Math.min(4, allScored.length);
  const integrationMeta = roundData.source === "api" && roundData.meta ? roundData.meta.integrations : null;
  const degradedIntegrations = integrationMeta
    ? [
        integrationMeta.odds !== "live" ? describeIntegration("odds", integrationMeta.odds) : null,
        integrationMeta.h2h !== "live" ? describeIntegration("H2H", integrationMeta.h2h) : null,
        integrationMeta.injuries !== "live" ? describeIntegration("desfalques", integrationMeta.injuries) : null,
        integrationMeta.cup !== "live" ? describeIntegration("copas", integrationMeta.cup) : null,
        integrationMeta.assets !== "ready" ? describeIntegration("escudos", integrationMeta.assets) : null,
        integrationMeta.weather !== "live" ? describeIntegration("clima", integrationMeta.weather) : null,
      ].filter((value): value is string => Boolean(value))
    : [];

  // Determinar round e season resolvidos para a narrativa
  const resolvedRound = roundData.source === "api" ? roundData.meta.round : null;
  const resolvedSeason = roundData.source === "api" ? roundData.meta.season : null;

  // Mensagem de abertura diária do BOB (wiring BOB_FAITH)
  const greeterRound = resolvedRound ?? 15; // fallback para demo rodada 15
  const aberturaMensagem = BOB_COPY.aberturaDiaria(greeterRound);
  const heroChips = [
    {
      label: roundData.source === "api" ? "Dados ao vivo" : "Modo demonstrativo",
      tone: roundData.source === "api" ? ("accent" as const) : ("signal" as const),
    },
    {
      label: `${anchors.length} âncoras ativas`,
      tone: "neutral" as const,
    },
    excludedIds.size > 0
      ? {
          label: `${excludedIds.size} exclusão${excludedIds.size > 1 ? "ões" : ""} aplicada${excludedIds.size > 1 ? "s" : ""}`,
          tone: "signal" as const,
        }
      : null,
    integrationMeta
      ? {
          label: integrationMeta.odds === "live" ? "Odds reais" : "Odds em fallback",
          tone: integrationMeta.odds === "live" ? ("neutral" as const) : ("signal" as const),
        }
      : null,
  ].filter((value): value is NonNullable<typeof value> => Boolean(value));

  const heroMetrics = [
    { label: "Primeiro jogo", value: firstMatch, note: "abertura oficial da rodada" },
    { label: "Janela final", value: cutoff, note: "último ajuste antes do apito" },
    { label: "Âncoras", value: `${anchors.length} de ${anchorTarget}`, note: "base principal do portfólio" },
    { label: "Cenários", value: `${variations.length}`, note: "roteiros prontos para entrar" },
  ];

  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
      {/* Abertura diária — Client Component, exibe só na 1ª visita em 24h */}
      <AberturaDiariaBanner message={aberturaMensagem} />

      <PageHero
        eyebrow="Brasileirão Série A · painel premium da rodada"
        title={roundLabel}
        description={`${anchors.length} âncoras em destaque, ${variations.length} cenários prontos e ${allScored.length} jogos no radar do BOB.`}
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

      {(roundData.source === "demo" || degradedIntegrations.length > 0) && (
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

      {/* ── Variações: CTA que leva à página dedicada ── */}
      <section className="bob-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-left">
            <p className="kicker text-xs text-muted text-left">Portfólio BOB da rodada</p>
            <h2 className="mt-1 text-2xl font-semibold text-left">5 cenários Big Odds prontos</h2>
            <p className="mt-2 text-sm leading-6 text-muted max-w-xl text-left">
              {anchors.length} âncoras analisadas · {variations.length} variações geradas · odd combinada mínima 900x ·
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

      {/* ── Oportunidades de Zebra ── */}
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
                      badgeUrl={crestMap.get(z.matchId)?.home ?? null}
                      badgeSize={22}
                      className="min-w-0"
                      nameClassName="text-sm font-semibold"
                      subtitle={`Mandante \u00b7 ${z.homePosition}\u00ba na tabela`}
                    />
                    <div className="flex items-center gap-2 pl-1">
                      <span className="h-px w-3 shrink-0 bg-border/80" />
                      <TeamIdentity
                        teamName={z.awayTeam}
                        badgeUrl={crestMap.get(z.matchId)?.away ?? null}
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
            anchors={anchors}
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
