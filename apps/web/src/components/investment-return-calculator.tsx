"use client";

import { useState } from "react";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

type CalculatorState = {
  stakePerVariation: number;
  variationCount: number;
  rounds: number;
  targetOdd: number;
  hitCount: number;
};

const initialState: CalculatorState = {
  stakePerVariation: 3,
  variationCount: 5,
  rounds: 38,
  targetOdd: 1500,
  hitCount: 1,
};

export function InvestmentReturnCalculator() {
  const [state, setState] = useState(initialState);

  const totalPerRound = state.stakePerVariation * state.variationCount;
  const seasonInvestment = totalPerRound * state.rounds;
  const grossReturn = state.stakePerVariation * state.targetOdd * state.hitCount;
  const netReturn = grossReturn - seasonInvestment;
  const breakEvenOdd = seasonInvestment / Math.max(state.stakePerVariation, 1);

  function updateField<K extends keyof CalculatorState>(field: K, value: number) {
    setState((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      <section className="panel rounded-3xl p-6">
        <p className="kicker text-xs text-muted">Simulador</p>
        <div className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm font-medium">
            Valor por variação
            <input
              type="number"
              min="1"
              step="1"
              value={state.stakePerVariation}
              onChange={(event) => updateField("stakePerVariation", Number(event.target.value) || 1)}
              className="rounded-2xl border border-border bg-surface-strong px-4 py-3 outline-none transition focus:border-accent"
            />
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Quantidade de variações
            <input
              type="number"
              min="5"
              step="1"
              value={state.variationCount}
              onChange={(event) => updateField("variationCount", Number(event.target.value) || 5)}
              className="rounded-2xl border border-border bg-surface-strong px-4 py-3 outline-none transition focus:border-accent"
            />
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Rodadas da temporada
            <input
              type="number"
              min="1"
              step="1"
              value={state.rounds}
              onChange={(event) => updateField("rounds", Number(event.target.value) || 38)}
              className="rounded-2xl border border-border bg-surface-strong px-4 py-3 outline-none transition focus:border-accent"
            />
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Odd simulada quando bater
            <input
              type="number"
              min="1"
              step="10"
              value={state.targetOdd}
              onChange={(event) => updateField("targetOdd", Number(event.target.value) || 1)}
              className="rounded-2xl border border-border bg-surface-strong px-4 py-3 outline-none transition focus:border-accent"
            />
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Quantidade de big odds acertadas
            <input
              type="number"
              min="1"
              step="1"
              value={state.hitCount}
              onChange={(event) => updateField("hitCount", Number(event.target.value) || 1)}
              className="rounded-2xl border border-border bg-surface-strong px-4 py-3 outline-none transition focus:border-accent"
            />
          </label>
        </div>
      </section>

      <section className="grid gap-4">
        <div className="panel rounded-3xl p-6">
          <p className="kicker text-xs text-muted">Resumo da temporada</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Metric label="Investimento por rodada" value={formatCurrency(totalPerRound)} />
            <Metric label="Investimento na temporada" value={formatCurrency(seasonInvestment)} />
            <Metric label="Retorno bruto simulado" value={formatCurrency(grossReturn)} />
            <Metric label="Lucro líquido simulado" value={formatCurrency(netReturn)} tone={netReturn >= 0 ? "positive" : "warning"} />
          </div>
        </div>

        <div className="panel rounded-3xl p-6">
          <p className="kicker text-xs text-muted">Leitura do cenário</p>
          <div className="mt-4 space-y-3 text-sm leading-7 text-muted">
            <p>
              Com {state.variationCount} variações de {formatCurrency(state.stakePerVariation)} cada,
              o custo da rodada fica em <strong className="text-foreground">{formatCurrency(totalPerRound)}</strong>.
            </p>
            <p>
              Mantendo isso por {state.rounds} rodadas, o investimento total projetado é
              <strong className="text-foreground"> {formatCurrency(seasonInvestment)}</strong>.
            </p>
            <p>
              Para empatar a temporada com uma única múltipla vencedora nesse valor por variação,
              a odd mínima de equilíbrio seria de aproximadamente
              <strong className="text-foreground"> {breakEvenOdd.toFixed(0)}x</strong>.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "warning";
}) {
  const toneClass =
    tone === "positive"
      ? "text-accent"
      : tone === "warning"
        ? "text-[color:#8a5a00]"
        : "text-foreground";

  return (
    <div className="rounded-[20px] border border-border bg-surface-strong p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}