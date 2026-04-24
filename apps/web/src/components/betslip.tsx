"use client";

import { useState, useCallback } from "react";
import { TeamIdentity } from "./team-identity";

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export type BetSelection = {
  id: string; // matchId + market + option
  matchId: string;
  homeTeam: string;
  homeBadgeUrl?: string | null;
  awayTeam: string;
  awayBadgeUrl?: string | null;
  market: string;
  marketLabel: string;
  option: string;
  optionLabel: string;
  odd: number;
};

type BetSlipProps = {
  selections: BetSelection[];
  onRemove: (id: string) => void;
  onClear: () => void;
};

// ─── Rótulos de mercados ───────────────────────────────────────────────────────

const MARKET_LABELS: Record<string, string> = {
  RESULT_1X2: "1×2",
  BTTS: "Ambas Marcam",
  OVER_UNDER: "Over/Under",
  DOUBLE_CHANCE: "Dupla Chance",
  EXACT_SCORE: "Placar Exato",
};

// ─── Componente ───────────────────────────────────────────────────────────────

export function BetSlip({ selections, onRemove, onClear }: BetSlipProps) {
  const [open, setOpen] = useState(false);
  const [stake, setStake] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"ok" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const totalOdds = selections.reduce((acc, s) => acc * s.odd, 1);
  const stakeNum = parseFloat(stake) || 0;
  const potentialReturn = stakeNum > 0 ? stakeNum * totalOdds : 0;

  const handleSubmit = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setErrorMsg("");

    try {
      const res = await fetch("/api/apostas/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stake: stakeNum,
          selections: selections.map((s) => ({
            matchId: s.matchId,
            market: s.market,
            option: s.option,
            optionLabel: s.optionLabel,
            odd: s.odd,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erro ao registrar bilhete");
      }

      setResult("ok");
      onClear();
      setStake("");
      setTimeout(() => {
        setOpen(false);
        setResult(null);
      }, 1800);
    } catch (err) {
      setResult("error");
      setErrorMsg(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [selections, stakeNum, onClear]);

  const count = selections.length;

  return (
    <>
      {/* ── Toggle button ──────────────────────────────────────────────────── */}
      {count > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:opacity-90 active:scale-95"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M1 3h14M1 8h9M1 13h6" />
          </svg>
          Bilhete
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
            {count}
          </span>
        </button>
      )}

      {/* ── Painel deslizante ──────────────────────────────────────────────── */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />

          {/* Painel */}
          <aside className="fixed bottom-0 left-0 right-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-5 shadow-2xl sm:left-auto sm:right-6 sm:bottom-6 sm:w-80 sm:rounded-3xl">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Bilhete de Apostas</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar bilhete"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted hover:text-foreground"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <line x1="2" y1="2" x2="12" y2="12" />
                  <line x1="12" y1="2" x2="2" y2="12" />
                </svg>
              </button>
            </div>

            {/* Seleções */}
            <ul className="space-y-2 mb-4">
              {selections.map((sel) => (
                <li key={sel.id} className="flex items-start gap-2 rounded-2xl border border-border bg-surface-strong p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <TeamIdentity
                        teamName={sel.homeTeam}
                        badgeUrl={sel.homeBadgeUrl}
                        badgeSize={18}
                        className="min-w-0 flex-1"
                        nameClassName="text-xs"
                      />
                      <span className="shrink-0 text-[10px] uppercase tracking-[0.22em] text-muted">vs</span>
                      <TeamIdentity
                        teamName={sel.awayTeam}
                        badgeUrl={sel.awayBadgeUrl}
                        badgeSize={18}
                        className="min-w-0 flex-1 justify-end"
                        nameClassName="text-right text-xs"
                      />
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {MARKET_LABELS[sel.market] ?? sel.market} · {sel.optionLabel}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-lg bg-accent/10 px-2 py-0.5 font-mono text-xs font-semibold text-accent">
                      {sel.odd.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemove(sel.id)}
                      aria-label="Remover seleção"
                      className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:text-red-500"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                        <line x1="1" y1="1" x2="9" y2="9" />
                        <line x1="9" y1="1" x2="1" y2="9" />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Resumo de odds */}
            <div className="mb-4 rounded-2xl border border-border bg-surface-strong p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted">Odds combinadas</span>
                <span className="font-mono font-semibold text-foreground">{totalOdds.toFixed(2)}×</span>
              </div>
            </div>

            {/* Stake */}
            <div className="mb-3">
              <label htmlFor="bet-stake" className="mb-1 block text-xs text-muted">
                Valor da aposta (R$)
              </label>
              <input
                id="bet-stake"
                type="number"
                min={0}
                step={0.01}
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                placeholder="0,00"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>

            {potentialReturn > 0 && (
              <div className="mb-4 flex items-center justify-between rounded-2xl border border-accent/20 bg-accent/5 px-3 py-2 text-sm">
                <span className="text-muted">Retorno potencial</span>
                <span className="font-semibold text-accent">
                  R$ {potentialReturn.toFixed(2)}
                </span>
              </div>
            )}

            {/* Feedback */}
            {result === "ok" && (
              <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                Bilhete registrado com sucesso!
              </p>
            )}
            {result === "error" && (
              <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                {errorMsg}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClear}
                className="flex-1 rounded-xl border border-border px-3 py-2 text-xs text-muted transition hover:border-accent hover:text-foreground"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || count === 0}
                className="flex-1 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "Salvando..." : "Registrar bilhete"}
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}

// ─── Hook para gerenciar seleções ─────────────────────────────────────────────

export function useBetSlip() {
  const [selections, setSelections] = useState<BetSelection[]>([]);

  const addSelection = useCallback((sel: Omit<BetSelection, "id">) => {
    const id = `${sel.matchId}-${sel.market}-${sel.option}`;
    setSelections((prev) => {
      // Garante apenas uma seleção por partida por mercado
      const filtered = prev.filter(
        (s) => !(s.matchId === sel.matchId && s.market === sel.market)
      );
      return [...filtered, { ...sel, id }];
    });
  }, []);

  const removeSelection = useCallback((id: string) => {
    setSelections((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const clearAll = useCallback(() => setSelections([]), []);

  return { selections, addSelection, removeSelection, clearAll };
}
