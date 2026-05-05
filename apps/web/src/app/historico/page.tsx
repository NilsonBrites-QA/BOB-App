import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { loadAllBadgesFromDb, resolveBadge } from "@/lib/badges/badge-service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Pick = {
  id: string;
  match: string;
  result: string;
  odd: number;
  isAnchor: boolean;
  position: number;
  correct: boolean | null;
  actualResult: string | null;
};

type Variation = {
  id: string;
  code: string;
  title: string;
  posture: string;
  projectedOdd: number;
  gameCount: number;
  status: string;
  picks: Pick[];
};

type RoundResultData = {
  variationPlayed: string | null;
  hit: boolean;
  grossReturn: { toString(): string };
  netReturn: { toString(): string };
  totalStaked: { toString(): string };
};

type RoundData = {
  id: string;
  number: number;
  status: string;
  firstMatchAt: Date | null;
  deliveredAt: Date | null;
  variations: Variation[];
  result: RoundResultData | null;
};

function pickBadge(correct: boolean | null) {
  if (correct === true)  return { cls: "bg-accent/15 text-accent border-accent/20",      icon: "✓", label: "Acertou"  };
  if (correct === false) return { cls: "bg-red-500/12 text-red-500 border-red-500/20",   icon: "✗", label: "Errou"    };
  return                        { cls: "bg-muted/10 text-muted border-border",            icon: "·", label: "Pendente" };
}

function variationStatus(picks: Pick[]) {
  const withResult = picks.filter((p) => p.correct !== null);
  const allKnown   = withResult.length === picks.length && picks.length > 0;
  const anyWrong   = picks.some((p) => p.correct === false);
  const allCorrect = picks.length > 0 && picks.every((p) => p.correct === true);

  if (allCorrect && allKnown) return "winner";
  if (anyWrong)               return "lost";
  if (withResult.length > 0)  return "partial";
  return "pending";
}

function variationCard(v: Variation, status: ReturnType<typeof variationStatus>) {
  const correctCount = v.picks.filter((p) => p.correct === true).length;
  const knownCount   = v.picks.filter((p) => p.correct !== null).length;

  const borderCls =
    status === "winner"  ? "border-yellow-400/60 bg-yellow-50/50" :
    status === "lost"    ? "border-red-400/20 bg-red-50/30" :
    status === "partial" ? "border-signal/20" :
                           "border-border";

  const codeBadge =
    status === "winner"  ? "bg-yellow-400/20 text-yellow-700" :
    status === "lost"    ? "bg-red-500/12 text-red-500" :
                           "bg-muted/12 text-muted";

  return { borderCls, codeBadge, correctCount, knownCount };
}

