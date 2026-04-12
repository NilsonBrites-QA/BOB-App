import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getStandings,
  getMatchesByMatchday,
  getCurrentMatchday,
  type FDMatch,
} from "@/lib/bob/connectors/football-data";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateBR(utcDate: string) {
  const d = new Date(utcDate);
  return d.toLocaleDateString("pt-BR", {
    weekday: "short",
    day:     "2-digit",
    month:   "short",
    timeZone: "America/Sao_Paulo",
  });
}

function formatTimeBR(utcDate: string) {
  const d = new Date(utcDate);
  return d.toLocaleTimeString("pt-BR", {
    hour:   "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function statusConfig(status: string) {
  switch (status) {
    case "FINISHED":   return { label: "Finalizado",    cls: "bg-muted/10 text-muted" };
    case "IN_PLAY":    return { label: "Ao vivo",        cls: "bg-accent/20 text-accent animate-pulse" };
    case "PAUSED":     return { label: "Intervalo",      cls: "bg-signal/15 text-signal" };
    case "TIMED":
    case "SCHEDULED":  return { label: "Programado",    cls: "bg-surface-strong/80 text-muted" };
    case "POSTPONED":  return { label: "Adiado",         cls: "bg-red-500/10 text-red-500" };
    case "CANCELLED":  return { label: "Cancelado",      cls: "bg-red-500/10 text-red-400" };
    default:           return { label: status,           cls: "bg-muted/10 text-muted" };
  }
}

function ScoreDisplay({ match }: { match: FDMatch }) {
  const finished = match.status === "FINISHED";
  const live     = match.status === "IN_PLAY" || match.status === "PAUSED";
  const home     = match.score.fullTime.home;
  const away     = match.score.fullTime.away;

  if ((finished || live) && home !== null && away !== null) {
    return (
      <span className={["font-mono text-base font-bold tabular-nums", live ? "text-accent" : "text-foreground"].join(" ")}>
        {home} – {away}
      </span>
    );
  }
  return (
    <span className="font-mono text-sm text-muted">
      {formatTimeBR(match.utcDate)}
    </span>
  );
}

function groupByDate(matches: FDMatch[]): Array<{ dateLabel: string; matches: FDMatch[] }> {
  const map = new Map<string, FDMatch[]>();
  for (const m of matches) {
    const d = new Date(m.utcDate);
    const key = d.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return Array.from(map.entries()).map(([dateLabel, matches]) => ({ dateLabel, matches }));
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams?: Promise<{ rodada?: string }>;
}) {
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

  // ── Determinar rodada ──────────────────────────────────────────────────
  const params = searchParams ? await searchParams : {};
  let currentMatchday = 1;
  let fetchError = false;

  try {
    currentMatchday = await getCurrentMatchday();
  } catch {
    fetchError = true;
    currentMatchday = 1;
  }

  const requestedRound = params.rodada
    ? Math.max(1, Math.min(38, parseInt(params.rodada, 10) || currentMatchday))
    : currentMatchday;

  // Rodadas disponíveis para navegar (current-2 até current+3, clamped 1-38)
  const nearbyRounds = Array.from({ length: 6 }, (_, i) =>
    Math.max(1, Math.min(38, currentMatchday - 2 + i))
  ).filter((v, i, a) => a.indexOf(v) === i);

  // ── Buscar jogos da rodada ─────────────────────────────────────────────
  let matches: FDMatch[] = [];
  try {
    const res = await getMatchesByMatchday(requestedRound);
    matches = res.matches ?? [];
  } catch {
    fetchError = true;
  }

  const grouped = groupByDate(matches);
  const finishedCount  = matches.filter((m) => m.status === "FINISHED").length;
  const scheduledCount = matches.filter((m) => ["TIMED", "SCHEDULED"].includes(m.status)).length;
  const liveCount      = matches.filter((m) => ["IN_PLAY", "PAUSED"].includes(m.status)).length;

  // ── Verificar quais matchdays o BOB já analisou (tem rounds no DB) ─────
  const analyzedRounds = new Set<number>();
  try {
    const rounds = await prisma.round.findMany({ select: { number: true }, where: { season: { year: 2025 } } });
    for (const r of rounds) analyzedRounds.add(r.number);
  } catch { /* silente */ }

  const bobHasRound = analyzedRounds.has(requestedRound);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">

      {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
      <section className="panel rounded-[28px] p-6 sm:p-8">
        <p className="kicker text-xs text-muted">Calendário · Brasileirão Série A 2025</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight sm:text-4xl">
          Rodada {requestedRound}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted">
          {liveCount > 0 && (
            <span className="flex items-center gap-1.5 text-accent">
              <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
              {liveCount} ao vivo
            </span>
          )}
          {finishedCount > 0 && <span>{finishedCount} finalizado{finishedCount !== 1 ? "s" : ""}</span>}
          {scheduledCount > 0 && <span>{scheduledCount} programado{scheduledCount !== 1 ? "s" : ""}</span>}
          {fetchError && <span className="text-signal">Dados offline</span>}
        </div>

        {/* Navegação entre rodadas */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {nearbyRounds.map((r) => (
            <Link
              key={r}
              href={`/calendario?rodada=${r}`}
              className={[
                "rounded-full px-3 py-1 text-xs font-medium transition",
                r === requestedRound
                  ? "bg-accent text-white"
                  : "bg-surface-strong text-muted hover:text-foreground",
              ].join(" ")}
            >
              {r === currentMatchday ? `${r} ·` : r}
              {r === currentMatchday ? " atual" : ""}
            </Link>
          ))}

          {/* Ir para rodada manual */}
          <form method="GET" action="/calendario" className="flex items-center gap-1.5 ml-2">
            <input
              type="number"
              name="rodada"
              min="1"
              max="38"
              defaultValue={requestedRound}
              className="w-14 rounded-full border border-border bg-surface-strong px-3 py-1 text-center text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              type="submit"
              className="rounded-full bg-surface-strong px-3 py-1 text-xs text-muted hover:text-foreground transition"
            >
              Ir
            </button>
          </form>
        </div>
      </section>

      {/* ── Link para análise do BOB ───────────────────────────────────── */}
      {bobHasRound && (
        <div className="flex items-center gap-3 rounded-[16px] border border-accent/20 bg-accent/5 px-5 py-4">
          <span className="text-accent text-lg">✦</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">O BOB analisou esta rodada</p>
            <p className="text-xs text-muted">Veja os picks, previsões e análise de fatores.</p>
          </div>
          <Link
            href={`/dashboard?rodada=${requestedRound}`}
            className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-accent/90"
          >
            Ver análise
          </Link>
        </div>
      )}

      {/* ── Mensagem de erro ──────────────────────────────────────────── */}
      {fetchError && (
        <div className="rounded-[16px] border border-signal/30 bg-signal/5 px-5 py-4 text-sm text-signal">
          Não foi possível carregar os jogos. Configure{" "}
          <code className="rounded bg-surface-strong px-1">FOOTBALL_DATA_TOKEN</code> no{" "}
          <code className="rounded bg-surface-strong px-1">.env.local</code>.
        </div>
      )}

      {/* ── Jogos agrupados por data ──────────────────────────────────── */}
      {grouped.length > 0 ? (
        <div className="flex flex-col gap-6">
          {grouped.map(({ dateLabel, matches: dayMatches }) => (
            <section key={dateLabel}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
                {dateLabel}
              </p>
              <div className="flex flex-col gap-2">
                {dayMatches.map((match) => {
                  const st = statusConfig(match.status);
                  return (
                    <div
                      key={match.id}
                      className="panel flex items-center gap-3 rounded-[16px] px-4 py-3 sm:gap-5 sm:px-6"
                    >
                      {/* Status */}
                      <span className={["shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", st.cls].join(" ")}>
                        {st.label}
                      </span>

                      {/* Time da casa */}
                      <div className="flex flex-1 items-center justify-end gap-2">
                        <span className="hidden text-sm font-medium sm:block text-right">
                          {match.homeTeam.shortName || match.homeTeam.name}
                        </span>
                        <span className="block text-sm font-medium sm:hidden text-right">
                          {match.homeTeam.tla || match.homeTeam.shortName}
                        </span>
                        {match.homeTeam.crest && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={match.homeTeam.crest}
                            alt={match.homeTeam.shortName}
                            width={24}
                            height={24}
                            className="h-6 w-6 object-contain"
                          />
                        )}
                      </div>

                      {/* Placar / Horário */}
                      <div className="w-24 shrink-0 text-center">
                        <ScoreDisplay match={match} />
                      </div>

                      {/* Time visitante */}
                      <div className="flex flex-1 items-center gap-2">
                        {match.awayTeam.crest && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={match.awayTeam.crest}
                            alt={match.awayTeam.shortName}
                            width={24}
                            height={24}
                            className="h-6 w-6 object-contain"
                          />
                        )}
                        <span className="hidden text-sm font-medium sm:block">
                          {match.awayTeam.shortName || match.awayTeam.name}
                        </span>
                        <span className="block text-sm font-medium sm:hidden">
                          {match.awayTeam.tla || match.awayTeam.shortName}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        !fetchError && (
          <p className="text-center text-sm text-muted py-16">
            Nenhum jogo encontrado para a rodada {requestedRound}.
          </p>
        )
      )}

    </div>
  );
}
