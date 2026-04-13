"use client";

import { useState } from "react";
import { kelly } from "@/lib/bob/engine/kelly";

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
  bankroll: number;
  winProbability: number;
};

const initialState: CalculatorState = {
  stakePerVariation: 3,
  variationCount: 5,
  rounds: 38,
  targetOdd: 1500,
  hitCount: 1,
  bankroll: 200,
  winProbability: 10,
};

export function InvestmentReturnCalculator() {
  const [state, setState] = useState(initialState);

  const totalPerRound = state.stakePerVariation * state.variationCount;
  const seasonInvestment = totalPerRound * state.rounds;
  const grossReturn = state.stakePerVariation * state.targetOdd * state.hitCount;
  const netReturn = grossReturn - seasonInvestment;
  const breakEvenOdd = seasonInvestment / Math.max(state.stakePerVariation, 1);

  const kellyResult = kelly(
    Math.max(0.001, Math.min(0.999, state.winProbability / 100)),
    Math.max(1.01, state.targetOdd)
  );
  const kellyStake = state.bankroll * kellyResult.half;
  const quarterStake = state.bankroll * kellyResult.quarter;

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

          <div className="mt-2 border-t border-border pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Critério de Kelly</p>
            <div className="grid gap-4">
              <label className="grid gap-2 text-sm font-medium">
                Banca total (R$)
                <input
                  type="number"
                  min="1"
                  step="10"
                  value={state.bankroll}
                  onChange={(event) => updateField("bankroll", Number(event.target.value) || 100)}
                  className="rounded-2xl border border-border bg-surface-strong px-4 py-3 outline-none transition focus:border-accent"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Probabilidade estimada de acerto (%)
                <input
                  type="number"
                  min="1"
                  max="99"
                  step="1"
                  value={state.winProbability}
                  onChange={(event) =>
                    updateField("winProbability", Math.max(1, Math.min(99, Number(event.target.value) || 10)))
                  }
                  className="rounded-2xl border border-border bg-surface-strong px-4 py-3 outline-none transition focus:border-accent"
                />
              </label>
            </div>
          </div>
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

        <div className="panel rounded-3xl p-6">
          <p className="kicker text-xs text-muted">Critério de Kelly — Gestão de Banca</p>
          {kellyResult.isPositiveEv ? (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Metric
                  label="Half-Kelly (recomendado)"
                  value={formatCurrency(kellyStake)}
                  tone="positive"
                />
                <Metric
                  label="Quarter-Kelly (conservador)"
                  value={formatCurrency(quarterStake)}
                />
                <Metric
                  label="% da banca (Half-Kelly)"
                  value={`${kellyResult.recommendedPct.toFixed(2)}%`}
                />
                <Metric
                  label="Odd mínima de equilíbrio"
                  value={`${kellyResult.breakEvenOdd.toFixed(2)}x`}
                />
              </div>
              <p className="mt-4 text-xs text-muted">
                Com banca de <strong className="text-foreground">{formatCurrency(state.bankroll)}</strong> e
                probabilidade estimada de <strong className="text-foreground">{state.winProbability}%</strong>,
                o Kelly recomenda apostar até{" "}
                <strong className="text-foreground">{formatCurrency(kellyStake)}</strong> por variação (Half-Kelly).
                BOB usa Half-Kelly por padrão — nunca exceda 10% da banca por aposta.
              </p>
            </>
          ) : (
            <div className="mt-4 rounded-2xl border border-signal/30 bg-signal/5 p-4 text-sm text-muted">
              <p>
                <strong className="text-foreground">EV negativo</strong> — com {state.winProbability}% de probabilidade
                e odd de {state.targetOdd}x, o Kelly indica{" "}
                <strong className="text-foreground">não apostar</strong> nessa configuração. A odd mínima
                para EV positivo seria <strong className="text-foreground">{kellyResult.breakEvenOdd.toFixed(2)}x</strong>.
              </p>
            </div>
          )}
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