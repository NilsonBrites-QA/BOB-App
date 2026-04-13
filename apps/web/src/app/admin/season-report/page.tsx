import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";

const SEASON = 2026;

// ─── dados ────────────────────────────────────────────────────────────────────

type VarStats = {
  timesGenerated: number;
  timesPlayed:    number;
  totalPicks:     number;
  correctPicks:   number;
  totalStaked:    number;
  netReturn:      number;
  hitRounds:      number;
};

function initVarStats(): VarStats {
  return { timesGenerated: 0, timesPlayed: 0, totalPicks: 0, correctPicks: 0, totalStaked: 0, netReturn: 0, hitRounds: 0 };
}

async function getVariationStats(season: number) {
  const rounds = await prisma.round.findMany({
    where: {
      season: { year: season },
      status: "CLOSED",
    },
    include: {
      variations: { include: { picks: true } },
      result: true,
    },
    orderBy: { number: "asc" },
  });

  const stats: Record<string, VarStats> = {
    V1: initVarStats(), V2: initVarStats(), V3: initVarStats(), V4: initVarStats(), V5: initVarStats(),
  };

  for (const round of rounds) {
    for (const variation of round.variations) {
      const s = stats[variation.code];
      if (!s) continue;

      s.timesGenerated++;

      const withResult = variation.picks.filter((p) => p.correct !== null);
      s.totalPicks   += withResult.length;
      s.correctPicks += withResult.filter((p) => p.correct).length;

      if (round.result?.variationPlayed === variation.code) {
        s.timesPlayed++;
        s.totalStaked += Number(round.result.totalStaked);
        s.netReturn   += Number(round.result.netReturn);
        if (round.result.hit) s.hitRounds++;
      }
    }
  }

  return { totalRounds: rounds.length, stats };
}

function pct(n: number, d: number) {
  if (d === 0) return "—";
  return `${((n / d) * 100).toFixed(1)}%`;
}

function roi(net: number, staked: number) {
  if (staked === 0) return "—";
  return `${((net / staked) * 100).toFixed(1)}%`;
}

