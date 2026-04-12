import { Suspense } from "react";
import { SectionCard } from "@/components/section-card";
import { VariationCard } from "@/components/variation-card";
import { NarrativeSection, NarrativeSkeleton } from "@/components/narrative-section";
import { ReflectionCard, ReflectionCardSkeleton } from "@/components/reflection-card";
import { GlossarySection } from "@/components/glossary";
import { AberturaDiariaBanner } from "@/components/abertura-diaria-banner";
import { AnchorCard } from "@/components/anchor-card";
import { scoreMatch, selectAnchors, generateVariations } from "@/lib/bob/engine";
import { detectZebras, type ZebraOpportunity } from "@/lib/bob/engine/zebra-detector";
import { demoMatches, DEMO_ROUND_LABEL, DEMO_FIRST_MATCH, DEMO_CUTOFF } from "@/lib/bob/demo-matches";
import { fetchRoundMatchInputs, getCurrentRound } from "@/lib/bob/connectors";
import { getTeamAssetsMap } from "@/lib/bob/connectors/thesportsdb";
import { BOB_COPY } from "@/lib/bob/personality";

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
    assetsMap.forEach((v, k) => { teamBadges[k] = v.badge; });
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
            <p className="kicker text-xs text-muted">Brasileirão Série A · Motor ativo</p>
            <h1 className="text-4xl font-semibold leading-tight">{roundLabel}</h1>
            <p className="text-base leading-7 text-muted">
              {anchors.length} âncoras selecionadas · {variations.length} cenários montados · {allScored.length} jogos analisados
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SectionCard
              title="Primeiro jogo"
              value={firstMatch}
              description="Horário de abertura da rodada"
            />
            <SectionCard
              title="Cutoff"
              value={cutoff}
              description="Prazo final — 1h antes do apito"
            />
            <SectionCard
              title="Âncoras"
              value={`${anchors.length} de ${allScored.length}`}
              description="Presentes em todas as variações"
            />
            <SectionCard
              title="Cenários"
              value={`${variations.length} variações`}
              description="Do conservador ao agressivo"
            />
          </div>
        </div>
      </section>

      {/* ── Âncoras ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="kicker text-xs text-muted">Âncoras do motor</p>
            <h2 className="mt-1 text-2xl font-semibold">Jogos com maior confiança analítica</h2>
          </div>
          {anchors.length > 0 && (
            <p className="text-xs text-muted">Score 0–100</p>
          )}
        </div>

        {excludedIds.size > 0 && (
          <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            <span>
              {excludedIds.size} jogo{excludedIds.size > 1 ? "s" : ""} excluído{excludedIds.size > 1 ? "s" : ""} — âncoras e variações foram recalculadas.
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
            <p className="kicker text-xs text-muted">Cenários do método BOB</p>
            <h2 className="mt-1 text-2xl font-semibold">5 variações · do conservador ao agressivo</h2>
          </div>
          <p className="hidden max-w-xs text-right text-sm leading-6 text-muted lg:block">
            Geradas em tempo real pelo motor determinístico com base nas âncoras e nos jogos de preenchimento.
          </p>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          {variations.map((variation) => (
            <VariationCard key={variation.id} variation={variation} />
          ))}
        </div>
      </section>

      {/* ── Oportunidades de Zebra ── */}
      {zebras.length > 0 && (
        <section className="space-y-4">
          <div>
            <p className="kicker text-xs text-muted">Alerta do motor</p>
            <h2 className="mt-1 text-2xl font-semibold">
              ⚡ {zebras.length === 1 ? "Oportunidade de Zebra" : `${zebras.length} Oportunidades de Zebra`}
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {zebras.map((z) => (
              <div
                key={z.matchId}
                className="panel rounded-[20px] border border-signal/20 bg-signal/5 p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold leading-tight">{z.match}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {z.homeTeam} #{z.homePosition} &nbsp;×&nbsp; {z.awayTeam} #{z.awayPosition}
                    </p>
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
            Zebras são oportunidades informativas — o motor não as inclui automaticamente nas variações. Use seu julgamento.
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