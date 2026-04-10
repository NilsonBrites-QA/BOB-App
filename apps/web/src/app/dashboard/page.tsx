import { Suspense } from "react";
import { SectionCard } from "@/components/section-card";
import { VariationCard } from "@/components/variation-card";
import { NarrativeSection, NarrativeSkeleton } from "@/components/narrative-section";
import { ReflectionCard, ReflectionCardSkeleton } from "@/components/reflection-card";
import { ExcludeMatchButton } from "@/components/exclude-match-button";
import { anchorFactors, currentRoundSnapshot } from "@/lib/bob/mock-data";
import { scoreMatch, selectAnchors, generateVariations } from "@/lib/bob/engine";
import { demoMatches, DEMO_ROUND_LABEL, DEMO_FIRST_MATCH, DEMO_CUTOFF } from "@/lib/bob/demo-matches";
import { fetchRoundMatchInputs } from "@/lib/bob/connectors";
import { getCurrentRound } from "@/lib/bob/connectors/api-football";

// ─── Dados da rodada ──────────────────────────────────────────────────────────

async function getRoundData(season: number, round: number | null) {
  // Se não tiver chave configurada, usar demo
  if (!process.env.API_FOOTBALL_KEY) {
    return { source: "demo" as const, round: null, season: null };
  }

  // Auto-detectar rodada atual se não informada
  const resolvedRound = round ?? (await getCurrentRound(season).catch(() => null));
  if (!resolvedRound) {
    return { source: "demo" as const, round: null, season: null };
  }

  try {
    const result = await fetchRoundMatchInputs(season, resolvedRound);
    return { source: "api" as const, ...result };
  } catch {
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
    firstMatch = `${roundData.meta.fixtureCount} jogos encontrados`;
    cutoff     = "T - 1h do primeiro bloco";
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

  // Determinar round e season resolvidos para a narrativa
  const resolvedRound = roundData.source === "api" ? roundData.meta?.round ?? null : null;
  const resolvedSeason = roundData.source === "api" ? roundData.meta?.season ?? null : null;

  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
      <section className="panel rounded-[28px] p-8">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <p className="kicker text-sm text-muted">Dashboard da rodada</p>
            <h1 className="text-4xl font-semibold leading-tight">Entrega principal da rodada com cutoff operacional antes do primeiro jogo.</h1>
            <p className="max-w-3xl text-base leading-8 text-muted">
              O pacote oficial da rodada nasce com antecedência, sustentado por
              probáveis, notícias, contexto competitivo, forma e leitura de valor.
              Escalações confirmadas tardias passam a alimentar memória,
              auditoria e alertas secundários.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SectionCard title="Rodada" value={roundLabel} description={firstMatch} />
            <SectionCard title="Cutoff" value="T - 1h do primeiro bloco" description={cutoff} />
            <SectionCard title="Regra de entrega" value="5 variações fixas" description={currentRoundSnapshot.deliveryRule} />
            <SectionCard title="Lineups confirmadas" value="Memória e pós-análise" description={currentRoundSnapshot.confirmedLineupPolicy} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="panel rounded-3xl p-6">
          <p className="kicker text-xs text-muted">Âncoras — motor real</p>
          {excludedIds.size > 0 && (
            <div className="mb-4 flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
              <span>{excludedIds.size} jogo{excludedIds.size > 1 ? "s" : ""} excluído{excludedIds.size > 1 ? "s" : ""} desta rodada — âncoras e variações foram recalculadas.</span>
              <a href="/dashboard" className="ml-4 font-semibold underline decoration-dotted">Limpar</a>
            </div>
          )}
          <div className="mt-5 space-y-4">
            {anchors.map((anchor) => (
              <div key={anchor.id} className="rounded-[20px] border border-border bg-surface-strong p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">{anchor.homeTeam}</h2>
                    <p className="text-sm text-muted">vs. {anchor.awayTeam}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ExcludeMatchButton matchId={anchor.id} />
                    <div className="rounded-full bg-accent px-4 py-2 text-white">
                      <span className="font-mono text-sm">{anchor.score}</span>
                    </div>
                  </div>
                </div>
                <ul className="mt-3 space-y-2 text-sm leading-7 text-muted">
                  {anchor.reasons.map((reason) => (
                    <li key={reason}>• {reason}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </article>

        <article className="panel rounded-3xl p-6">
          <p className="kicker text-xs text-muted">Fatores do Anchor Score</p>
          <div className="mt-5 overflow-hidden rounded-[20px] border border-border">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[rgba(29,92,65,0.06)] text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Fator</th>
                  <th className="px-4 py-3 font-medium">Peso</th>
                  <th className="px-4 py-3 font-medium">Leitura</th>
                </tr>
              </thead>
              <tbody>
                {anchorFactors.map((factor) => (
                  <tr key={factor.label} className="border-t border-border/70">
                    <td className="px-4 py-3 font-medium">{factor.label}</td>
                    <td className="px-4 py-3 font-mono">{factor.weight}%</td>
                    <td className="px-4 py-3 text-muted">{factor.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="kicker text-xs text-muted">Variações geradas pelo motor</p>
            <h2 className="mt-2 text-3xl font-semibold">As 5 múltiplas respeitam a estrutura-base do método Camillo.</h2>
          </div>
          <p className="max-w-xl text-right text-sm leading-7 text-muted">
            Variações geradas em tempo real pelo motor determinístico a partir
            dos 4 âncoras selecionados e dos jogos de preenchimento.
          </p>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          {variations.map((variation) => (
            <VariationCard key={variation.id} variation={variation} />
          ))}
        </div>
      </section>

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
    </div>
  );
}