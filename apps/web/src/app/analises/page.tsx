/**
 * Página de Análises da Rodada (Radar BOB v2)
 * 
 * Rota canônica: /analises
 * Servidor: carrega dados via getRoundAnalysis (read-only, DB-only)
 * UI: exibe MatchAnalysisCard para cada jogo da rodada
 * 
 * Padrão: server component, sem chamadas externas
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHero } from "@/components/page-hero";
import { SectionCard } from "@/components/section-card";
import { MatchAnalysisCard } from "@/features/round-analysis/components/MatchAnalysisCard";
import { getRoundAnalysis } from "@/features/round-analysis/server/get-round-analysis";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";

type SortKey = "confidence" | "home" | "odd";

function sortLabel(key: SortKey): string {
  if (key === "confidence") return "Confiança";
  if (key === "home") return "Mandante";
  return "Odd";
}

function sortDescription(key: SortKey): string {
  if (key === "confidence")
    return "Abre pelos jogos com maior confiança de análise.";
  if (key === "home")
    return "Organiza a rodada por ordem alfabética do mandante.";
  return "Puxa para o topo os preços mais curtos do mercado.";
}

export default async function AnalisesPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; round?: string; sort?: string }>;
}) {
  // ── Autenticação ───────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const dbUser = await prisma.user.findUnique({
    where: { email: user.email!.toLowerCase() },
    select: { active: true },
  }).catch(() => null);

  if (!dbUser?.active) {
    redirect("/login");
  }

  // ── Parâmetros de URL ──────────────────────────────────────────────────
  const params = await searchParams;
  const paramSeason = params.season
    ? parseInt(params.season, 10)
    : new Date().getFullYear();
  const paramRound = params.round ? parseInt(params.round, 10) : null;
  const sortKey = (params.sort ?? "confidence") as SortKey;

  // ── Busca análise do banco (read-only) ──────────────────────────────────
  const analysis = await getRoundAnalysis({
    season: paramSeason,
    round: paramRound || 1,
    allowFallback: true,
  });

  if (!analysis) {
    return (
      <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
        <PageHero
          eyebrow="Análises da Rodada · Radar BOB"
          title="Nenhuma análise disponível"
          description="Ainda não há análises geradas para esta rodada. Volte em alguns momentos ou entre em contato com o administrador."
        />

        <div className="panel rounded-[24px] p-6 text-center">
          <p className="text-muted">
            Dados ainda não foram sincronizados para rodada {paramRound || 1} de{" "}
            {paramSeason}.
          </p>
        </div>
      </div>
    );
  }

  // ── Ordena matches ─────────────────────────────────────────────────────
  const sorted = [...analysis.matches].sort((left, right) => {
    if (sortKey === "confidence")
      return right.confidence - left.confidence;
    if (sortKey === "odd")
      return (left.odds?.home || 2.0) - (right.odds?.home || 2.0);
    return left.homeTeam.localeCompare(right.homeTeam);
  });

  // ── Métricas da rodada ──────────────────────────────────────────────────
  const highConfidenceCount = sorted.filter(
    (m) => m.confidence >= 70,
  ).length;
  const totalRisks = sorted.flatMap((m) => m.riskFlags).length;
  const lowestHomeOdd = Math.min(
    ...sorted.map((m) => m.odds?.home || 999),
  );

  const heroMetrics = [
    {
      label: "Jogos analisados",
      value: String(sorted.length),
      note: "confrontos disponíveis",
    },
    {
      label: "Alta confiança",
      value: String(highConfidenceCount),
      note: "jogos com score ≥70",
    },
    {
      label: "Confiança média",
      value: `${analysis.summary.averageConfidence}`,
      note: "pulso geral da rodada",
    },
    {
      label: "Menor odd (1)",
      value: lowestHomeOdd < 999 ? lowestHomeOdd.toFixed(2) : "–",
      note: "preço mais curto mandante",
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
      {/* Hero com métricas */}
      <PageHero
        eyebrow="Análises da Rodada · Radar BOB"
        title={`Rodada ${analysis.round} · ${analysis.season}`}
        description={`${sorted.length} confrontos analisados e prontos para decisão. Cruza marcado, forma, contexto e scoring do BOB para destacar onde a rodada está mais limpa e onde o preço ainda pede cautela.`}
        metrics={heroMetrics}
        aside={
          <div className="space-y-4">
            <div className="rounded-[24px] border border-border/80 bg-background/55 p-5 backdrop-blur">
              <p className="kicker text-[11px] text-muted">Filtro editorial</p>
              <p className="mt-2 text-lg font-semibold">{sortLabel(sortKey)}</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {sortDescription(sortKey)}
              </p>
            </div>

            {/* Cobertura de dados */}
            <div className="rounded-[24px] border border-border/80 bg-background/55 p-5 backdrop-blur">
              <p className="kicker text-[11px] text-muted">Cobertura</p>
              <p className="mt-2 text-sm font-semibold">
                {analysis.coverage.matchesCovered}/{analysis.coverage.matchesTotal} jogos
              </p>
              <p className="mt-2 text-xs text-muted capitalize">
                Fonte: <strong>{analysis.coverage.source}</strong>
              </p>
            </div>
          </div>
        }
        extra={
          <div className="flex flex-wrap gap-2">
            {(["confidence", "home", "odd"] as SortKey[]).map((key) => {
              const active = sortKey === key;
              return (
                <a
                  key={key}
                  href={`?season=${paramSeason}&round=${paramRound ?? ""}&sort=${key}`}
                  className={[
                    "rounded-full px-3 py-1.5 text-xs font-medium transition",
                    active
                      ? "bg-accent text-white"
                      : "border border-border bg-background/60 text-muted hover:border-accent/35 hover:text-foreground",
                  ].join(" ")}
                >
                  {sortLabel(key as SortKey)}
                </a>
              );
            })}
          </div>
        }
      />

      {/* Cards de métricas */}
      <section className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="Confiança alta"
          value={String(highConfidenceCount)}
          description="Jogos com score ≥70 — base do bilhete."
          tone="accent"
        />
        <SectionCard
          title="Confiança média"
          value={`${analysis.summary.averageConfidence}%`}
          description="Média geral de todos os jogos."
          tone="neutral"
        />
        <SectionCard
          title="Alertas ativos"
          value={String(totalRisks)}
          description="Riscos identificados na rodada."
          tone={totalRisks > 5 ? "signal" : "neutral"}
        />
      </section>

      {/* Grid de cards de análise */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="kicker text-xs text-muted text-left">
              Raio-X completo
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-left">
              Confrontos organizados para decisão rápida
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-muted text-left">
            Abra qualquer confronto para ver a análise completa, os sinais de
            risco e o contexto de mercado antes da entrada.
          </p>
        </div>

        {sorted.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((match) => (
              <MatchAnalysisCard
                key={match.id}
                data={match}
              />
            ))}
          </div>
        ) : (
          <div className="panel rounded-[24px] p-5">
            <p className="text-sm font-semibold">
              Nenhum jogo foi analisado nesta rodada.
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Revise a rodada selecionada ou aguarde a sincronização de dados.
            </p>
          </div>
        )}
      </section>

      {/* Rodapé com explicação */}
      <section className="panel rounded-[28px] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="kicker text-xs text-muted">Entenda a confiança</p>
            <h2 className="mt-1 text-2xl font-semibold">
              Escala de análise do BOB
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted text-left">
            A análise cruza probabilidade implícita, forma recente, contexto de
            tabela e sinais de mercado para separar o que é base, o que é jogo
            trabalhável e o que fica na reserva.
          </p>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="rounded-[22px] border border-border/80 bg-background/55 p-4 backdrop-blur">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-accent" />
              <p className="text-sm font-semibold">Alta (≥70)</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              Confronto bem estruturado. Pode sustentar a espinha dorsal do
              bilhete.
            </p>
          </div>

          <div className="rounded-[22px] border border-border/80 bg-background/55 p-4 backdrop-blur">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-signal" />
              <p className="text-sm font-semibold">Média (50–69)</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              Existe valor, mas o jogo pede ajuste fino de exposição.
            </p>
          </div>

          <div className="rounded-[22px] border border-border/80 bg-background/55 p-4 backdrop-blur">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-muted/60" />
              <p className="text-sm font-semibold">Baixa (&lt;50)</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              Preço pode chamar atenção, mas a base analítica ainda é frágil.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
