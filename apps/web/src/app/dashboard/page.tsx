import { Suspense } from "react";
import { SectionCard } from "@/components/section-card";
import { VariationCard } from "@/components/variation-card";
import { NarrativeSection, NarrativeSkeleton } from "@/components/narrative-section";
import { ReflectionCard, ReflectionCardSkeleton } from "@/components/reflection-card";
import { GlossarySection } from "@/components/glossary";
import { AberturaDiariaBanner } from "@/components/abertura-diaria-banner";
import { AnchorCard } from "@/components/anchor-card";
import { scoreMatch, selectAnchors, generateVariations } from "@/lib/bob/engine";
import { analyzeRoundDifficulty } from "@/lib/bob/engine/round-analyzer";
import { detectZebras, type ZebraOpportunity } from "@/lib/bob/engine/zebra-detector";
import { demoMatches, DEMO_ROUND_LABEL, DEMO_FIRST_MATCH, DEMO_CUTOFF } from "@/lib/bob/demo-matches";
import { fetchRoundMatchInputs, getCurrentRound } from "@/lib/bob/connectors";
import { getTeamAssetsMap } from "@/lib/bob/connectors/thesportsdb";
import { BOB_COPY } from "@/lib/bob/personality";
import { TeamIdentity } from "@/components/team-identity";

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

// ─── Dados da rodada ──────────────────────────────────────────────────────────

