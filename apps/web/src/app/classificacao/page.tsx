import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getStandings } from "@/lib/bob/connectors/football-data";
import { calcTeamOdds } from "@/lib/bob/engine/standings-odds";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { TeamIdentity } from "@/components/team-identity";
import type { TeamOdds, TitleProb, RelegProb } from "@/lib/bob/engine/standings-odds";

// ─── Helpers visuais ──────────────────────────────────────────────────────────

function zoneConfig(position: number) {
  if (position <= 4)   return { label: "G4 · Libertadores",      row: "bg-accent/8 border-l-2 border-l-accent",   dot: "bg-accent",  text: "text-accent" };
  if (position <= 6)   return { label: "G6 · Sulamericana",      row: "bg-accent/4 border-l-2 border-l-accent/40",dot: "bg-accent/50",text: "text-accent/70" };
  if (position === 7)  return { label: "Copa do Brasil",          row: "",                                          dot: "bg-muted/40", text: "text-muted" };
  if (position >= 17)  return { label: "Z4 · Rebaixamento",       row: "bg-red-500/5 border-l-2 border-l-red-500/50",dot:"bg-red-500", text: "text-red-600" };
  return { label: "", row: "", dot: "bg-muted/30", text: "text-muted" };
}

function titleProbBadge(prob: TitleProb) {
  const map: Record<TitleProb, { cls: string; short: string }> = {
    "Campeão confirmado": { cls: "bg-accent text-white",          short: "Confirmado" },
    "Alta":               { cls: "bg-accent/15 text-accent",      short: "Alta" },
    "Média":              { cls: "bg-signal/15 text-signal",      short: "Média" },
    "Baixa":              { cls: "bg-muted/15 text-muted",        short: "Baixa" },
    "Eliminado":          { cls: "bg-muted/10 text-muted/60",     short: "—" },
  };
  return map[prob] ?? map["Eliminado"];
}

function relegProbBadge(prob: RelegProb) {
  const map: Record<RelegProb, { cls: string; short: string }> = {
    "Rebaixado confirmado": { cls: "bg-red-600 text-white",         short: "Rebaixado" },
    "Crítico":              { cls: "bg-red-500/20 text-red-600",    short: "Crítico" },
    "Risco real":           { cls: "bg-signal/15 text-signal",      short: "Risco" },
    "Atenção":              { cls: "bg-signal/10 text-signal/70",   short: "Atenção" },
    "Seguro":               { cls: "bg-muted/10 text-muted/60",     short: "—" },
  };
  return map[prob] ?? map["Seguro"];
}

