"use client";

/**
 * BOB — Formulário de resultado pós-rodada (Client Component)
 * Permite marcar o resultado real de cada pick e o retorno financeiro da rodada.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { getRoundWithPicks } from "@/lib/bob/persist";

type Round = NonNullable<Awaited<ReturnType<typeof getRoundWithPicks>>>;
type Pick  = Round["variations"][number]["picks"][number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RESULT_LABELS: Record<string, string> = {
  HOME: "Casa (1)",
  DRAW: "Empate (X)",
  AWAY: "Fora (2)",
};

const RESULT_CYCLING: Record<string, string | undefined> = {
  "": "HOME",
  HOME: "DRAW",
  DRAW: "AWAY",
  AWAY: "HOME",
};

function predictedLabel(result: string): string {
  return RESULT_LABELS[result] ?? result;
}

// ─── Types internos ───────────────────────────────────────────────────────────

type PickState = {
  actualResult: "HOME" | "DRAW" | "AWAY" | "";
  correct: boolean | null;
};

type FormState = {
  picks: Record<string, PickState>;         // key: pickId
  variationPlayed: string;
  stakePerVariation: string;
  totalStaked: string;
  grossReturn: string;
  netReturn: string;
  hit: boolean;
  notes: string;
};

// ─── Componente ───────────────────────────────────────────────────────────────

export function BetslipResultForm({ round }: { round: Round }) {
  const router      = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Estado inicial — pré-preenche results existentes
  const initialPickStates: Record<string, PickState> = {};
  for (const variation of round.variations) {
    for (const pick of variation.picks) {
      initialPickStates[pick.id] = {
        actualResult: (pick.actualResult as "HOME" | "DRAW" | "AWAY") ?? "",
        correct:      pick.correct ?? null,
      };
    }
  }

  const [form, setForm] = useState<FormState>({
    picks:             initialPickStates,
    variationPlayed:   round.result?.variationPlayed ?? "",
    stakePerVariation: round.result?.stakePerVariation?.toString() ?? "10",
    totalStaked:       round.result?.totalStaked?.toString() ?? "",
    grossReturn:       round.result?.grossReturn?.toString() ?? "0",
    netReturn:         round.result?.netReturn?.toString() ?? "",
    hit:               round.result?.hit ?? false,
    notes:             round.result?.notes ?? "",
  });

  const isClosed = round.status === "CLOSED";

  // Clica no resultado de um pick e avança para o próximo estado
  function cycleResult(pickId: string, predicted: string) {
    if (isClosed) return;
    setForm((prev) => {
      const current = prev.picks[pickId]?.actualResult ?? "";
      const next = (RESULT_CYCLING[current] ?? "HOME") as "HOME" | "DRAW" | "AWAY";
      const correct = next === predicted;
      return {
        ...prev,
        picks: {
          ...prev.picks,
          [pickId]: { actualResult: next, correct },
        },
      };
    });
  }

  function updateField(field: keyof FormState, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const picksPayload = Object.entries(form.picks)
      .filter(([, s]) => s.actualResult !== "")
      .map(([pickId, s]) => ({
        pickId,
        actualResult: s.actualResult as "HOME" | "DRAW" | "AWAY",
        correct:      s.correct ?? false,
      }));

    if (picksPayload.length === 0) {
      setError("Marque o resultado de pelo menos um pick antes de salvar.");
      return;
    }

    startTransition(async () => {
      const res = await fetch(`/api/bob/betslip/${round.id}/picks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          picks: picksPayload,
          result: {
            variationPlayed:  form.variationPlayed || undefined,
            stakePerVariation: parseFloat(form.stakePerVariation) || 0,
            totalStaked:       parseFloat(form.totalStaked)       || 0,
            grossReturn:       parseFloat(form.grossReturn)       || 0,
            netReturn:         parseFloat(form.netReturn)         || 0,
            hit:               form.hit,
            notes:             form.notes || undefined,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "Erro ao salvar. Tente novamente.");
        return;
      }

      setSuccess(true);
      router.refresh();
    });
  }

  if (success) {
    return (
      <section className="panel rounded-[28px] p-8">
        <p className="text-base font-semibold text-accent-strong">
          Resultado registrado com sucesso!
        </p>
        <p className="mt-2 text-sm text-muted">
          Os dados já alimentam o histórico de performance e as métricas de ROI.
        </p>
        <button
          className="mt-6 rounded-full bg-accent px-6 py-2 text-sm font-semibold text-white"
          onClick={() => router.push("/admin/betslips")}
        >
          Voltar para a lista
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {round.variations.map((variation, vi) => (
        <section key={variation.id} className="panel rounded-3xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="kicker text-xs text-muted">V{vi + 1} — {variation.posture}</p>
              <h2 className="mt-2 text-xl font-semibold">{variation.title}</h2>
            </div>
            <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">
              Odd {variation.projectedOdd.toFixed(0)}x
            </span>
          </div>

          <div className="mt-5 overflow-hidden rounded-[18px] border border-border">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[rgba(29,92,65,0.06)] text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Jogo</th>
                  <th className="px-4 py-3 font-medium">Previsto</th>
                  <th className="px-4 py-3 font-medium">Odd</th>
                  <th className="px-4 py-3 font-medium text-center">Resultado real</th>
                </tr>
              </thead>
              <tbody>
                {variation.picks.map((pick: Pick) => {
                  const state = form.picks[pick.id] ?? { actualResult: "", correct: null };
                  const hasResult = state.actualResult !== "";
                  return (
                    <tr key={pick.id} className="border-t border-border/70">
                      <td className="px-4 py-3">
                        <span className={pick.isAnchor ? "font-semibold" : ""}>{pick.match}</span>
                        {pick.isAnchor && (
                          <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-strong">âncora</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">{predictedLabel(pick.result)}</td>
                      <td className="px-4 py-3 font-mono">{pick.odd.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          disabled={isClosed}
                          onClick={() => cycleResult(pick.id, pick.result)}
                          className={[
                            "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
                            !hasResult
                              ? "border border-dashed border-border text-muted hover:border-accent"
                              : state.correct
                              ? "bg-accent text-white"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                          ].join(" ")}
                        >
                          {!hasResult
                            ? "Clicar para marcar"
                            : `${RESULT_LABELS[state.actualResult]} ${state.correct ? "✓" : "✗"}`}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {/* Resultado financeiro */}
      <section className="panel rounded-3xl p-6">
        <p className="kicker text-xs text-muted">Resultado financeiro da rodada</p>
        <p className="mt-1 mb-5 text-sm text-muted">
          Registre quanto apostou e o retorno real para cálculo de ROI.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Variação jogada</span>
            <select
              value={form.variationPlayed}
              onChange={(e) => updateField("variationPlayed", e.target.value)}
              disabled={isClosed}
              className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm"
            >
              <option value="">Nenhuma / Várias</option>
              {round.variations.map((_, i) => (
                <option key={i + 1} value={`V${i + 1}`}>V{i + 1}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Stake por variação (R$)</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.stakePerVariation}
              onChange={(e) => updateField("stakePerVariation", e.target.value)}
              disabled={isClosed}
              className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm font-mono"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Total apostado (R$)</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.totalStaked}
              onChange={(e) => updateField("totalStaked", e.target.value)}
              disabled={isClosed}
              className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm font-mono"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Retorno bruto (R$)</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.grossReturn}
              onChange={(e) => updateField("grossReturn", e.target.value)}
              disabled={isClosed}
              className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm font-mono"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Retorno líquido (R$)</span>
            <input
              type="number"
              step={0.01}
              value={form.netReturn}
              onChange={(e) => updateField("netReturn", e.target.value)}
              disabled={isClosed}
              className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm font-mono"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Acertou a variação?</span>
            <div className="flex gap-3 pt-1">
              {[true, false].map((val) => (
                <button
                  key={String(val)}
                  type="button"
                  disabled={isClosed}
                  onClick={() => updateField("hit", val)}
                  className={[
                    "flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors",
                    form.hit === val
                      ? val
                        ? "border-accent bg-accent text-white"
                        : "border-red-500 bg-red-50 text-red-600 dark:bg-red-900/30"
                      : "border-border text-muted hover:border-accent",
                  ].join(" ")}
                >
                  {val ? "Sim" : "Não"}
                </button>
              ))}
            </div>
          </label>
        </div>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Observações</span>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => updateField("notes", e.target.value)}
            disabled={isClosed}
            placeholder="Ex: âncora eliminada por desfalque confirmado..."
            className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm leading-7 resize-none"
          />
        </label>
      </section>

      {error && (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}

      {!isClosed && (
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-accent px-8 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Salvando..." : "Salvar resultado"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/admin/betslips")}
            className="rounded-full border border-border px-8 py-3 text-sm font-medium text-muted"
          >
            Cancelar
          </button>
        </div>
      )}

      {isClosed && (
        <p className="text-sm text-muted">
          Esta rodada está fechada. Os dados são somente leitura.
        </p>
      )}
    </form>
  );
}