async function getRoundData(season: number, round: number | null) {
  // Se não tiver chave configurada, usar demo
  if (!process.env.FOOTBALL_DATA_TOKEN) {
    return { source: "demo" as const, round: null, season: null };
  }

  // Auto-detectar rodada atual se não informada
  const resolvedRound = round ?? (await getCurrentRound().catch(() => null));
  if (!resolvedRound) {
    return { source: "demo" as const, round: null, season: null };
  }

  try {
    const result = await fetchRoundMatchInputs(season, resolvedRound);
    return { source: "api" as const, ...result };
  } catch (err) {
    console.error("[Dashboard] Falha ao buscar dados reais:", err);
    // Qualquer falha de API → fallback gracioso para demo
    return { source: "demo" as const, round: null, season: null };
  }
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

  const roundData = await getRoundData(paramSeason, paramRound);

  // ── Escudos TheSportsDB (best-effort — não bloqueia o resto) ─────────────
  let teamBadges: Record<string, string | null> = {};
  try {
    const assetsMap = await getTeamAssetsMap();
    assetsMap.forEach((v, k) => { teamBadges[k] = v.badgeUrl; });
  } catch {
    // silently ignore — badges são opcionais
  }

  // Computar âncoras + variações a partir da fonte correta
  let allScored, anchors, variations, roundLabel, firstMatch, cutoff;

  if (roundData.source === "api" && roundData.matches && roundData.matches.length > 0) {
    const filtered = roundData.matches.filter((m) => !excludedIds.has(m.id));
    allScored  = filtered.map(scoreMatch);
    anchors    = selectAnchors(filtered);
    const anchorIds = new Set(anchors.map((a) => a.id));
    const pool = allScored.filter((m) => !anchorIds.has(m.id));
    variations = generateVariations({ anchors, pool });
    roundLabel = `Rodada ${roundData.meta.round} · ${roundData.meta.season}`;
    const fmt  = formatFirstMatch(roundData.meta.firstMatchAt);
    firstMatch = fmt.label;
    cutoff     = fmt.cutoff;
  } else {
    const filtered = demoMatches.filter((m) => !excludedIds.has(m.id));
    allScored  = filtered.map(scoreMatch);
    anchors    = selectAnchors(filtered);
    const anchorIds = new Set(anchors.map((a) => a.id));
    const pool = allScored.filter((m) => !anchorIds.has(m.id));
    variations = generateVariations({ anchors, pool });
    roundLabel = DEMO_ROUND_LABEL;
    firstMatch = DEMO_FIRST_MATCH;
    cutoff     = DEMO_CUTOFF;
  }

  // Detect zebra opportunities
  const sourceMatches = (roundData.source === "api" && roundData.matches?.length)
    ? roundData.matches.filter((m) => !excludedIds.has(m.id))
    : demoMatches.filter((m) => !excludedIds.has(m.id));
  const zebras: ZebraOpportunity[] = detectZebras(sourceMatches, 3);

  // Dificuldade da rodada
  const roundDifficulty = analyzeRoundDifficulty(allScored);

  // Determinar round e season resolvidos para a narrativa
  const resolvedRound = roundData.source === "api" ? roundData.meta?.round ?? null : null;
  const resolvedSeason = roundData.source === "api" ? roundData.meta?.season ?? null : null;

  // Mensagem de abertura diária do BOB (wiring BOB_FAITH)
  const greeterRound = resolvedRound ?? 15; // fallback para demo rodada 15
  const aberturaMensagem = BOB_COPY.aberturaDiaria(greeterRound);

  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
      {/* Abertura diária — Client Component, exibe só na 1ª visita em 24h */}
      <AberturaDiariaBanner message={aberturaMensagem} />

      {/* ── Header da rodada ── */}
      <section className="panel rounded-[28px] p-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <p className="kicker text-xs text-muted">Brasileirão Série A · painel premium da rodada</p>
            <h1 className="text-4xl font-semibold leading-tight">{roundLabel}</h1>
            <p className="text-base leading-7 text-muted">
              {anchors.length} âncoras em destaque · {variations.length} leituras prontas · {allScored.length} jogos no radar
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SectionCard
              title="Primeiro jogo"
              value={firstMatch}
              description="Abertura oficial da rodada"
            />
            <SectionCard
              title="Janela final"
              value={cutoff}
              description="Último ajuste antes do apito"
            />
            <SectionCard
              title="Âncoras"
              value={`${anchors.length} de ${allScored.length}`}
              description="Base principal do portfólio"
            />
            <SectionCard
              title="Cenários"
              value={`${variations.length} variações`}
              description="Proteção, equilíbrio e teto de odd"
            />
          </div>
        </div>
      </section>

      {/* ── Banner de dificuldade da rodada ── */}
      {(() => {
        const diffColors = {
          easy:     { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-800", badge: "bg-emerald-100 text-emerald-700", label: "RODADA FÁCIL" },
          balanced: { bg: "bg-sky-50 border-sky-200",         text: "text-sky-800",     badge: "bg-sky-100 text-sky-700",     label: "RODADA EQUILIBRADA" },
          hard:     { bg: "bg-amber-50 border-amber-200",     text: "text-amber-800",   badge: "bg-amber-100 text-amber-700",   label: "RODADA DIFÍCIL" },
        };
        const c = diffColors[roundDifficulty.difficulty];
        return (
          <div className={`rounded-2xl border px-5 py-4 ${c.bg}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${c.badge}`}>
                  {c.label}
                </span>
                <span className={`text-sm font-medium ${c.text}`}>
                  Leitura {roundDifficulty.difficultyScore}/100
                </span>
              </div>
              <p className={`text-xs ${c.text} opacity-80`}>
                {roundDifficulty.reasons.join(" · ")}
              </p>
            </div>
            <p className={`mt-2 text-sm ${c.text}`}>{roundDifficulty.bobMessage}</p>
          </div>
        );
      })()}

      {/* ── Âncoras ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="kicker text-xs text-muted">Âncoras da rodada</p>
            <h2 className="mt-1 text-2xl font-semibold">Base mais forte da sua leitura</h2>
          </div>
          {anchors.length > 0 && (
            <p className="text-xs text-muted">Confiança 0–100</p>
          )}
        </div>

        {excludedIds.size > 0 && (
          <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            <span>
              {excludedIds.size} jogo{excludedIds.size > 1 ? "s" : ""} excluído{excludedIds.size > 1 ? "s" : ""} — a leitura da rodada foi recalculada.
            </span>
            <a href="/dashboard" className="ml-4 font-semibold underline decoration-dotted">
              Limpar
            </a>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {anchors.map((anchor) => (
            <AnchorCard
              key={anchor.id}
              anchor={anchor}
              badgeUrl={teamBadges[anchor.homeTeam] ?? null}
              awayBadgeUrl={teamBadges[anchor.awayTeam] ?? null}
            />
          ))}
        </div>
      </section>

      {/* ── Variações ── */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="kicker text-xs text-muted">Portfólio BOB da rodada</p>
            <h2 className="mt-1 text-2xl font-semibold">5 cenários para entrar com clareza</h2>
          </div>
          <p className="hidden max-w-xs text-right text-sm leading-6 text-muted lg:block">
            Cada cenário combina proteção, valor e odd alvo para orientar sua entrada na rodada.
          </p>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          {variations.map((variation) => (
            <VariationCard key={variation.id} variation={variation} teamBadges={teamBadges} />
          ))}
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
                className="panel rounded-[20px] border border-signal/20 bg-signal/5 p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1.5">
                    <TeamIdentity
                      teamName={z.homeTeam}
                      badgeUrl={teamBadges[z.homeTeam] ?? null}
                      badgeSize={22}
                      className="min-w-0"
                      nameClassName="text-sm font-semibold"
                      subtitle={`Mandante · ${z.homePosition}º na tabela`}
                    />
                    <div className="flex items-center gap-2 pl-1">
                      <span className="h-px w-3 shrink-0 bg-border/80" />
                      <TeamIdentity
                        teamName={z.awayTeam}
                        badgeUrl={teamBadges[z.awayTeam] ?? null}
                        badgeSize={22}
                        className="min-w-0"
                        nameClassName="text-sm font-medium"
                        subtitle={`Visitante · ${z.awayPosition}º na tabela`}
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
