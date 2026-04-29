import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHero } from "@/components/page-hero";
import { SectionCard } from "@/components/section-card";
import { TeamIdentity } from "@/components/team-identity";
import { getStandings } from "@/lib/bob/connectors/football-data";
import { calcTeamOdds } from "@/lib/bob/engine/standings-odds";
import type { TeamOdds, TitleProb, RelegProb } from "@/lib/bob/engine/standings-odds";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";

function zoneConfig(position: number) {
  if (position <= 4) {
    return {
      label: "G4 · Libertadores",
      row: "bg-accent/8 border-l-2 border-l-accent",
      dot: "bg-accent",
      text: "text-accent",
    };
  }
  if (position <= 6) {
    return {
      label: "G6 · Sul-Americana",
      row: "bg-accent/4 border-l-2 border-l-accent/40",
      dot: "bg-accent/50",
      text: "text-accent/80",
    };
  }
  if (position === 7) {
    return {
      label: "Copa do Brasil",
      row: "",
      dot: "bg-muted/40",
      text: "text-muted",
    };
  }
  if (position >= 17) {
    return {
      label: "Z4 · Rebaixamento",
      row: "bg-red-500/5 border-l-2 border-l-red-500/50",
      dot: "bg-red-500",
      text: "text-red-600",
    };
  }
  return {
    label: "Miolo da tabela",
    row: "",
    dot: "bg-muted/30",
    text: "text-muted",
  };
}

function titleProbBadge(prob: TitleProb) {
  const map: Record<TitleProb, { cls: string; short: string }> = {
    "Campeão confirmado": { cls: "bg-accent text-white", short: "Confirmado" },
    Alta: { cls: "bg-accent/15 text-accent", short: "Alta" },
    Média: { cls: "bg-signal/15 text-signal", short: "Média" },
    Baixa: { cls: "bg-muted/15 text-muted", short: "Baixa" },
    Eliminado: { cls: "bg-muted/10 text-muted/60", short: "—" },
  };
  return map[prob] ?? map.Eliminado;
}

function relegProbBadge(prob: RelegProb) {
  const map: Record<RelegProb, { cls: string; short: string }> = {
    "Rebaixado confirmado": { cls: "bg-red-600 text-white", short: "Rebaixado" },
    Crítico: { cls: "bg-red-500/20 text-red-600", short: "Crítico" },
    "Risco real": { cls: "bg-signal/15 text-signal", short: "Risco" },
    Atenção: { cls: "bg-signal/10 text-signal/70", short: "Atenção" },
    Seguro: { cls: "bg-muted/10 text-muted/60", short: "—" },
  };
  return map[prob] ?? map.Seguro;
}

function formDotRow(formStr: string | null) {
  if (!formStr) return null;
  const results = formStr.split(",").slice(0, 5);
  return (
    <span className="flex items-center gap-0.5">
      {results.map((result, index) => (
        <span
          key={index}
          title={result === "W" ? "Vitória" : result === "D" ? "Empate" : "Derrota"}
          className={[
            "inline-flex h-4 w-4 items-center justify-center rounded-sm text-[9px] font-bold",
            result === "W"
              ? "bg-accent/15 text-accent"
              : result === "D"
                ? "bg-signal/15 text-signal"
                : "bg-muted/15 text-muted",
          ].join(" ")}
        >
          {result}
        </span>
      ))}
    </span>
  );
}

