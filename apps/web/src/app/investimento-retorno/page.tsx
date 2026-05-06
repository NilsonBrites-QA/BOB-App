import Link from "next/link";
import { InvestmentReturnCalculator } from "@/components/investment-return-calculator";
import { getPerformanceMetrics } from "@/lib/bob/persist";

const SEASON = 2026;

function fmt(v: number, decimals = 2) {
  return v.toFixed(decimals).replace(".", ",");
}

function fmtBrl(v: number) {
  return `R$ ${fmt(v)}`;
}

function fmtPct(v: number) {
  return `${fmt(v * 100, 1)}%`;
}

export default async function InvestmentReturnPage() {
  const metrics = await getPerformanceMetrics(SEASON).catch(() => null);

  const hasData = metrics && metrics.totalRounds > 0;

  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
      <section className="panel rounded-[28px] p-8">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <p className="kicker text-sm text-muted">Investimento x retorno</p>
            <h1 className="text-4xl font-semibold leading-tight">
              Simulador da temporada para acompanhar custo por rodada, esforço anual e retorno de uma big odd.
            </h1>
            <p className="max-w-3xl text-base leading-8 text-muted">
              A calculadora começa pelos exemplos do método: valor por variação,
              cinco múltiplas por rodada e projeção da temporada completa do Brasileirão.
              Ela serve tanto para cenários mínimos quanto para simulações mais agressivas.
            </p>
          </div>

          <div className="rounded-3xl bg-accent px-6 py-6 text-white">
            <p className="kicker text-xs text-white/70">Exemplo BOB</p>
            <div className="mt-4 space-y-3 text-sm leading-7 text-white/90">
              <p>R$ 3,00 por múltipla × 5 variações = R$ 15,00 por rodada.</p>
              <p>R$ 15,00 × 38 rodadas = R$ 570,00 investidos na temporada.</p>
              <p>Quando uma big odd bate, o cálculo precisa mostrar retorno bruto, margem e recuperação da temporada.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Histórico real da temporada ──────────────────────────────── */}
      <section className="panel rounded-3xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="kicker text-xs text-muted">Histórico real — Temporada {SEASON}</p>
            <h2 className="mt-1 text-xl font-semibold">Performance registrada</h2>
          </div>
          {hasData && (
            <span
              className={[
                "rounded-full px-3 py-1 text-xs font-semibold",
                metrics.roi >= 0
                  ? "bg-accent/10 text-accent-strong"
                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
              ].join(" ")}
            >
              ROI {fmtPct(metrics.roi)}
            </span>
          )}
        </div>

        {!hasData ? (
          <p className="mt-6 text-sm text-muted">
            Nenhuma rodada encerrada ainda. Depois que você registrar o resultado no{" "}
            <Link href="/admin/betslips" className="underline decoration-dotted">
              painel admin
            </Link>
            , os dados aparecerão aqui automaticamente.
          </p>
        ) : (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Rodadas encerradas" value={String(metrics.totalRounds)} />
              <Stat
                label="Taxa de acerto"
                value={fmtPct(metrics.hitRate)}
                sub={`${metrics.roundsHit} de ${metrics.totalRounds}`}
              />
              <Stat label="Total investido" value={fmtBrl(metrics.totalStaked)} />
              <Stat
                label="Retorno líquido"
                value={fmtBrl(metrics.netReturn)}
                positive={metrics.netReturn >= 0}
              />
            </div>

            {/* Mini histórico por rodada */}
            {metrics.byRound.length > 0 && (
              <div className="mt-6 overflow-hidden rounded-[18px] border border-border">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-[rgba(29,92,65,0.06)] text-muted">
                    <tr>
                      <th className="px-4 py-3 font-medium">Rodada</th>
                      <th className="px-4 py-3 font-medium text-right">Investido</th>
                      <th className="px-4 py-3 font-medium text-right">Retorno líquido</th>
                      <th className="px-4 py-3 font-medium text-center">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.byRound.map((r) => (
                      <tr key={r.round} className="border-t border-border/70">
                        <td className="px-4 py-3 font-medium">#{r.round}</td>
                        <td className="px-4 py-3 text-right font-mono">{fmtBrl(r.totalStaked)}</td>
                        <td
                          className={[
                            "px-4 py-3 text-right font-mono font-semibold",
                            r.netReturn >= 0 ? "text-accent-strong" : "text-red-600 dark:text-red-400",
                          ].join(" ")}
                        >
                          {r.netReturn >= 0 ? "+" : ""}
                          {fmtBrl(r.netReturn)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={[
                              "rounded-full px-3 py-0.5 text-xs font-semibold",
                              r.hit
                                ? "bg-accent/10 text-accent-strong"
                                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                            ].join(" ")}
                          >
                            {r.hit ? "Acertou" : "Perdeu"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <InvestmentReturnCalculator />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}) {
  const valueClass =
    positive === undefined
      ? "text-2xl font-semibold"
      : positive
      ? "text-2xl font-semibold text-accent-strong"
      : "text-2xl font-semibold text-red-600 dark:text-red-400";

  return (
    <div className="rounded-[20px] border border-border bg-surface-strong p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={valueClass}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}
