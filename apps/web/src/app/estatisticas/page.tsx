import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MatchStatsCard } from "@/components/match-stats-card";
import { PageHero } from "@/components/page-hero";
import { SectionCard } from "@/components/section-card";
import { scoreMatch } from "@/lib/bob/engine/scoring";
import { getFactorBreakdown } from "@/lib/bob/engine/factor-breakdown";
import { DEMO_ROUND_LABEL } from "@/lib/bob/demo-matches";
import { getTeamAssetsMap } from "@/lib/bob/connectors/thesportsdb";
import { describeRoundFallback, loadRoundData } from "@/lib/bob/round-loader";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";

type SortKey = "score" | "home" | "odd";

function describeIntegration(label: string, status: string) {
  if (status === "live" || status === "ready") return `${label} pronto`;
  if (status === "partial") return `${label} parcial`;
  if (status === "empty") return `${label} vazio`;
  return `${label} em fallback`;
}

function sortLabel(key: SortKey) {
  if (key === "score") return "Confiança";
  if (key === "home") return "Mandante";
  return "Odd";
}

function sortDescription(key: SortKey) {
  if (key === "score") return "Abre pelos confrontos com leitura mais limpa.";
  if (key === "home") return "Organiza a rodada por ordem alfabética do mandante.";
  return "Puxa para o topo os preços mais curtos do mercado.";
}