function formatDate(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

function pct(num: number, den: number) {
  if (den === 0) return "—";
  return `${Math.round((num / den) * 100)}%`;
}

// ─── Métricas acumuladas ──────────────────────────────────────────────────────

function computeMetrics(rounds: RoundData[]) {
  let totalPicksKnown = 0;
  let totalCorrect    = 0;
  let anchorKnown     = 0;
  let anchorCorrect   = 0;
  let variationsTotal = 0;
  let variationsWon   = 0;

  for (const r of rounds) {
    for (const v of r.variations) {
      const known   = v.picks.filter((p) => p.correct !== null).length;
      const correct = v.picks.filter((p) => p.correct === true).length;
      totalPicksKnown += known;
      totalCorrect    += correct;

      for (const p of v.picks) {
        if (p.isAnchor && p.correct !== null) { anchorKnown++; if (p.correct) anchorCorrect++; }
      }

      if (known === v.picks.length && v.picks.length > 0) {
        variationsTotal++;
        if (correct === v.picks.length) variationsWon++;
      }
    }
  }

  const perRound = rounds.map((r) => {
    let k = 0, c = 0;
    for (const v of r.variations) {
      for (const p of v.picks) {
        if (p.correct !== null) { k++; if (p.correct) c++; }
      }
    }
    return { number: r.number, accuracy: k ? c / k : null };
  }).reverse(); // ascending

  return { totalPicksKnown, totalCorrect, anchorKnown, anchorCorrect, variationsTotal, variationsWon, perRound };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function HistoricoPage({
  searchParams,
}: {
  searchParams?: Promise<{ rodada?: string }>;
}) {
  // ── Auth guard ───────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const dbUser = await prisma.user.findUnique({
    where:  { email: user.email!.toLowerCase() },
    select: { active: true },
  }).catch(() => null);
  if (!dbUser?.active) redirect("/login");

  // ── Buscar rodadas com variações, picks e resultados ────────────────────
  const currentYear = new Date().getFullYear();

  const rounds = await prisma.round.findMany({
    where: {
      status: { in: ["DELIVERED", "CLOSED"] },
      season: { year: currentYear },
    },
    orderBy: { number: "desc" },
    include: {
      variations: {
        orderBy: { code: "asc" },
        include: {
          picks: { orderBy: { position: "asc" } },
        },
      },
      result: true,
    },
  }) as unknown as RoundData[];

  // ── Rodada selecionada ───────────────────────────────────────────────────
  const params = searchParams ? await searchParams : {};
  const selectedNumber = params.rodada
    ? parseInt(params.rodada, 10)
    : rounds[0]?.number ?? null;

  const selectedRound = rounds.find((r) => r.number === selectedNumber) ?? rounds[0] ?? null;

  const metrics = computeMetrics(rounds);
  const maxAccuracy = Math.max(...metrics.perRound.map((r) => r.accuracy ?? 0), 0.01);

  // ── Dados do Cérebro BOB ─────────────────────────────────────────────────
  const [factorWeights, simResults, antiPatterns, reflections] = await Promise.all([
    prisma.factorWeight.findMany({
      where: { season: currentYear },
      orderBy: { round: "desc" },
      take: 10,
    }).catch(() => []),
    prisma.simulationResult.findMany({
      where: { season: currentYear },
      orderBy: { round: "desc" },
      take: 10,
    }).catch(() => []),
    prisma.conditionalPattern.findMany({
      where: { isAntiCorr: true, isSuppressed: false },
      orderBy: { occurrences: "desc" },
      take: 8,
    }).catch(() => []),
    prisma.memoryEvent.findMany({
      where: { type: "reflection", layer: "DECISIONS" },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { id: true, content: true, createdAt: true, roundId: true },
    }).catch(() => [] as { id: string; content: unknown; createdAt: Date; roundId: string | null }[]),
  ]);

  // Escudos DB-first — uma query para toda a página
  const badgeMap = await loadAllBadgesFromDb().catch(() => new Map<string, string | null>());

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">

      {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
      <section className="panel rounded-[28px] p-6 sm:p-8">
        <p className="kicker text-xs text-muted">Histórico · Brasileirão {currentYear}</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight sm:text-4xl">
          Histórico de Variações
        </h1>
        <p className="mt-2 text-sm text-muted">
          Rodadas encerradas com picks registrados — verde acertou, vermelho errou.
        </p>
      </section>

      {/* ── Estado vazio ──────────────────────────────────────────────── */}
      {rounds.length === 0 && (
        <div className="rounded-[20px] border border-border bg-surface-strong/40 px-6 py-12 text-center">
          <p className="text-2xl">📊</p>
          <p className="mt-3 font-medium text-foreground">Nenhuma rodada encerrada ainda</p>
          <p className="mt-1 text-sm text-muted">
            O histórico aparece aqui assim que picks forem marcados como corretos ou incorretos pelo Admin.
          </p>
          <Link
            href="/admin"
            className="mt-5 inline-flex rounded-full bg-accent px-5 py-2 text-xs font-semibold text-white transition hover:bg-accent/90"
          >
            Ir para o Admin
          </Link>
        </div>
      )}

      {rounds.length > 0 && (
        <>
          {/* ── Métricas acumuladas (7D) ─────────────────────────────── */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="panel rounded-[20px] p-5">
              <p className="text-xs text-muted">Rodadas analisadas</p>
              <p className="mt-1 text-3xl font-bold">{rounds.length}</p>
              <p className="mt-1 text-xs text-muted">rodadas com resultado</p>
            </div>
            <div className="panel rounded-[20px] p-5">
              <p className="text-xs text-muted">Acurácia geral de picks</p>
              <p className="mt-1 text-3xl font-bold text-accent">
                {pct(metrics.totalCorrect, metrics.totalPicksKnown)}
              </p>
              <p className="mt-1 text-xs text-muted">
                {metrics.totalCorrect}/{metrics.totalPicksKnown} picks certos
              </p>
            </div>
            <div className="panel rounded-[20px] p-5">
              <p className="text-xs text-muted">Acurácia de âncoras</p>
              <p className="mt-1 text-3xl font-bold text-accent">
                {pct(metrics.anchorCorrect, metrics.anchorKnown)}
              </p>
              <p className="mt-1 text-xs text-muted">
                {metrics.anchorCorrect}/{metrics.anchorKnown} âncoras certas
              </p>
            </div>
            <div className="panel rounded-[20px] p-5">
              <p className="text-xs text-muted">Variações vencedoras</p>
              <p className="mt-1 text-3xl font-bold text-yellow-600">
                {pct(metrics.variationsWon, metrics.variationsTotal)}
              </p>
              <p className="mt-1 text-xs text-muted">
                {metrics.variationsWon}/{metrics.variationsTotal} bilhetes cheios
              </p>
            </div>
          </section>

          {/* ── Gráfico de evolução por rodada ───────────────────────── */}
          {metrics.perRound.length > 1 && (
            <section className="panel rounded-[20px] p-5">
              <p className="kicker mb-4 text-xs text-muted">Evolução da acurácia por rodada</p>
              <div className="flex items-end gap-1.5" style={{ height: "68px" }}>
                {metrics.perRound.map((r) => {
                  const acc    = r.accuracy ?? 0;
                  const MAX_PX = 52; // área de barra (deixa espaço pro label abaixo)
                  const barPx  = maxAccuracy > 0
                    ? Math.max(4, Math.round((acc / maxAccuracy) * MAX_PX))
                    : 4;
                  const barCls =
                    acc >= 0.75 ? "bg-accent" :
                    acc >= 0.5  ? "bg-accent/50" :
                                  "bg-red-400/50";
                  return (
                    <div
                      key={r.number}
                      title={`Rodada ${r.number}: ${Math.round(acc * 100)}%`}
                      className="flex flex-1 flex-col items-center gap-1"
                    >
                      <div
                        className={["w-full rounded-t-sm", barCls].join(" ")}
                        style={{ height: `${barPx}px` }}
                      />
                      <span className="text-[9px] text-muted font-mono leading-none">{r.number}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted">
                Acurácia de picks por rodada — quanto mais alto, melhor. Alvo ≥ 75%.
              </p>
            </section>
          )}

          {/* ── Seletor de rodadas ────────────────────────────────────── */}
          <section className="flex flex-wrap items-center gap-2">
            {rounds.map((r) => {
              const hasWinner = r.variations.some((v) => variationStatus(v.picks) === "winner");
              const anyWrong  = r.variations.some((v) => v.picks.some((p) => p.correct === false));

              const roundCls =
                r.number === selectedNumber
                  ? "bg-accent text-white"
                  : hasWinner
                  ? "bg-yellow-100 text-yellow-700 border border-yellow-300"
                  : anyWrong
                  ? "bg-red-50 text-red-600 border border-red-200"
                  : "bg-surface-strong text-muted border border-border";

              return (
                <Link
                  key={r.id}
                  href={`/historico?rodada=${r.number}`}
                  className={["rounded-full px-3 py-1.5 text-xs font-semibold transition hover:opacity-80", roundCls].join(" ")}
                >
                  R{r.number}
                  {hasWinner ? " 🏆" : ""}
                </Link>
              );
            })}
          </section>

          {/* ── Detalhe da rodada selecionada ────────────────────────── */}
          {selectedRound && (
            <section className="space-y-5">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="kicker text-xs text-muted">Rodada {selectedRound.number}</p>
                  <h2 className="mt-1 text-2xl font-semibold">
                    {formatDate(selectedRound.firstMatchAt ?? selectedRound.deliveredAt)}
                  </h2>
                </div>

                {/* Resumo financeiro se tiver resultado registrado */}
                {selectedRound.result && (
                  <div className="flex flex-wrap gap-3 text-xs">
                    <span className={[
                      "rounded-full px-3 py-1 font-semibold",
                      selectedRound.result.hit
                        ? "bg-accent/15 text-accent"
                        : "bg-red-500/10 text-red-500",
                    ].join(" ")}>
                      {selectedRound.result.hit ? "✓ Bilhete verde" : "✗ Bilhete vermelho"}
                    </span>
                    {selectedRound.result.variationPlayed && (
                      <span className="rounded-full bg-surface-strong px-3 py-1 text-muted">
                        JogOU {selectedRound.result.variationPlayed}
                      </span>
                    )}
                    <span className={[
                      "rounded-full px-3 py-1 font-semibold font-mono",
                      parseFloat(selectedRound.result.netReturn.toString()) >= 0
                        ? "bg-accent/10 text-accent"
                        : "bg-red-500/10 text-red-500",
                    ].join(" ")}>
                      {parseFloat(selectedRound.result.netReturn.toString()) >= 0 ? "+" : ""}
                      R$ {parseFloat(selectedRound.result.netReturn.toString()).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              {/* Variações */}
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {selectedRound.variations.map((v) => {
                  const vstatus = variationStatus(v.picks);
                  const { borderCls, codeBadge, correctCount, knownCount } = variationCard(v, vstatus);

                  return (
                    <div
                      key={v.id}
                      className={["panel rounded-[20px] border p-5 space-y-4 transition", borderCls].join(" ")}
                    >
                      {/* Header da variação */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className={["rounded-full px-2.5 py-0.5 text-xs font-bold", codeBadge].join(" ")}>
                            {v.code}
                          </span>
                          {vstatus === "winner" && (
                            <span className="rounded-full bg-yellow-300/40 px-2 py-0.5 text-[10px] font-bold text-yellow-700">
                              🏆 VENCEDOR
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm font-bold">{v.projectedOdd.toFixed(2)}x</p>
                          <p className="text-[10px] text-muted">odd projetada</p>
                        </div>
                      </div>

                      {/* Resumo */}
                      <div>
                        <p className="text-xs font-medium text-foreground">{v.title}</p>
                        <p className="mt-0.5 text-[10px] text-muted">
                          {knownCount > 0
                            ? `${correctCount}/${knownCount} picks certos · ${v.posture}`
                            : `${v.picks.length} picks · ${v.posture} · Pendente`}
                        </p>
                      </div>

                      {/* Picks */}
                      <div className="space-y-1.5">
                        {v.picks.map((p) => {
                          const badge = pickBadge(p.correct);
                          // Parse "Time A x Time B" para extrair escudos
                          const matchParts = p.match.split(/\s+[x×]\s+/i);
                          const homeTeam = matchParts[0]?.trim() ?? "";
                          const awayTeam = matchParts[1]?.trim() ?? "";
                          const pickTeam =
                            p.result === "HOME" ? homeTeam :
                            p.result === "AWAY" ? awayTeam : null;
                          const pickBadgeUrl = pickTeam ? resolveBadge(pickTeam, badgeMap) : null;

                          return (
                            <div
                              key={p.id}
                              className={["flex items-center justify-between gap-2 rounded-xl border px-3 py-2", badge.cls].join(" ")}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {p.isAnchor && (
                                  <span title="Âncora" className="shrink-0 text-[10px] font-bold text-accent">⊕</span>
                                )}
                                {/* Escudo do time do pick */}
                                {pickBadgeUrl ? (
                                  <img
                                    src={pickBadgeUrl}
                                    alt={pickTeam ?? ""}
                                    width={14}
                                    height={14}
                                    className="shrink-0 object-contain opacity-90"
                                  />
                                ) : null}
                                <span className="truncate text-xs font-medium">{p.match}</span>
                                <span className="shrink-0 text-[10px] text-muted/70">
                                  {p.result === "HOME" ? "1" : p.result === "DRAW" ? "X" : "2"}
                                </span>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <span className="font-mono text-xs tabular-nums">{p.odd.toFixed(2)}</span>
                                <span className="w-4 text-center text-xs font-bold">{badge.icon}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {/* ── Reflexões do BOB ──────────────────────────────────────── */}
      {reflections.length > 0 && (
        <section className="space-y-4">
          <div className="panel rounded-[28px] p-6">
            <p className="kicker text-xs text-muted">Memória viva · IA pós-rodada</p>
            <h2 className="mt-1 text-2xl font-semibold">Reflexões do BOB</h2>
            <p className="mt-1.5 text-sm text-muted">
              O que o motor de IA pensou e aprendeu após cada rodada. Análise gerada automaticamente.
            </p>
          </div>
          <div className="space-y-4">
            {reflections.map((r) => {
              const c = r.content as Record<string, unknown>;
              const text = typeof c?.publicText === "string" ? c.publicText : null;
              const title = typeof c?.title === "string" ? c.title : "Reflexão pós-rodada";
              const weaknesses = Array.isArray(c?.weaknesses) ? (c.weaknesses as string[]) : [];
              const strengths = Array.isArray(c?.strengths) ? (c.strengths as string[]) : [];
              const date = r.createdAt.toLocaleDateString("pt-BR", {
                day: "2-digit", month: "long", year: "numeric",
                timeZone: "America/Sao_Paulo",
              });
              if (!text) return null;
              return (
                <div key={r.id} className="panel rounded-[20px] p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{title}</p>
                      <p className="text-xs text-muted">{date}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-semibold text-accent">
                      BOB · IA
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-foreground/80 whitespace-pre-wrap">{text}</p>
                  {(strengths.length > 0 || weaknesses.length > 0) && (
                    <div className="grid gap-3 sm:grid-cols-2 mt-2">
                      {strengths.length > 0 && (
                        <div className="rounded-xl bg-accent/5 px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-accent mb-1.5">O que funcionou</p>
                          <ul className="space-y-1">
                            {strengths.map((s, i) => (
                              <li key={i} className="text-xs text-foreground/70">✓ {s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {weaknesses.length > 0 && (
                        <div className="rounded-xl bg-signal/5 px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-signal mb-1.5">Pontos de atenção</p>
                          <ul className="space-y-1">
                            {weaknesses.map((w, i) => (
                              <li key={i} className="text-xs text-foreground/70">⚠ {w}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {reflections.length === 0 && (
        <section className="panel rounded-[20px] px-6 py-10 text-center">
          <p className="text-2xl">🧠</p>
          <p className="mt-2 text-sm font-medium text-foreground">Nenhuma reflexão registrada ainda</p>
          <p className="mt-1 text-xs text-muted">
            As reflexões do BOB aparecem aqui após o cron pós-rodada ser executado.
          </p>
        </section>
      )}

      {/* ── Cérebro BOB: Autoevolução ─────────────────────────────── */}
      <section className="space-y-6">
        <div className="panel rounded-[28px] p-6">
          <p className="kicker text-xs text-muted">Transparência algorítmica</p>
          <h2 className="mt-1 text-2xl font-semibold">Cérebro BOB — Autoevolução</h2>
          <p className="mt-1.5 text-sm text-muted">
            O que o motor aprendeu, calibrou e suprimiu ao longo da temporada.
          </p>
        </div>

        {/* Simulações cegas */}
        {simResults.length > 0 && (
          <div className="panel rounded-[20px] p-5 space-y-4">
            <p className="kicker text-xs text-muted">Simulações cegas (backtest)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-wider text-muted">
                    <th className="px-3 py-2">Rodada</th>
                    <th className="px-3 py-2 text-right">Âncoras %</th>
                    <th className="px-3 py-2 text-right">Picks %</th>
                    <th className="px-3 py-2 text-right">Best odd proj.</th>
                    <th className="px-3 py-2 text-right">Calibrado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {simResults.map((s) => {
                    const anchorAcc = s.anchorCount > 0 ? Math.round((s.anchorsCorrect / s.anchorCount) * 100) : null;
                    const pickAcc   = s.totalPicks  > 0 ? Math.round((s.correctPicks  / s.totalPicks)  * 100) : null;
                    return (
                      <tr key={s.id} className="hover:bg-accent/5">
                        <td className="px-3 py-2 font-semibold">R{s.round}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {anchorAcc !== null
                            ? <span className={anchorAcc >= 75 ? "text-accent font-semibold" : anchorAcc >= 50 ? "text-signal" : "text-red-500"}>{anchorAcc}%</span>
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {pickAcc !== null
                            ? <span className={pickAcc >= 70 ? "text-accent font-semibold" : "text-muted"}>{pickAcc}%</span>
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-muted">
                          {s.bestOddProjected ? `${Number(s.bestOddProjected).toFixed(0)}x` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {s.calibrated
                            ? <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">✓</span>
                            : <span className="text-muted/50">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Evolução dos pesos ABQC */}
        {factorWeights.length > 0 && (
          <div className="panel rounded-[20px] p-5 space-y-4">
            <p className="kicker text-xs text-muted">Pesos ABQC — evolução por rodada</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-wider text-muted">
                    <th className="px-2 py-2">R</th>
                    <th className="px-2 py-2 text-right">Tabela</th>
                    <th className="px-2 py-2 text-right">Forma</th>
                    <th className="px-2 py-2 text-right">Casa</th>
                    <th className="px-2 py-2 text-right">Gols</th>
                    <th className="px-2 py-2 text-right">H2H</th>
                    <th className="px-2 py-2 text-right">Ausências</th>
                    <th className="px-2 py-2 text-right">Calendário</th>
                    <th className="px-2 py-2 text-right">Mercado</th>
                    <th className="px-2 py-2 text-right">Acurácia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {factorWeights.map((fw) => (
                    <tr key={fw.id} className="hover:bg-accent/5">
                      <td className="px-2 py-2 font-semibold">R{fw.round}</td>
                      <td className="px-2 py-2 text-right font-mono text-muted">{Number(fw.tableContext).toFixed(1)}</td>
                      <td className="px-2 py-2 text-right font-mono text-muted">{Number(fw.recentForm).toFixed(1)}</td>
                      <td className="px-2 py-2 text-right font-mono text-muted">{Number(fw.homeAway).toFixed(1)}</td>
                      <td className="px-2 py-2 text-right font-mono text-muted">{Number(fw.goalsXg).toFixed(1)}</td>
                      <td className="px-2 py-2 text-right font-mono text-muted">{Number(fw.h2h).toFixed(1)}</td>
                      <td className="px-2 py-2 text-right font-mono text-muted">{Number(fw.absences).toFixed(1)}</td>
                      <td className="px-2 py-2 text-right font-mono text-muted">{Number(fw.calendar).toFixed(1)}</td>
                      <td className="px-2 py-2 text-right font-mono text-muted">{Number(fw.market).toFixed(1)}</td>
                      <td className="px-2 py-2 text-right font-mono">
                        {fw.overallAccuracy
                          ? <span className={Number(fw.overallAccuracy) >= 0.75 ? "text-accent font-semibold" : "text-muted"}>{Math.round(Number(fw.overallAccuracy) * 100)}%</span>
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Anti-padrões descobertos */}
        {antiPatterns.length > 0 && (
          <div className="panel rounded-[20px] p-5 space-y-4">
            <p className="kicker text-xs text-muted">Anti-correlações descobertas (ABQC)</p>
            <div className="space-y-2">
              {antiPatterns.map((p) => {
                const hitRate = p.occurrences > 0 ? Math.round((p.correct / p.occurrences) * 100) : 0;
                return (
                  <div key={p.id} className="flex flex-col gap-1 rounded-xl border border-signal/20 bg-signal/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">{p.condition}</p>
                      <p className="mt-0.5 text-[10px] text-muted">
                        Fatores: {(p.factors as string[]).join(" + ")} · {p.occurrences} ocorrências
                      </p>
                    </div>
                    <span className={[
                      "shrink-0 rounded-full px-3 py-1 text-xs font-semibold tabular-nums",
                      hitRate <= 35 ? "bg-red-500/10 text-red-600" : "bg-signal/10 text-signal",
                    ].join(" ")}>
                      {hitRate}% acerto
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(simResults.length === 0 && factorWeights.length === 0 && antiPatterns.length === 0) && (
          <div className="rounded-[20px] border border-border/60 px-6 py-10 text-center text-muted">
            <p className="text-2xl">🧠</p>
            <p className="mt-2 text-sm font-medium">O cérebro ainda está aprendendo</p>
            <p className="mt-1 text-xs">Os dados de autoevolução (ABQC, simulações, calibração) aparecem aqui após as primeiras rodadas com resultado registrado.</p>
          </div>
        )}
      </section>

    </div>
  );
}