export default async function ClassificacaoPage() {
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

  type StandingsType = Awaited<ReturnType<typeof getStandings>>;
  let standingsData: StandingsType | null = null;
  let fetchError = false;

  try {
    standingsData = await getStandings();
  } catch {
    fetchError = true;
  }

  const totalTable = standingsData?.standings.find((standing) => standing.type === "TOTAL")?.table ?? [];
  const season = standingsData?.season;
  const teamOdds: TeamOdds[] = totalTable.length ? calcTeamOdds(totalTable) : [];
  const oddsMap = new Map(teamOdds.map((team) => [team.teamId, team]));

  const roundsDone = totalTable[0]?.playedGames ?? 0;
  const roundsLeft = Math.max(0, 38 - roundsDone);
  const titleContenders = teamOdds.filter((team) => team.titleProb === "Alta" || team.titleProb === "Campeão confirmado").length;
  const relegationPressure = teamOdds.filter((team) => team.relegProb !== "Seguro").length;

  const heroChips = [
    {
      label: fetchError ? "Tabela offline" : "Tabela ao vivo",
      tone: fetchError ? ("signal" as const) : ("accent" as const),
    },
    { label: "Escudos unificados", tone: "neutral" as const },
    { label: "Probabilidades editoriais", tone: "neutral" as const },
  ];

  const heroMetrics = [
    { label: "Rodadas jogadas", value: `${roundsDone}`, note: "andamento oficial do campeonato" },
    { label: "Rodadas restantes", value: `${roundsLeft}`, note: "janela ainda aberta para mexer na tabela" },
    { label: "Briga pelo topo", value: `${titleContenders}`, note: "clubes com tração real de título" },
    { label: "Pressão no Z4", value: `${relegationPressure}`, note: "times ainda em zona quente" },
  ];

  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
      <PageHero
        eyebrow={`Brasileirão Série A · ${season?.startDate?.slice(0, 4) ?? new Date().getFullYear()}`}
        title="Classificação premium em tempo real"
        description={`A tabela foi reorganizada para leitura rápida de topo, meio e zona de risco. Além dos pontos, o BOB destaca pressão competitiva, chance de título e risco de queda em uma visão mais útil para quem aposta.`}
        chips={heroChips}
        metrics={heroMetrics}
        aside={(
          <div className="rounded-[24px] border border-border/80 bg-background/55 p-5 backdrop-blur">
            <p className="kicker text-[11px] text-muted">Mapa de zonas</p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-accent" />
                <span>G4 Libertadores</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-accent/50" />
                <span>G6 Sul-Americana</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                <span>Z4 Rebaixamento</span>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted">
              A prioridade aqui é leitura competitiva: quem acelera, quem sustenta e quem entra em zona de risco real.
            </p>
          </div>
        )}
      />

      {fetchError && (
        <section className="rounded-[24px] border border-signal/30 bg-signal/6 px-5 py-4">
          <p className="text-sm font-semibold text-signal">Tabela indisponível no momento</p>
          <p className="mt-1 text-sm leading-6 text-muted">
            Não foi possível carregar os dados oficiais da classificação. Revise o token do provedor principal para restaurar a leitura em tempo real.
          </p>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="Topo da tabela"
          value={titleContenders > 0 ? `${titleContenders}` : "-"}
          description="Clubes que ainda sustentam uma narrativa real de título."
          tone="accent"
        />
        <SectionCard
          title="Linha de corte"
          value={roundsLeft > 0 ? `${roundsLeft}` : "Fechada"}
          description="Quantas rodadas ainda restam para pressionar topo e Z4."
          tone="neutral"
        />
        <SectionCard
          title="Zona de alerta"
          value={relegationPressure > 0 ? `${relegationPressure}` : "-"}
          description="Times que seguem em leitura de atenção para rebaixamento."
          tone="signal"
        />
      </section>

      {totalTable.length > 0 ? (
        <>
          <section className="space-y-4 lg:hidden">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="kicker text-xs text-muted text-left">Leitura responsiva</p>
                <h2 className="mt-1 text-2xl font-semibold text-left">Tabela em cards para mobile</h2>
              </div>
              <p className="max-w-lg text-sm leading-6 text-muted text-left">
                Em telas menores, a classificação vira cards para preservar leitura, escudos e zonas sem esmagar a informação.
              </p>
            </div>

            <div className="grid gap-3">
              {totalTable.map((entry) => {
                const zone = zoneConfig(entry.position);
                const odds = oddsMap.get(entry.team.id);
                const titleBadge = odds ? titleProbBadge(odds.titleProb) : null;
                const relegBadge = odds ? relegProbBadge(odds.relegProb) : null;

                return (
                  <article
                    key={entry.team.id}
                    className={["panel rounded-[24px] p-4", zone.row].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="flex min-w-[3rem] flex-col items-center justify-center rounded-[18px] border border-border/70 bg-background/60 px-2 py-2">
                            <span className="text-[10px] uppercase tracking-[0.2em] text-muted">Pos</span>
                            <span className="mt-1 font-mono text-lg font-bold">{entry.position}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <TeamIdentity
                              teamName={entry.team.name}
                              displayName={entry.team.shortName || entry.team.name}
                              badgeUrl={entry.team.crest}
                              badgeSize={26}
                              className="min-w-0"
                              nameClassName="text-base font-semibold"
                              subtitle={zone.label}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                          <div className="rounded-[18px] border border-border/70 bg-background/55 px-3 py-2 text-center">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Pts</p>
                            <p className="mt-1 font-mono text-lg font-bold">{entry.points}</p>
                          </div>
                          <div className="rounded-[18px] border border-border/70 bg-background/55 px-3 py-2 text-center">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted">J</p>
                            <p className="mt-1 font-mono text-lg font-bold">{entry.playedGames}</p>
                          </div>
                          <div className="rounded-[18px] border border-border/70 bg-background/55 px-3 py-2 text-center">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted">V</p>
                            <p className="mt-1 font-mono text-lg font-bold text-accent">{entry.won}</p>
                          </div>
                          <div className="rounded-[18px] border border-border/70 bg-background/55 px-3 py-2 text-center">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted">SG</p>
                            <p className={["mt-1 font-mono text-lg font-bold", entry.goalDifference > 0 ? "text-accent" : entry.goalDifference < 0 ? "text-red-500" : "text-muted"].join(" ")}>
                              {entry.goalDifference > 0 ? "+" : ""}{entry.goalDifference}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {formDotRow(entry.form)}
                          {titleBadge && odds?.titleProb !== "Eliminado" && (
                            <span className={["rounded-full px-2 py-0.5 text-[10px] font-semibold", titleBadge.cls].join(" ")}>
                              Título {titleBadge.short}
                            </span>
                          )}
                          {relegBadge && odds?.relegProb !== "Seguro" && (
                            <span className={["rounded-full px-2 py-0.5 text-[10px] font-semibold", relegBadge.cls].join(" ")}>
                              Z4 {relegBadge.short}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="hidden lg:block">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="kicker text-xs text-muted text-left">Mesa completa</p>
                <h2 className="mt-1 text-2xl font-semibold text-left">Tabela detalhada para leitura ampla</h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-muted text-left">
                A visão desktop preserva a profundidade da tabela e adiciona contexto competitivo sem comprometer legibilidade.
              </p>
            </div>

            <div className="overflow-x-auto rounded-[24px] border border-border bg-background/70">
              <table className="min-w-[980px] w-full border-collapse text-left text-sm">
                <thead className="bg-[rgba(18,32,24,0.04)]">
                  <tr>
                    <th className="w-12 px-4 py-3 font-medium text-muted">#</th>
                    <th className="px-4 py-3 font-medium text-muted">Time</th>
                    <th className="w-10 px-3 py-3 text-center font-medium text-muted">J</th>
                    <th className="w-10 px-3 py-3 text-center font-medium text-muted">V</th>
                    <th className="w-10 px-3 py-3 text-center font-medium text-muted">E</th>
                    <th className="w-10 px-3 py-3 text-center font-medium text-muted">D</th>
                    <th className="w-10 px-3 py-3 text-center font-medium text-muted">GS</th>
                    <th className="w-10 px-3 py-3 text-center font-medium text-muted">GC</th>
                    <th className="w-12 px-3 py-3 text-center font-medium text-muted">SG</th>
                    <th className="w-14 px-4 py-3 text-center font-semibold text-foreground">Pts</th>
                    <th className="px-3 py-3 font-medium text-muted">Forma</th>
                    <th className="px-3 py-3 text-center font-medium text-muted">Título</th>
                    <th className="px-3 py-3 text-center font-medium text-muted">Z4</th>
                  </tr>
                </thead>
                <tbody>
                  {totalTable.map((entry) => {
                    const zone = zoneConfig(entry.position);
                    const odds = oddsMap.get(entry.team.id);
                    const titleBadge = odds ? titleProbBadge(odds.titleProb) : null;
                    const relegBadge = odds ? relegProbBadge(odds.relegProb) : null;

                    return (
                      <tr
                        key={entry.team.id}
                        className={["border-t border-border/60 align-middle transition hover:bg-white/50", zone.row].join(" ")}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${zone.dot}`} />
                            <span className="font-mono text-sm font-semibold tabular-nums">{entry.position}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <TeamIdentity
                              teamName={entry.team.name}
                              displayName={entry.team.shortName || entry.team.name}
                              badgeUrl={entry.team.crest}
                              badgeSize={22}
                              className="min-w-0 flex-1"
                              nameClassName="font-medium"
                            />
                            <span className={`text-[10px] font-medium ${zone.text}`}>{zone.label}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center font-mono text-xs tabular-nums text-muted">{entry.playedGames}</td>
                        <td className="px-3 py-3 text-center font-mono text-xs tabular-nums text-accent">{entry.won}</td>
                        <td className="px-3 py-3 text-center font-mono text-xs tabular-nums text-muted">{entry.draw}</td>
                        <td className="px-3 py-3 text-center font-mono text-xs tabular-nums text-muted">{entry.lost}</td>
                        <td className="px-3 py-3 text-center font-mono text-xs tabular-nums text-muted">{entry.goalsFor}</td>
                        <td className="px-3 py-3 text-center font-mono text-xs tabular-nums text-muted">{entry.goalsAgainst}</td>
                        <td className={["px-3 py-3 text-center font-mono text-xs tabular-nums", entry.goalDifference > 0 ? "text-accent" : entry.goalDifference < 0 ? "text-red-500" : "text-muted"].join(" ")}>
                          {entry.goalDifference > 0 ? "+" : ""}{entry.goalDifference}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-mono text-base font-bold tabular-nums">{entry.points}</span>
                        </td>
                        <td className="px-3 py-3">{formDotRow(entry.form)}</td>
                        <td className="px-3 py-3 text-center">
                          {titleBadge && odds?.titleProb !== "Eliminado" && (
                            <span title={odds?.titleNote} className={["rounded-full px-2 py-0.5 text-[10px] font-semibold", titleBadge.cls].join(" ")}>
                              {titleBadge.short}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {relegBadge && odds?.relegProb !== "Seguro" && (
                            <span title={odds?.relegNote} className={["rounded-full px-2 py-0.5 text-[10px] font-semibold", relegBadge.cls].join(" ")}>
                              {relegBadge.short}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <section className="panel rounded-[24px] p-5">
          <p className="text-sm font-semibold">A classificação ainda não foi carregada.</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            O painel não recebeu tabela suficiente para montar a leitura competitiva. Aguarde uma nova sincronização ou revise a conexão com o provedor.
          </p>
        </section>
      )}

      {teamOdds.length > 0 && (
        <section className="panel rounded-[28px] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="kicker text-xs text-muted">Leitura competitiva</p>
              <h2 className="mt-1 text-2xl font-semibold">Pressão por título e risco de queda</h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted text-left">
              As probabilidades abaixo não são odds de mercado. Elas funcionam como uma régua editorial do BOB para medir tração esportiva a partir de pontos, rodada e thresholds históricos do Brasileirão.
            </p>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[22px] border border-border/80 bg-background/55 p-5 backdrop-blur">
              <p className="text-sm font-semibold text-foreground">Pista de título</p>
              <div className="mt-3 space-y-2">
                {teamOdds
                  .filter((team) => team.titleProb === "Alta" || team.titleProb === "Média" || team.titleProb === "Campeão confirmado")
                  .slice(0, 6)
                  .map((team) => {
                    const badge = titleProbBadge(team.titleProb);
                    return (
                      <div key={team.teamId} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-muted">
                          {team.position}. {team.teamName}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-mono text-xs text-muted">{team.titleNote}</span>
                          <span className={["rounded-full px-2 py-0.5 text-[10px] font-semibold", badge.cls].join(" ")}>
                            {badge.short}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="rounded-[22px] border border-border/80 bg-background/55 p-5 backdrop-blur">
              <p className="text-sm font-semibold text-foreground">Zona de queda</p>
              <div className="mt-3 space-y-2">
                {teamOdds
                  .filter((team) => team.relegProb !== "Seguro")
                  .slice(-6)
                  .map((team) => {
                    const badge = relegProbBadge(team.relegProb);
                    return (
                      <div key={team.teamId} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-muted">
                          {team.position}. {team.teamName}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-mono text-xs text-muted">{team.relegNote}</span>
                          <span className={["rounded-full px-2 py-0.5 text-[10px] font-semibold", badge.cls].join(" ")}>
                            {badge.short}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