export default async function EstatisticasPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; round?: string; sort?: string }>;
}) {
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

  const params = await searchParams;
  const paramSeason = params.season ? parseInt(params.season, 10) : new Date().getFullYear();
  const paramRound = params.round ? parseInt(params.round, 10) : null;
  const sortKey = (params.sort ?? "score") as SortKey;

  const roundData = await loadRoundData(paramSeason, paramRound);

  const assetMap = roundData.source === "api" && roundData.assets.size > 0
    ? roundData.assets
    : await getTeamAssetsMap().catch(() => new Map());

  const teamBadges: Record<string, string | null> = {};
  assetMap.forEach((value, key) => {
    teamBadges[key] = value.badgeUrl;
  });

  const roundLabel = roundData.source === "api" && roundData.meta
    ? `Rodada ${roundData.meta.round} · ${roundData.meta.season}`
    : DEMO_ROUND_LABEL;

  const scored = roundData.matches.map((match) => ({
    scored: scoreMatch(match),
    breakdown: getFactorBreakdown(match),
  }));

  const sorted = [...scored].sort((left, right) => {
    if (sortKey === "score") return right.scored.score - left.scored.score;
    if (sortKey === "odd") return left.scored.homeOdd - right.scored.homeOdd;
    return left.scored.homeTeam.localeCompare(right.scored.homeTeam);
  });

  const anchors = sorted.filter((item) => item.scored.isAnchorCandidate);
  const totalGames = sorted.length;
  const avgScore = totalGames > 0
    ? Math.round(sorted.reduce((sum, item) => sum + item.scored.score, 0) / totalGames)
    : 0;
  const bestScore = totalGames > 0 ? Math.max(...sorted.map((item) => item.scored.score)) : 0;
  const lowestHomeOdd = totalGames > 0
    ? Math.min(...sorted.map((item) => item.scored.homeOdd))
    : 0;

  const integrationMeta = roundData.source === "api" && roundData.meta ? roundData.meta.integrations : null;
  const degradedIntegrations = integrationMeta
    ? [
        integrationMeta.odds !== "live" ? describeIntegration("odds", integrationMeta.odds) : null,
        integrationMeta.h2h !== "live" ? describeIntegration("H2H", integrationMeta.h2h) : null,
        integrationMeta.injuries !== "live" ? describeIntegration("desfalques", integrationMeta.injuries) : null,
        integrationMeta.assets !== "ready" ? describeIntegration("escudos", integrationMeta.assets) : null,
        integrationMeta.weather !== "live" ? describeIntegration("clima", integrationMeta.weather) : null,
      ].filter((value): value is string => Boolean(value))
    : [];

  const heroChips = [
    {
      label: roundData.source === "api" ? "Radar ao vivo" : "Modo demonstrativo",
      tone: roundData.source === "api" ? ("accent" as const) : ("signal" as const),
    },
    {
      label: `${anchors.length} leitura${anchors.length === 1 ? "" : "s"} base`,
      tone: "neutral" as const,
    },
    integrationMeta
      ? {
          label: integrationMeta.odds === "live" ? "Mercado conectado" : "Mercado parcial",
          tone: integrationMeta.odds === "live" ? ("neutral" as const) : ("signal" as const),
        }
      : null,
    {
      label: `Ordenação: ${sortLabel(sortKey)}`,
      tone: "neutral" as const,
    },
  ].filter((value): value is NonNullable<typeof value> => Boolean(value));

  const heroMetrics = [
    { label: "Jogos no radar", value: String(totalGames), note: "confrontos disponíveis nesta leitura" },
    { label: "Confiança média", value: `${avgScore}`, note: "pulso geral da rodada" },
    { label: "Melhor leitura", value: `${bestScore}`, note: "maior score entre os jogos" },
    {
      label: "Menor odd da casa",
      value: lowestHomeOdd > 0 ? lowestHomeOdd.toFixed(2) : "-",
      note: "preço mais curto do mercado mandante",
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
      <PageHero
        eyebrow="Bob Estatísticas · análise completa da rodada"
        title={`Bob Estatísticas · ${roundLabel}`}
        description={`${totalGames} confrontos organizados para leitura rápida. O painel cruza mercado, forma e score do BOB para destacar onde a rodada está mais limpa e onde o preço ainda pede cautela.`}
        chips={heroChips}
        metrics={heroMetrics}
        aside={(
          <div className="space-y-4">
            <div className="rounded-[24px] border border-border/80 bg-background/55 p-5 backdrop-blur">
              <p className="kicker text-[11px] text-muted">Filtro editorial</p>
              <p className="mt-2 text-lg font-semibold">{sortLabel(sortKey)}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{sortDescription(sortKey)}</p>
            </div>

            {roundData.source === "api" && roundData.meta && (
              <div className="rounded-[24px] border border-border/80 bg-background/55 p-5 backdrop-blur">
                <p className="kicker text-[11px] text-muted">Navegação da rodada</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {roundData.meta.round > 1 && (
                    <a
                      href={`?season=${paramSeason}&round=${roundData.meta.round - 1}&sort=${sortKey}`}
                      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-foreground"
                    >
                      Rodada {roundData.meta.round - 1}
                    </a>
                  )}
                  <span className="rounded-full bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent-strong">
                    Rodada {roundData.meta.round}
                  </span>
                  {roundData.meta.round < 38 && (
                    <a
                      href={`?season=${paramSeason}&round=${roundData.meta.round + 1}&sort=${sortKey}`}
                      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-foreground"
                    >
                      Rodada {roundData.meta.round + 1}
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        extra={(
          <div className="flex flex-wrap gap-2">
            {(["score", "home", "odd"] as SortKey[]).map((key) => {
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
                  {sortLabel(key)}
                </a>
              );
            })}
          </div>
        )}
      />

      {(roundData.source === "demo" || degradedIntegrations.length > 0) && (
        <section className="rounded-[24px] border border-signal/25 bg-signal/8 px-5 py-4">
          <p className="text-sm font-semibold text-signal">
            {roundData.source === "demo"
              ? "Estatísticas em modo demonstrativo"
              : "Estatísticas ao vivo com cobertura parcial"}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted">
            {roundData.source === "demo"
              ? describeRoundFallback(roundData.fallbackReason)
              : `As integrações desta rodada chegaram com cobertura parcial: ${degradedIntegrations.join(" · ")}.`}
          </p>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="Leituras-base"
          value={String(anchors.length)}
          description="Confrontos com perfil para sustentar a espinha dorsal do bilhete."
          tone="accent"
        />
        <SectionCard
          title="Teto da rodada"
          value={bestScore > 0 ? `${bestScore}` : "-"}
          description="Maior score encontrado no recorte atual da rodada."
          tone="neutral"
        />
        <SectionCard
          title="Mercado mais curto"
          value={lowestHomeOdd > 0 ? lowestHomeOdd.toFixed(2) : "-"}
          description="Preço mínimo entre os mandantes destacados nesta leitura."
          tone="signal"
        />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="kicker text-xs text-muted">Raio-X completo</p>
            <h2 className="mt-1 text-2xl font-semibold">Confrontos organizados para decisão rápida</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-muted">
            Abra qualquer confronto para ver a leitura completa do BOB, o peso dos fatores e o contexto de mercado antes da entrada.
          </p>
        </div>

        {sorted.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map(({ scored: match, breakdown }) => (
              <MatchStatsCard
                key={match.id}
                match={match}
                breakdown={breakdown}
                homeBadgeUrl={teamBadges[match.homeTeam] ?? null}
                awayBadgeUrl={teamBadges[match.awayTeam] ?? null}
                isAnchor={match.isAnchorCandidate}
              />
            ))}
          </div>
        ) : (
          <div className="panel rounded-[24px] p-5">
            <p className="text-sm font-semibold">Nenhum confronto foi carregado nesta rodada.</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              O painel não recebeu partidas suficientes para montar o raio-X analítico. Revise a rodada selecionada ou aguarde uma nova sincronização.
            </p>
          </div>
        )}
      </section>

      <section className="panel rounded-[28px] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="kicker text-xs text-muted">Como ler esta tela</p>
            <h2 className="mt-1 text-2xl font-semibold">Escala de confiança do BOB</h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted">
            A leitura cruza probabilidade implícita, forma recente, contexto de tabela e sinais de mercado para separar o que é base, o que é jogo trabalhável e o que deve ficar fora do centro do bilhete.
          </p>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="rounded-[22px] border border-border/80 bg-background/55 p-4 backdrop-blur">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-accent" />
              <p className="text-sm font-semibold">Alta confiança</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              Score acima de 70. Faixa em que o confronto pode sustentar a base principal do bilhete.
            </p>
          </div>
          <div className="rounded-[22px] border border-border/80 bg-background/55 p-4 backdrop-blur">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-signal" />
              <p className="text-sm font-semibold">Confiança intermediária</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              Score entre 50 e 69. Existe valor, mas o confronto pede ajuste fino de exposição.
            </p>
          </div>
          <div className="rounded-[22px] border border-border/80 bg-background/55 p-4 backdrop-blur">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-muted/60" />
              <p className="text-sm font-semibold">Baixa confiança</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              Score abaixo de 50. O preço pode até chamar atenção, mas a base analítica ainda é frágil.
            </p>
          </div>
        </div>

        <p className="mt-5 text-xs leading-6 text-muted">
          Probabilidades 1 / X / 2 derivadas das odds de mercado, já normalizadas. A leitura do BOB cruza esse preço com o contexto da rodada para indicar se o jogo serve como base, complemento ou apenas observação.
        </p>
      </section>

      {/* Opinião do BOB Section */}
      <section className="rounded-[28px] border border-accent/30 bg-gradient-to-br from-accent/5 to-surface p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-white text-2xl">
            🤖
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">Opinião do BOB</h2>
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-accent">
                IA Analysis
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Análise gerada pelo BOB baseada em {totalGames} confrontos desta rodada, 
              integrando dados de xG, forma recente, confrontos diretos e mercado de odds.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* High Confidence Picks */}
              <div className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <h3 className="text-sm font-semibold">Favoritos de Alta Confiança</h3>
                </div>
                <p className="mt-2 text-xs text-muted leading-relaxed">
                  {anchors.length > 0 
                    ? `Identifiquei ${anchors.length} âncora${anchors.length > 1 ? 's' : ''} com score > 70. ${anchors.slice(0, 3).map(a => a.scored.homeTeam).join(', ')} ${anchors.length > 3 ? 'e mais...' : 'são as melhores opções para base do bilhete.'}`
                    : "Nenhuma âncora de alta confiança nesta rodada. Análise indica cautela."
                  }
                </p>
              </div>

              {/* Upset Alert */}
              <div className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <h3 className="text-sm font-semibold">Alerta de Zebra</h3>
                </div>
                <p className="mt-2 text-xs text-muted leading-relaxed">
                  Analisando odds desajustadas e xG divergentes, identifiquei potencial para 
                  surpresas em jogos com favoritos overvalued. Fique atento a odds {'>'} 4.00 com value.
                </p>
              </div>

              {/* Strategy Tip */}
              <div className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-accent" />
                  <h3 className="text-sm font-semibold">Dica Estratégica</h3>
                </div>
                <p className="mt-2 text-xs text-muted leading-relaxed">
                  {avgScore > 65 
                    ? "Rodada forte! Múltiplas âncoras disponíveis. Recomendo estratégia 'Fortaleza Máxima'."
                    : avgScore > 50
                    ? "Rodada equilibrada. Mix de favoritos e empates pode gerar valor. Considere 'Empates Táticos'."
                    : "Rodada difícil. Poucas âncoras sólidas. Estratégia mais conservadora recomendada."
                  }
                </p>
              </div>
            </div>

            {/* Detailed Analysis */}
            <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
              <h3 className="text-sm font-semibold mb-2">Análise Detalhada da Rodada</h3>
              <div className="space-y-2 text-xs text-muted leading-relaxed">
                <p>📊 <strong>Contexto Estatístico:</strong> Confiança média de {avgScore}/100 indica 
                {avgScore > 70 ? ' rodada favorável para apostas simples.' : avgScore > 50 ? ' condições de mercado mistas.' : ' cenário desafiador com poucas certezas.'}</p>
                <p>⚽ <strong>Mercado:</strong> Menor odd encontrada foi {lowestHomeOdd.toFixed(2)}, 
                sugerindo {lowestHomeOdd < 1.40 ? 'favorito claro e consolidado.' : lowestHomeOdd < 1.80 ? 'favorito em jogo disputado.' : 'paridade técnica entre os times.'}</p>
                <p>🎯 <strong>Recomendação BOB:</strong> 
                {anchors.length >= 4 
                  ? `Excelente rodada para Big Odds! ${anchors.length} âncoras sólidas permitem criar múltiplas variações com retorno potencial elevado.`
                  : anchors.length >= 2
                  ? `Rodada aceitável. ${anchors.length} âncoras disponíveis para estruturar bilhetes mais curtos.`
                  : 'Rodada fraca em âncoras. Sugiro reduzir exposição ou aguardar próxima rodada.'
                }</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
