"use client";

/**
 * BOB — Alavancagem Client
 *
 * UI premium para o módulo de 15 passos.
 * Progress tracker, bilhete do dia, histórico do ciclo.
 */

import { useState } from "react";
import { TeamShield } from "@/components/team-shield";
import type { LeverageState, LeverageTicket, LeveragePick } from "@/lib/bob/engine/leverage";

// ─── Types ────────────────────────────────────────────────────────────────────

type StakeRow = { step: number; stake: number; projectedPayout: number };

type Props = {
  state: LeverageState;
  ticket: LeverageTicket | null;
  stakeTable: StakeRow[];
  roundLabel: string;
  isDemo: boolean;
  userId: string;
  hasPending: boolean;
};

// ─── Progress Tracker ─────────────────────────────────────────────────────────

function StepDot({
  step,
  current,
  completed,
}: {
  step: number;
  current: number;
  completed: boolean;
}) {
  const isCurrent = step === current;
  const isPast = step < current;
  const isFuture = step > current;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={[
          "flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-all",
          isCurrent
            ? "bg-accent text-white ring-4 ring-accent/25 shadow-lg shadow-accent/20 scale-110"
            : isPast
              ? "bg-accent/80 text-white"
              : isFuture
                ? "border-2 border-border bg-surface text-muted"
                : "",
          completed ? "bg-emerald-500 text-white" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {isPast || completed ? "✓" : step}
      </div>
      <span
        className={[
          "text-[9px] font-medium uppercase tracking-wider",
          isCurrent ? "text-accent font-bold" : "text-muted",
        ].join(" ")}
      >
        {isCurrent ? "Agora" : isPast ? "Green" : `P${step}`}
      </span>
    </div>
  );
}

function ProgressTracker({
  currentStep,
  totalSteps,
}: {
  currentStep: number;
  totalSteps: number;
}) {
  const progress = ((currentStep - 1) / (totalSteps - 1)) * 100;

  return (
    <div className="space-y-4">
      {/* Barra de progresso visual */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-border/40">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent to-emerald-500 transition-all duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Dots */}
      <div className="flex justify-between overflow-x-auto pb-2">
        {Array.from({ length: totalSteps }, (_, i) => (
          <StepDot
            key={i + 1}
            step={i + 1}
            current={currentStep}
            completed={false}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Bilhete do Dia ───────────────────────────────────────────────────────────

function PickCard({ pick }: { pick: LeveragePick }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface-strong px-4 py-3">
      <div className="flex flex-1 items-center gap-2.5 min-w-0">
        <TeamShield teamName={pick.homeTeam} src={pick.homeBadge} size={28} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold truncate">{pick.homeTeam}</span>
            <span className="text-[10px] text-muted">×</span>
            <span className="text-sm font-semibold truncate">{pick.awayTeam}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted truncate">{pick.reason}</p>
        </div>
        <TeamShield teamName={pick.awayTeam} src={pick.awayBadge} size={28} />
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="rounded-lg bg-accent/10 px-2.5 py-1 font-mono text-sm font-bold text-accent-strong">
          {pick.pickOdd.toFixed(2)}
        </span>
        <span className="text-[10px] font-medium text-accent">{pick.pickLabel}</span>
      </div>
    </div>
  );
}

function TicketSection({ ticket }: { ticket: LeverageTicket }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted">Entrada do Dia</p>
          <p className="mt-1 text-lg font-bold">
            Passo {ticket.step} de 15
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-muted">Meta de Odd</p>
          <p className="mt-1 font-mono text-lg font-bold text-accent">
            {ticket.combinedOdd.toFixed(2)}×
          </p>
        </div>
      </div>

      {/* Picks */}
      <div className="space-y-2">
        {ticket.picks.map((pick) => (
          <PickCard key={pick.matchId} pick={pick} />
        ))}
      </div>

      {/* Stake info */}
      <div className="flex items-center justify-between rounded-2xl border border-accent/20 bg-accent/5 px-4 py-3">
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider">Valor da entrada</p>
          <p className="mt-0.5 font-mono text-xl font-bold">
            R$ {ticket.stake.toFixed(2)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted uppercase tracking-wider">Retorno projetado</p>
          <p className="mt-0.5 font-mono text-xl font-bold text-accent-strong">
            R$ {ticket.projectedPayout.toFixed(2)}
          </p>
        </div>
      </div>

      {/* BOB message */}
      <div className="rounded-2xl border border-accent/15 bg-gradient-to-br from-accent/5 to-transparent px-4 py-3">
        <p className="text-sm leading-6 text-foreground">
          {ticket.bobMessage}
        </p>
      </div>
    </div>
  );
}

// ─── Stats Cards ──────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sublabel,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sublabel?: string;
  tone?: "accent" | "signal" | "danger" | "neutral";
}) {
  const toneClass = {
    accent: "text-accent-strong",
    signal: "text-signal",
    danger: "text-red-500",
    neutral: "text-foreground",
  }[tone];

  return (
    <div className="rounded-2xl border border-border bg-surface-strong px-4 py-3">
      <p className="text-[10px] uppercase tracking-widest text-muted">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold ${toneClass}`}>{value}</p>
      {sublabel && <p className="mt-0.5 text-[11px] text-muted">{sublabel}</p>}
    </div>
  );
}

// ─── Tabela de Stakes ─────────────────────────────────────────────────────────

function StakeTableSection({
  table,
  currentStep,
}: {
  table: StakeRow[];
  currentStep: number;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div className="bob-section-header">
        <h3 className="text-sm font-semibold">Trilha dos 15 Passos</h3>
        <span className="text-[10px] text-muted uppercase tracking-wider">
          Composição geométrica · odd média 1.90×
        </span>
      </div>
      <div className="divide-y divide-border">
        {table.map((row) => {
          const isCurrent = row.step === currentStep;
          const isPast = row.step < currentStep;

          return (
            <div
              key={row.step}
              className={[
                "flex items-center justify-between px-4 py-2.5 text-sm transition-colors",
                isCurrent ? "bg-accent/10 font-semibold" : "",
                isPast ? "text-muted" : "",
              ].join(" ")}
            >
              <div className="flex items-center gap-3">
                <span
                  className={[
                    "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold",
                    isCurrent
                      ? "bg-accent text-white"
                      : isPast
                        ? "bg-accent/20 text-accent"
                        : "bg-border/40 text-muted",
                  ].join(" ")}
                >
                  {isPast ? "✓" : row.step}
                </span>
                <span>Passo {row.step}</span>
              </div>
              <div className="flex items-center gap-6 font-mono text-xs">
                <span className="w-24 text-right">
                  R$ {row.stake.toFixed(2)}
                </span>
                <span className="w-28 text-right text-accent-strong">
                  → R$ {row.projectedPayout.toFixed(2)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export function AlavancagemClient({
  state,
  ticket,
  stakeTable,
  roundLabel,
  isDemo,
  hasPending,
}: Props) {
  const { currentStep, allTimeStats } = state;
  const [acceptState, setAcceptState] = useState<"idle" | "loading" | "done" | "error">(hasPending ? "done" : "idle");
  const [acceptError, setAcceptError] = useState<string | null>(null);

  async function handleAcceptTicket() {
    if (!ticket || acceptState === "loading" || acceptState === "done") return;
    setAcceptState("loading");
    setAcceptError(null);

    try {
      const res = await fetch("/api/bob/leverage/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          picks: ticket.picks.map((p) => ({
            matchId: p.matchId,
            homeTeam: p.homeTeam,
            awayTeam: p.awayTeam,
            pickOutcome: p.pickOutcome,
            pickLabel: p.pickLabel,
            pickOdd: p.pickOdd,
          })),
          step: ticket.step,
          cycleId: state.currentCycleId,
          stake: ticket.stake,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setAcceptState("done");
    } catch (err) {
      setAcceptState("error");
      setAcceptError(err instanceof Error ? err.message : "Erro ao registrar bilhete");
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-10 sm:px-6 lg:px-10">
      {/* Hero */}
      <section className="bob-hero">
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">
              {roundLabel}
            </span>
            {isDemo && (
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold text-white">
                DEMO
              </span>
            )}
          </div>
          <h1 className="mt-2 text-3xl font-bold text-white">
            Alavancagem do BOB
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/80">
            15 passos. R$ 10 viram R$ 37.000+. Cada green reinveste o lucro no
            próximo passo. Um red reseta — mas o histórico fica. Disciplina é
            tudo.
          </p>
        </div>
      </section>

      {/* Stats rápidos */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Passo Atual"
          value={`${currentStep}/15`}
          sublabel={`Stake: R$ ${state.currentStake.toFixed(2)}`}
          tone="accent"
        />
        <StatCard
          label="Greens Totais"
          value={String(allTimeStats.totalGreens)}
          sublabel={`Maior sequência: ${allTimeStats.longestStreak}`}
          tone="accent"
        />
        <StatCard
          label="Reds Totais"
          value={String(allTimeStats.totalReds)}
          sublabel={`${allTimeStats.totalCycles} ciclo(s)`}
        />
        <StatCard
          label="Lucro Acumulado"
          value={`R$ ${allTimeStats.totalProfit.toFixed(0)}`}
          sublabel={`${allTimeStats.completedCycles} ciclo(s) completo(s)`}
          tone={allTimeStats.totalProfit >= 0 ? "accent" : "danger"}
        />
      </section>

      {/* Progress Tracker */}
      <section className="rounded-[28px] border border-border bg-surface p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted">Progresso do Ciclo</p>
            <h2 className="mt-1 text-xl font-bold">Passo {currentStep} de 15</h2>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-muted">Próximo alvo</p>
            <p className="mt-1 font-mono text-lg font-bold text-accent">
              R$ {state.projectedPayout.toFixed(2)}
            </p>
          </div>
        </div>
        <ProgressTracker currentStep={currentStep} totalSteps={15} />
      </section>

      {/* Bilhete do Dia */}
      <section className="rounded-[28px] border border-border bg-surface p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white text-lg">
            🎯
          </div>
          <div>
            <h2 className="text-lg font-bold">Bilhete do Dia</h2>
            <p className="text-xs text-muted">
              {ticket
                ? `${ticket.picks.length === 1 ? "Aposta simples" : "Múltipla curta"} · odd alvo 1.80–2.00`
                : "Nenhum jogo viável hoje na faixa de odd 1.80–2.00"}
            </p>
          </div>
        </div>

        {ticket ? (
          <>
            <TicketSection ticket={ticket} />

            {/* Botão de aceitar entrada */}
            <div className="mt-4">
              {acceptState === "done" ? (
                <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-5 py-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white text-xs">✓</span>
                  <div>
                    <p className="text-sm font-semibold text-emerald-600">Entrada registrada</p>
                    <p className="text-xs text-muted">O BOB resolverá automaticamente após o jogo terminar.</p>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void handleAcceptTicket()}
                    disabled={acceptState === "loading"}
                    className={[
                      "w-full rounded-2xl py-3.5 text-sm font-semibold transition-all",
                      acceptState === "loading"
                        ? "bg-accent/50 text-white cursor-wait"
                        : "bg-accent text-white hover:bg-accent/90 active:scale-[0.98] shadow-lg shadow-accent/25",
                    ].join(" ")}
                  >
                    {acceptState === "loading" ? "Registrando..." : "Aceitar entrada do dia"}
                  </button>
                  {acceptState === "error" && acceptError && (
                    <p className="mt-2 text-xs text-red-500 text-center">{acceptError}</p>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-signal/25 bg-signal/8 px-5 py-4">
            <p className="text-sm font-semibold text-signal">Sem entrada hoje</p>
            <p className="mt-1 text-sm text-muted leading-6">
              O motor não encontrou jogos com odd entre 1.80 e 2.00 e confiança
              suficiente. Isso é normal — nem toda rodada tem encaixe. A
              disciplina de pular rodada fraca faz parte do método.
            </p>
          </div>
        )}
      </section>

      {/* Trilha de Stakes */}
      <section>
        <StakeTableSection table={stakeTable} currentStep={currentStep} />
      </section>

      {/* Como funciona */}
      <section className="rounded-[28px] border border-border bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-bold mb-4">Como funciona a Alavancagem</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface-strong p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent text-lg mb-3">
              🌱
            </div>
            <h3 className="text-sm font-semibold">Plante</h3>
            <p className="mt-1 text-xs text-muted leading-5">
              Passo 1: você entra com R$ 10. O BOB encontra um jogo com odd
              entre 1.80 e 2.00. Uma aposta simples ou múltipla curta.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-strong p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500 text-lg mb-3">
              📈
            </div>
            <h3 className="text-sm font-semibold">Cresça</h3>
            <p className="mt-1 text-xs text-muted leading-5">
              Green? O lucro inteiro vai pro próximo passo. R$ 10 vira R$ 19,
              depois R$ 36, depois R$ 68... Composição geométrica.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-strong p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/15 text-red-500 text-lg mb-3">
              🔄
            </div>
            <h3 className="text-sm font-semibold">Resete</h3>
            <p className="mt-1 text-xs text-muted leading-5">
              Red? Volta pro passo 1 com R$ 10. O histórico fica salvo.
              Sem drama — o método sobrevive a resets. Consistência vence.
            </p>
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <p className="text-center text-[10px] text-muted/50">
        BOB não garante resultados. Apostas envolvem risco de capital — jogue
        com responsabilidade. Lei 14.790/2023.
      </p>
    </div>
  );
}