function brl(v: number) {
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function SeasonReportPage() {
  const cookieStore = await cookies();
  const supabase    = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  const dbUser = user?.email
    ? await prisma.user.findUnique({
        where:  { email: user.email.toLowerCase() },
        select: { role: true, active: true },
      })
    : null;

  if (!dbUser?.active || dbUser.role !== "ADMIN") {
    return (
      <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
        <section className="panel rounded-[28px] p-8">
          <p className="kicker text-sm text-muted">Acesso restrito</p>
          <h1 className="mt-2 text-3xl font-semibold">
            Relatório disponível apenas para administradores.
          </h1>
        </section>
      </div>
    );
  }

  const { totalRounds, stats } = await getVariationStats(SEASON).catch(() => ({
    totalRounds: 0,
    stats: { V1: initVarStats(), V2: initVarStats(), V3: initVarStats(), V4: initVarStats(), V5: initVarStats() } as Record<string, VarStats>,
  }));

  const codes = ["V1", "V2", "V3", "V4", "V5"] as const;
  const hasData = totalRounds > 0;

  // Melhor variação por acurácia de picks
  let bestCode: string | null = null;
  let bestAcc  = -1;
  for (const code of codes) {
    const s = stats[code];
    if (!s || s.totalPicks === 0) continue;
    const acc = s.correctPicks / s.totalPicks;
    if (acc > bestAcc) { bestAcc = acc; bestCode = code; }
  }

  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">

      {/* Header */}
      <section className="panel rounded-[28px] p-8">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            <p className="kicker text-sm text-muted">Relatório de temporada · {SEASON}</p>
            <h1 className="text-4xl font-semibold leading-tight">
              Comparativo V1–V5 por precisão e ROI acumulado na temporada.
            </h1>
            <p className="max-w-lg text-base leading-8 text-muted">
              Rodadas encerradas analisadas: <strong>{totalRounds}</strong>.
              O relatório compara acurácia de picks e resultado financeiro de cada
              variação ao longo da temporada.
            </p>
          </div>

          {bestCode && hasData && (
            <div className="flex flex-col justify-center rounded-3xl bg-accent px-6 py-6 text-white">
              <p className="kicker text-xs text-white/60">Variação com maior acurácia</p>
              <p className="mt-3 font-mono text-6xl font-bold leading-none">{bestCode}</p>
              <p className="mt-2 text-sm text-white/70">
                {pct(stats[bestCode]!.correctPicks, stats[bestCode]!.totalPicks)} de precisão
                em {stats[bestCode]!.totalPicks} picks registrados
              </p>
            </div>
          )}
        </div>
      </section>

      {!hasData && (
        <section className="panel rounded-3xl p-8">
          <p className="kicker text-xs text-muted">Sem dados disponíveis</p>
          <p className="mt-2 text-sm text-muted leading-7">
            Nenhuma rodada com status CLOSED encontrada para a temporada {SEASON}.
            Os dados aparecem conforme as rodadas são encerradas.
          </p>
        </section>
      )}

      {hasData && (
        <>
          {/* Tabela principal */}
          <section className="panel rounded-3xl p-6">
            <p className="kicker text-xs text-muted">Desempenho por variação</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-[rgba(29,92,65,0.06)] text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Variação</th>
                    <th className="px-4 py-3 font-medium text-right">Gerada</th>
                    <th className="px-4 py-3 font-medium text-right">Jogada</th>
                    <th className="px-4 py-3 font-medium text-right">Picks avaliados</th>
                    <th className="px-4 py-3 font-medium text-right">Acurácia</th>
                    <th className="px-4 py-3 font-medium text-right">Banca apost.</th>
                    <th className="px-4 py-3 font-medium text-right">Ret. líquido</th>
                    <th className="px-4 py-3 font-medium text-right">ROI</th>
                    <th className="px-4 py-3 font-medium text-right">Rodadas hit</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((code) => {
                    const s = stats[code];
                    if (!s) return null;
                    const isBest = code === bestCode;
                    return (
                      <tr
                        key={code}
                        className={[
                          "border-t border-border/70 align-middle",
                          isBest ? "bg-[rgba(29,92,65,0.04)]" : "",
                        ].join(" ")}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-base font-semibold">{code}</span>
                            {isBest && (
                              <span className="rounded-full bg-accent px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                                ↑ melhor
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted">{s.timesGenerated}</td>
                        <td className="px-4 py-3 text-right font-mono text-muted">{s.timesPlayed}</td>
                        <td className="px-4 py-3 text-right font-mono">{s.totalPicks}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">
                          {pct(s.correctPicks, s.totalPicks)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted">{brl(s.totalStaked)}</td>
                        <td className={[
                          "px-4 py-3 text-right font-mono font-semibold",
                          s.netReturn >= 0 ? "text-accent" : "text-red-600",
                        ].join(" ")}>
                          {brl(s.netReturn)}
                        </td>
                        <td className={[
                          "px-4 py-3 text-right font-mono",
                          s.totalStaked === 0 ? "text-muted" : s.netReturn >= 0 ? "text-accent" : "text-red-600",
                        ].join(" ")}>
                          {roi(s.netReturn, s.totalStaked)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted">
                          {s.timesPlayed > 0
                            ? `${s.hitRounds}/${s.timesPlayed}`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Barras de precisão visual */}
          <section className="panel rounded-3xl p-6">
            <p className="kicker text-xs text-muted">Acurácia de picks por variação</p>
            <p className="mt-1 mb-4 text-sm text-muted">
              Percentual de picks com resultado correto registrado sobre total de picks avaliados.
            </p>
            <div className="space-y-4">
              {codes.map((code) => {
                const s = stats[code];
                if (!s) return null;
                const acc = s.totalPicks > 0 ? s.correctPicks / s.totalPicks : 0;
                const pctNum = acc * 100;
                const isBest = code === bestCode;
                return (
                  <div key={code} className="flex items-center gap-4">
                    <span className="w-8 font-mono text-sm font-semibold">{code}</span>
                    <div className="relative flex-1 h-3 rounded-full bg-border overflow-hidden">
                      <div
                        className={[
                          "h-full rounded-full transition-all",
                          isBest ? "bg-accent" : "bg-accent-soft border border-accent/30",
                        ].join(" ")}
                        style={{ width: `${pctNum.toFixed(1)}%` }}
                      />
                    </div>
                    <span className="w-16 font-mono text-sm text-right text-muted">
                      {pct(s.correctPicks, s.totalPicks)}
                    </span>
                    <span className="w-24 text-xs text-right text-muted/60">
                      {s.totalPicks > 0 ? `${s.correctPicks}/${s.totalPicks} picks` : "sem dados"}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
