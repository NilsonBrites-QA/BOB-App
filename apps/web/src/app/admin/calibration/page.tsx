/**
 * Admin · Calibração de Pesos
 *
 * Painel administrativo que exibe:
 *  1. Evolução histórica dos pesos do motor por rodada
 *  2. Acurácia geral e de âncoras por rodada
 *  3. Padrões condicionais (anti-correlações) registrados pelo sistema
 *
 * Tipo de tela: Comparação — tabela técnica densa, leitura rápida.
 * Acesso restrito: requer role ADMIN.
 */

import { cookies }             from "next/headers";
import { createClient }        from "@/utils/supabase/server";
import { prisma }              from "@/lib/db";
import { getWeightHistory }    from "@/lib/bob/persist-weights";
import { DEFAULT_WEIGHTS }     from "@/lib/bob/engine/calibrator";
import type { FactorWeights }  from "@/lib/bob/engine/calibrator";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CalibrationPage() {
  // Auth — só admins
  const cookieStore = await cookies();
  const supabase    = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  const currentUser = user?.email
    ? await prisma.user.findUnique({
        where:  { email: user.email.toLowerCase() },
        select: { role: true, active: true },
      })
    : null;

  if (!currentUser?.active || currentUser.role !== "ADMIN") {
    return (
      <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
        <section className="panel rounded-[28px] p-8">
          <p className="kicker text-sm text-muted">Acesso restrito</p>
          <h1 className="mt-2 text-3xl font-semibold">Painel disponível apenas para administradores.</h1>
        </section>
      </div>
    );
  }

  const currentYear = new Date().getFullYear();

  // Dados paralelos
  const [history, patterns] = await Promise.all([
    getWeightHistory(currentYear, 38),
    prisma.conditionalPattern.findMany({
      orderBy: [{ occurrences: "desc" }],
      take: 20,
    }),
  ]);

  const pct = (v: number | null) =>
    v === null ? "—" : `${(v * 100).toFixed(1)}%`;

  const FACTOR_LABELS: Record<keyof FactorWeights, string> = {
    tableContext: "Tabela",
    recentForm:  "Forma",
    momentum:    "Momentum",
    homeAway:    "Casa/Fora",
    goalsXg:     "Gols/xG",
    h2h:         "H2H",
    absences:    "Desfalques",
    calendar:    "Calendário",
    market:      "Mercado",
    motivation:  "Motivação",
  };

  const factors = Object.keys(DEFAULT_WEIGHTS) as (keyof FactorWeights)[];

  // Calcular delta entre primeiro e último snapshot disponível
  const firstRow = history[0];
  const lastRow  = history[history.length - 1];
  const deltas: Partial<Record<keyof FactorWeights, number>> = {};
  if (firstRow && lastRow && history.length > 1) {
    for (const f of factors) {
      deltas[f] = (lastRow.weights[f] ?? 0) - (firstRow.weights[f] ?? 0);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">

      {/* Header */}
      <section className="panel rounded-[28px] p-8">
        <div className="grid gap-8 lg:grid-cols-[1.5fr_0.5fr]">
          <div className="space-y-3">
            <p className="kicker text-sm text-muted">Calibração · {currentYear}</p>
            <h1 className="text-4xl font-semibold leading-tight">
              Evolução dos pesos do motor
            </h1>
            <p className="max-w-2xl text-base leading-8 text-muted">
              Histórico de calibrações ABQC. Cada linha representa uma rodada
              onde o motor ajustou os pesos com base em evidência real de acertos
              e erros. Pesos somam 100 em cada snapshot.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-2">
            <Stat label="Rodadas calibradas" value={history.length.toString()} />
            <Stat
              label="Acurácia média"
              value={
                history.length > 0
                  ? pct(history.reduce((acc, r) => acc + (r.overallAccuracy ?? 0), 0) / history.length)
                  : "—"
              }
            />
            <Stat
              label="Padrões registrados"
              value={patterns.length.toString()}
            />
          </div>
        </div>
      </section>

      {/* Tabela de evolução de pesos */}
      <section className="panel rounded-[28px] p-8">
        <div className="mb-6 flex items-center justify-between">
          <p className="kicker text-xs text-muted">Peso por fator · por rodada</p>
          {history.length > 0 && (
            <span className="font-mono text-[11px] text-muted/60">
              R{firstRow?.round}–R{lastRow?.round} / {currentYear}
            </span>
          )}
        </div>

        {history.length === 0 ? (
          <EmptyState message="Nenhuma calibração registrada para esta temporada." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-3 pr-4 text-[10px] font-medium uppercase tracking-widest text-muted/60">
                    Rodada
                  </th>
                  <th className="pb-3 pr-4 text-[10px] font-medium uppercase tracking-widest text-muted/60">
                    Overall
                  </th>
                  <th className="pb-3 pr-4 text-[10px] font-medium uppercase tracking-widest text-muted/60">
                    Âncora
                  </th>
                  {factors.map((f) => (
                    <th
                      key={f}
                      className="pb-3 pr-4 text-[10px] font-medium uppercase tracking-widest text-muted/60"
                    >
                      {FACTOR_LABELS[f]}
                    </th>
                  ))}
                  <th className="pb-3 text-[10px] font-medium uppercase tracking-widest text-muted/60">
                    Nota
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Linha de delta (se houver histórico) */}
                {history.length > 1 && (
                  <tr className="border-b border-border bg-surface-strong">
                    <td className="py-2.5 pr-4 font-mono text-[11px] text-muted/60">Δ total</td>
                    <td className="py-2.5 pr-4" />
                    <td className="py-2.5 pr-4" />
                    {factors.map((f) => {
                      const d = deltas[f] ?? 0;
                      return (
                        <td key={f} className="py-2.5 pr-4">
                          <span
                            className={`font-mono text-xs font-semibold ${d > 0.5 ? "text-emerald-500" : d < -0.5 ? "text-red-400" : "text-muted/40"}`}
                          >
                            {d > 0 ? "+" : ""}
                            {d.toFixed(1)}
                          </span>
                        </td>
                      );
                    })}
                    <td />
                  </tr>
                )}

                {/* Linhas de dados */}
                {[...history].reverse().map((row) => (
                  <tr
                    key={`${row.season}-${row.round}`}
                    className="border-b border-border/50 transition-colors hover:bg-surface-strong"
                  >
                    <td className="py-2.5 pr-4 font-mono text-xs font-semibold">
                      R{row.round}
                    </td>
                    <td className="py-2.5 pr-4">
                      <AccuracyCell value={row.overallAccuracy} />
                    </td>
                    <td className="py-2.5 pr-4">
                      <AccuracyCell value={row.anchorAccuracy} />
                    </td>
                    {factors.map((f) => (
                      <td key={f} className="py-2.5 pr-4 font-mono text-xs text-muted">
                        {(row.weights[f] ?? 0).toFixed(1)}
                      </td>
                    ))}
                    <td className="py-2.5 max-w-[220px] text-[11px] leading-5 text-muted/60">
                      {row.calibrationNotes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Padrões condicionais */}
      <section className="panel rounded-[28px] p-8">
        <p className="kicker mb-6 text-xs text-muted">Padrões condicionais registrados</p>

        {patterns.length === 0 ? (
          <EmptyState message="Nenhum padrão condicional registrado ainda." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {["Condição", "Fatores", "Ocorrências", "Acertos", "Precisão", "Anti-corr.", "Status"].map((h) => (
                    <th
                      key={h}
                      className="pb-3 pr-4 text-[10px] font-medium uppercase tracking-widest text-muted/60"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {patterns.map((p) => {
                  const precision = p.occurrences > 0 ? p.correct / p.occurrences : null;
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-border/50 transition-colors hover:bg-surface-strong"
                    >
                      <td className="py-2.5 pr-4 text-xs leading-5">{p.condition}</td>
                      <td className="py-2.5 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {p.factors.map((f) => (
                            <span
                              key={f}
                              className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted"
                            >
                              {FACTOR_LABELS[f as keyof FactorWeights] ?? f}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs">{p.occurrences}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs">{p.correct}</td>
                      <td className="py-2.5 pr-4">
                        <AccuracyCell value={precision} />
                      </td>
                      <td className="py-2.5 pr-4 text-center">
                        {p.isAntiCorr ? (
                          <span className="text-amber-500">⚠</span>
                        ) : (
                          <span className="text-muted/30">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        {p.isSuppressed ? (
                          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                            Suprimido
                          </span>
                        ) : (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400">
                            Ativo
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-strong px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted/60">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold">{value}</p>
    </div>
  );
}

function AccuracyCell({ value }: { value: number | null }) {
  if (value === null) return <span className="font-mono text-xs text-muted/40">—</span>;
  const color =
    value >= 0.65 ? "text-emerald-600 dark:text-emerald-400"
    : value >= 0.5  ? "text-amber-600 dark:text-amber-400"
    : "text-red-500 dark:text-red-400";
  return (
    <span className={`font-mono text-xs font-semibold ${color}`}>
      {(value * 100).toFixed(1)}%
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      <p className="text-sm text-muted/60">{message}</p>
      <p className="mt-2 text-xs text-muted/40">
        Os dados aparecerão aqui automaticamente após a primeira rodada calibrada.
      </p>
    </div>
  );
}