function formDotRow(formStr: string | null) {
  if (!formStr) return null;
  const results = formStr.split(",").slice(0, 5);
  return (
    <span className="flex items-center gap-0.5">
      {results.map((r, i) => (
        <span
          key={i}
          title={r === "W" ? "Vitória" : r === "D" ? "Empate" : "Derrota"}
          className={[
            "inline-flex h-4 w-4 items-center justify-center rounded-sm text-[9px] font-bold",
            r === "W" ? "bg-accent/15 text-accent"
            : r === "D" ? "bg-signal/15 text-signal"
            : "bg-muted/15 text-muted",
          ].join(" ")}
        >
          {r}
        </span>
      ))}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ClassificacaoPage() {
  // ── Auth guard ─────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const dbUser = await prisma.user.findUnique({
    where:  { email: user.email!.toLowerCase() },
    select: { active: true },
  }).catch(() => null);

  if (!dbUser?.active) redirect("/login");

  // ── Buscar tabela (football-data.org, cache 4h) ────────────────────────
  type StandingsType = Awaited<ReturnType<typeof getStandings>>;
  let standingsData: StandingsType | null = null;
  let fetchError = false;

  try {
    standingsData = await getStandings();
  } catch {
    fetchError = true;
  }

  const totalTable = standingsData?.standings.find((s) => s.type === "TOTAL")?.table ?? [];
  const season = standingsData?.season;
  const teamOdds: TeamOdds[] = totalTable.length ? calcTeamOdds(totalTable) : [];
  const oddsMap = new Map(teamOdds.map((t) => [t.teamId, t]));

  const roundsDone = totalTable[0]?.playedGames ?? 0;
  const roundsLeft = Math.max(0, 38 - roundsDone);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">

      {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
      <section className="panel rounded-[28px] p-6 sm:p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="kicker text-xs text-muted">
              Classificação · Brasileirão Série A {season?.startDate?.slice(0, 4) ?? ""}
            </p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight sm:text-4xl">
              Tabela em tempo real
            </h1>
            <p className="mt-2 text-sm leading-7 text-muted">
              Rodada {roundsDone} de 38 · {roundsLeft} rodadas restantes.
              {fetchError && " (Dados offline — verifique FOOTBALL_DATA_TOKEN)"}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-accent" />
              G4 Libertadores
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-accent/50" />
              G6 Sulamericana
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              Z4 Rebaixamento
            </span>
          </div>
        </div>
      </section>

      {fetchError && (
        <div className="rounded-[20px] border border-signal/30 bg-signal/5 px-5 py-4 text-sm text-signal">
          Não foi possível carregar a tabela. Configure <code className="rounded bg-surface-strong px-1">FOOTBALL_DATA_TOKEN</code> no <code className="rounded bg-surface-strong px-1">.env.local</code> para ver os dados reais.
        </div>
      )}

      {/* ── Tabela principal ──────────────────────────────────────────── */}
      {totalTable.length > 0 && (
        <section>
          <div className="overflow-hidden rounded-[20px] border border-border">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[rgba(18,32,24,0.04)]">
                <tr>
                  <th className="px-4 py-3 font-medium text-muted w-10">#</th>
                  <th className="px-4 py-3 font-medium text-muted">Time</th>
                  <th className="px-3 py-3 text-center font-medium text-muted w-10">J</th>
                  <th className="px-3 py-3 text-center font-medium text-muted w-10">V</th>
                  <th className="px-3 py-3 text-center font-medium text-muted w-10">E</th>
                  <th className="px-3 py-3 text-center font-medium text-muted w-10">D</th>
                  <th className="px-3 py-3 text-center font-medium text-muted w-10">GS</th>
                  <th className="px-3 py-3 text-center font-medium text-muted w-10">GC</th>
                  <th className="px-3 py-3 text-center font-medium text-muted w-12">SG</th>
                  <th className="px-4 py-3 text-center font-semibold text-foreground w-14">Pts</th>
                  <th className="hidden px-3 py-3 font-medium text-muted sm:table-cell">Forma</th>
                  <th className="hidden px-3 py-3 text-center font-medium text-muted lg:table-cell">Título</th>
                  <th className="hidden px-3 py-3 text-center font-medium text-muted lg:table-cell">Z4</th>
                </tr>
              </thead>
              <tbody>
                {totalTable.map((entry) => {
                  const zone  = zoneConfig(entry.position);
                  const odds  = oddsMap.get(entry.team.id);
                  const tBadge = odds ? titleProbBadge(odds.titleProb) : null;
                  const rBadge = odds ? relegProbBadge(odds.relegProb) : null;

                  return (
                    <tr
                      key={entry.team.id}
                      className={["border-t border-border/60 align-middle transition hover:bg-white/50", zone.row].join(" ")}
                    >
                      {/* Posição */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${zone.dot}`} />
                          <span className="font-mono text-sm font-semibold tabular-nums">
                            {entry.position}
                          </span>
                        </div>
                      </td>

                      {/* Time */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <TeamIdentity
                            teamName={entry.team.name}
                            displayName={entry.team.shortName || entry.team.name}
                            badgeUrl={entry.team.crest}
                            badgeSize={20}
                            className="flex-1"
                            nameClassName="font-medium"
                          />
                          {zone.label && (
                            <span className={`hidden text-[10px] font-medium lg:inline ${zone.text}`}>
                              {zone.label}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Stats */}
                      <td className="px-3 py-2.5 text-center font-mono text-xs tabular-nums text-muted">{entry.playedGames}</td>
                      <td className="px-3 py-2.5 text-center font-mono text-xs tabular-nums text-accent">{entry.won}</td>
                      <td className="px-3 py-2.5 text-center font-mono text-xs tabular-nums text-muted">{entry.draw}</td>
                      <td className="px-3 py-2.5 text-center font-mono text-xs tabular-nums text-muted">{entry.lost}</td>
                      <td className="px-3 py-2.5 text-center font-mono text-xs tabular-nums text-muted">{entry.goalsFor}</td>
                      <td className="px-3 py-2.5 text-center font-mono text-xs tabular-nums text-muted">{entry.goalsAgainst}</td>
                      <td className={["px-3 py-2.5 text-center font-mono text-xs tabular-nums", entry.goalDifference > 0 ? "text-accent" : entry.goalDifference < 0 ? "text-red-500" : "text-muted"].join(" ")}>
                        {entry.goalDifference > 0 ? "+" : ""}{entry.goalDifference}
                      </td>

                      {/* Pontos */}
                      <td className="px-4 py-2.5 text-center">
                        <span className="font-mono text-base font-bold tabular-nums">{entry.points}</span>
                      </td>

                      {/* Forma */}
                      <td className="hidden px-3 py-2.5 sm:table-cell">
                        {formDotRow(entry.form)}
                      </td>

                      {/* Título */}
                      <td className="hidden px-3 py-2.5 text-center lg:table-cell">
                        {tBadge && odds?.titleProb !== "Eliminado" && (
                          <span title={odds?.titleNote} className={["rounded-full px-2 py-0.5 text-[10px] font-semibold", tBadge.cls].join(" ")}>
                            {tBadge.short}
                          </span>
                        )}
                      </td>

                      {/* Rebaixamento */}
                      <td className="hidden px-3 py-2.5 text-center lg:table-cell">
                        {rBadge && odds?.relegProb !== "Seguro" && (
                          <span title={odds?.relegNote} className={["rounded-full px-2 py-0.5 text-[10px] font-semibold", rBadge.cls].join(" ")}>
                            {rBadge.short}
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
      )}

      {/* ── Legenda de probabilidades ─────────────────────────────────── */}
      {teamOdds.length > 0 && (
        <section className="panel rounded-[20px] p-5">
          <p className="kicker text-xs text-muted">Probabilidades de título e rebaixamento</p>
          <p className="mt-1 text-xs text-muted">
            Estimativas baseadas em pontos atuais, rodadas restantes e thresholds históricos do Brasileirão
            (≥70 pts para título, ≥45 pts para escapar do Z4). Passe o mouse sobre os badges para ver o contexto.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {/* Candidatos ao título */}
            <div>
              <p className="text-xs font-semibold text-foreground">Candidatos ao título</p>
              <div className="mt-2 space-y-1.5">
                {teamOdds
                  .filter((t) => t.titleProb === "Alta" || t.titleProb === "Média" || t.titleProb === "Campeão confirmado")
                  .slice(0, 6)
                  .map((t) => {
                    const b = titleProbBadge(t.titleProb);
                    return (
                      <div key={t.teamId} className="flex items-center justify-between text-xs">
                        <span className="text-muted">{t.position}. {t.teamName}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-muted">{t.titleNote}</span>
                          <span className={["rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0", b.cls].join(" ")}>
                            {b.short}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Zona de rebaixamento */}
            <div>
              <p className="text-xs font-semibold text-foreground">Zona de rebaixamento</p>
              <div className="mt-2 space-y-1.5">
                {teamOdds
                  .filter((t) => t.relegProb !== "Seguro")
                  .slice(-6)
                  .map((t) => {
                    const b = relegProbBadge(t.relegProb);
                    return (
                      <div key={t.teamId} className="flex items-center justify-between text-xs">
                        <span className="text-muted">{t.position}. {t.teamName}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-muted">{t.relegNote}</span>
                          <span className={["rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0", b.cls].join(" ")}>
                            {b.short}
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
