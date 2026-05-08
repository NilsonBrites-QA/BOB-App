/**
 * ReflectionCard — Async Server Component
 *
 * "O que o BOB aprendeu nesta rodada."
 *
 * Tela do tipo: Tela de leitura analítica — não um dashboard de KPIs.
 * Foco: reflexão qualitativa + tendência dos fatores.
 * Secondary: métricas precisas de acurácia.
 *
 * Deve ser envolvido em <Suspense fallback={<ReflectionCardSkeleton />}>.
 * Retorna null silenciosamente se não houver dados de backtest.
 */

import { selfReflect } from "@/lib/bob/ai/self-reflection";

// ─── Props ────────────────────────────────────────────────────────────────────

type ReflectionCardProps = {
  season:  number;
  round:   number;
  isAdmin?: boolean;
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function ReflectionCardSkeleton() {
  return (
    <section className="panel rounded-[28px] p-8">
      <div className="flex items-center gap-3">
        <div className="h-3.5 w-32 animate-pulse rounded-full bg-border" />
        <div className="h-5 w-20 animate-pulse rounded-full bg-border" />
      </div>
      <div className="mt-6 space-y-3">
        <div className="h-4 w-5/6 animate-pulse rounded-full bg-border" />
        <div className="h-4 w-full animate-pulse rounded-full bg-border" />
        <div className="h-4 w-4/5 animate-pulse rounded-full bg-border" />
      </div>
      <div className="mt-8 grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-2xl bg-border" />
        ))}
      </div>
    </section>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export async function ReflectionCard({ season, round, isAdmin = false }: ReflectionCardProps) {
  const reflection = await selfReflect(season, round);
  if (!reflection) return null;

  const label: Record<string, string> = {
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

  // Apenas tendências com movimento real (não stable)
  const activeTrends = reflection.trends.filter((t) => t.direction !== "stable").slice(0, 4);
  // Sugestões apenas se há ajuste explícito (não hold)
  const actionable = reflection.suggestions.filter((s) => s.direction !== "hold").slice(0, 3);

  return (
    <section className="panel rounded-[28px] p-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="kicker text-xs text-muted">Aprendizado do BOB</p>
          <p className="mt-1 text-[11px] text-muted/60">
            Rodada {round}/{season}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {reflection.source === "claude" && (
            <span className="rounded-full border border-border px-2.5 py-1 font-mono text-[10px] text-muted">
              claude sonnet
            </span>
          )}
          <AccuracyBadge overall={reflection.accuracy} anchor={reflection.anchorAcc} />
        </div>
      </div>

      {/* Texto público — foco principal */}
      <p className="mt-6 text-base leading-8 text-muted">
        {reflection.publicText}
      </p>

      {/* Tendências de fatores — tira horizontal discreta */}
      {activeTrends.length > 0 && (
        <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {activeTrends.map((t) => (
            <div
              key={t.factor}
              className="rounded-2xl border border-border bg-surface-strong px-4 py-3"
            >
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted/70">
                {label[t.factor] ?? t.factor}
              </p>
              <div className="mt-1 flex items-center gap-1.5">
                <TrendArrow direction={t.direction} />
                <span className="font-mono text-sm font-semibold">
                  {t.delta > 0 ? "+" : ""}
                  {t.delta.toFixed(1)}pt
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bloco admin — detail técnico */}
      {isAdmin && (
        <div className="mt-8 space-y-5">
          <hr className="border-border" />

          {/* Texto técnico */}
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted/60">
              Análise técnica
            </p>
            <p className="mt-2 font-mono text-xs leading-6 text-muted">
              {reflection.adminText}
            </p>
          </div>

          {/* Sugestões de ajuste de pesos */}
          {actionable.length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted/60">
                Sugestões de calibração
              </p>
              <div className="mt-3 space-y-2">
                {actionable.map((s) => (
                  <div
                    key={s.factor}
                    className="rounded-xl border border-border px-4 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">
                        {label[s.factor] ?? s.factor}
                      </span>
                      <DirectionChip direction={s.direction} magnitude={s.magnitude} />
                    </div>
                    <p className="mt-1 font-mono text-[11px] leading-5 text-muted/70">
                      {s.reasoning}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AccuracyBadge({ overall, anchor }: { overall: number; anchor: number }) {
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const color =
    overall >= 0.65 ? "text-emerald-600 dark:text-emerald-400"
    : overall >= 0.5  ? "text-amber-600 dark:text-amber-400"
    : "text-red-500 dark:text-red-400";

  return (
    <div className={`rounded-full border border-border px-3 py-1 font-mono text-xs ${color}`}>
      {pct(overall)} · âncora {pct(anchor)}
    </div>
  );
}

function TrendArrow({ direction }: { direction: "rising" | "falling" | "stable" }) {
  if (direction === "rising")  return <span className="text-emerald-500">↑</span>;
  if (direction === "falling") return <span className="text-red-400">↓</span>;
  return <span className="text-muted/40">—</span>;
}

function DirectionChip({
  direction,
  magnitude,
}: {
  direction:  "increase" | "decrease" | "hold";
  magnitude:  "small" | "medium" | "large";
}) {
  const label = direction === "increase" ? "↑ Aumentar" : direction === "decrease" ? "↓ Reduzir" : "— Manter";
  const size  = magnitude === "large" ? "forte" : magnitude === "medium" ? "moderado" : "leve";
  const color =
    direction === "increase" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
    : direction === "decrease" ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400"
    : "border-border bg-surface text-muted";

  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${color}`}>
      {label} · {size}
    </span>
  );
}
