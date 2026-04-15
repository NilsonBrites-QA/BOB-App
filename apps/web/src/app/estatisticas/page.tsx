import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MatchStatsCard } from "@/components/match-stats-card";
import { SectionCard } from "@/components/section-card";
import { scoreMatch } from "@/lib/bob/engine/scoring";
import { getFactorBreakdown } from "@/lib/bob/engine/factor-breakdown";
import { demoMatches, DEMO_ROUND_LABEL } from "@/lib/bob/demo-matches";
import { fetchRoundMatchInputs, getCurrentRound } from "@/lib/bob/connectors";
import { getTeamAssetsMap } from "@/lib/bob/connectors/thesportsdb";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";

// ─── tipos auxiliares ─────────────────────────────────────────────────────────

type SortKey = "score" | "home" | "odd";

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatOdd(odd: number): string {
  return odd.toFixed(2);
}

async function getRoundData(season: number, round: number | null) {
  if (!process.env.FOOTBALL_DATA_TOKEN) {
    return { source: "demo" as const, round: null, season: null };
  }
  const resolvedRound = round ?? (await getCurrentRound().catch(() => null));
  if (!resolvedRound) return { source: "demo" as const, round: null, season: null };

  try {
    const result = await fetchRoundMatchInputs(season, resolvedRound);
    return { source: "api" as const, ...result };
  } catch {
    return { source: "demo" as const, round: null, season: null };
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function EstatisticasPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; round?: string; sort?: string }>;
}) {
  // ── Auth guard ─────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Verificar se o usuário está ativo na whitelist
  const dbUser = await prisma.user.findUnique({
    where:  { email: user.email!.toLowerCase() },
    select: { active: true },
  }).catch(() => null);

  if (!dbUser?.active) {
    redirect("/login");
  }

  // ── Parâmetros ─────────────────────────────────────────────────────────
  const params    = await searchParams;
  const paramSeason = params.season ? parseInt(params.season, 10) : new Date().getFullYear();
  const paramRound  = params.round  ? parseInt(params.round,  10) : null;
  const sortKey     = (params.sort ?? "score") as SortKey;

  // ── Dados da rodada ────────────────────────────────────────────────────
  const roundData = await getRoundData(paramSeason, paramRound);

  let teamBadges: Record<string, string | null> = {};
  try {
    const assetsMap = await getTeamAssetsMap();
    assetsMap.forEach((v, k) => { teamBadges[k] = v.badgeUrl; });
  } catch {
    // silently ignore — escudos são opcionais
  }

  // ── Processar jogos ────────────────────────────────────────────────────
  const rawMatches =
    roundData.source === "api" && roundData.matches?.length
      ? roundData.matches
      : demoMatches;

  const roundLabel =
    roundData.source === "api"
      ? `Rodada ${roundData.meta?.round} · ${roundData.meta?.season}`
      : DEMO_ROUND_LABEL;

  // Score + breakdown por jogo
  const scored = rawMatches.map((m) => ({
    scored:    scoreMatch(m),
    breakdown: getFactorBreakdown(m),
  }));

  // Ordenação
  const sorted = [...scored].sort((a, b) => {
    if (sortKey === "score") return b.scored.score - a.scored.score;
    if (sortKey === "odd")   return a.scored.homeOdd - b.scored.homeOdd;
    return a.scored.homeTeam.localeCompare(b.scored.homeTeam);
  });

  // Estatísticas resumidas
  const anchors     = sorted.filter((s) => s.scored.isAnchorCandidate);
  const avgScore    = Math.round(sorted.reduce((a, s) => a + s.scored.score, 0) / sorted.length);
  const bestScore   = Math.max(...sorted.map((s) => s.scored.score));
  const totalGames  = sorted.length;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">

      {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
      <section className="panel rounded-[28px] p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="kicker text-xs text-muted">Estatísticas · {roundLabel}</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight sm:text-4xl">
              Análise de todos os jogos
            </h1>
            <p className="mt-2 text-sm leading-7 text-muted">
              {totalGames} jogos analisados · {anchors.length} âncoras identificadas.
              Clique em qualquer jogo para ver o detalhamento completo dos 15 fatores.
            </p>
            {/* Navegação entre rodadas */}
            {roundData.source === "api" && roundData.meta && (
              <div className="mt-4 flex items-center gap-2">
                {roundData.meta.round > 1 && (
                  <a
                    href={`?season=${paramSeason}&round=${roundData.meta.round - 1}&sort=${sortKey}`}
                    className="rounded-full border border-border px-4 py-1.5 text-xs font-medium text-muted transition hover:border-accent/50 hover:text-foreground"
                  >
                    ← Rodada {roundData.meta.round - 1}
                  </a>
                )}
                <span className="rounded-full bg-accent/10 px-4 py-1.5 text-xs font-semibold text-accent">
                  Rodada {roundData.meta.round}
                </span>
                {roundData.meta.round < 38 && (
                  <a
                    href={`?season=${paramSeason}&round=${roundData.meta.round + 1}&sort=${sortKey}`}
                    className="rounded-full border border-border px-4 py-1.5 text-xs font-medium text-muted transition hover:border-accent/50 hover:text-foreground"
                  >
                    Rodada {roundData.meta.round + 1} →
                  </a>
                )}
              </div>
            )}
          </div>
          <div className="grid shrink-0 grid-cols-3 gap-3 lg:grid-cols-3">
            <SectionCard
              title="Jogos"
              value={String(totalGames)}
              description="na rodada"
            />
            <SectionCard
              title="Score médio"
              value={String(avgScore)}
              description="do motor BOB"
            />
            <SectionCard
              title="Âncoras"
              value={String(anchors.length)}
              description={`melhor: ${bestScore}`}
            />
          </div>
        </div>
      </section>

      {/* ── Ordenação ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">Ordenar por:</span>
        {(["score", "home", "odd"] as SortKey[]).map((key) => {
          const label = key === "score" ? "Score" : key === "home" ? "Mandante (A–Z)" : "Odd";
          const active = sortKey === key;
          return (
            <a
              key={key}
              href={`?season=${paramSeason}&round=${paramRound ?? ""}&sort=${key}`}
              className={[
                "rounded-full px-3 py-1 text-xs font-medium transition",
                active
                  ? "bg-accent text-white"
                  : "border border-border bg-surface-strong text-muted hover:border-accent/50",
              ].join(" ")}
            >
              {label}
            </a>
          );
        })}
      </div>

      {/* ── Grid de jogos ─────────────────────────────────────────────── */}
      <section>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map(({ scored: s, breakdown: bd }) => (
            <MatchStatsCard
              key={s.id}
              match={s}
              breakdown={bd}
              homeBadgeUrl={teamBadges[s.homeTeam] ?? null}
              awayBadgeUrl={teamBadges[s.awayTeam] ?? null}
              isAnchor={s.isAnchorCandidate}
            />
          ))}
        </div>
      </section>

      {/* ── Legenda de confiança ───────────────────────────────────────── */}
      <section className="panel rounded-[20px] p-5">
        <p className="kicker text-xs text-muted">Legenda de confiança</p>
        <div className="mt-3 flex flex-wrap gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent" />
            <span><strong>Alta</strong> — Score ≥ 70. Favorável para analisar como âncora.</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-signal" />
            <span><strong>Média</strong> — Score 50–69. Jogo interessante, mas com ressalvas.</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-muted/50" />
            <span><strong>Baixa</strong> — Score abaixo de 50. Evitar como âncora.</span>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted">
          Barras de probabilidade (1 / X / 2) derivadas das odds de mercado, normalizadas. 
          Score BOB é independente das odds — confronta o mercado com algoritmo próprio.
        </p>
      </section>

    </div>
  );
}
