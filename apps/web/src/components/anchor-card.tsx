"use client";

import { useState } from "react";
import { TeamBadge } from "./team-badge";
import { ExcludeMatchButton } from "./exclude-match-button";
import type { ScoredMatch } from "@/lib/bob/engine/scoring";
type AnchorCardProps = {
  anchor: ScoredMatch;
  badgeUrl?: string | null;
  awayBadgeUrl?: string | null;
};

function scoreStyle(score: number): string {
  if (score >= 75) return "bg-accent text-white";
  if (score >= 65) return "bg-signal/90 text-white";
  return "bg-muted/20 text-foreground";
}

function barColor(score: number): string {
  if (score >= 75) return "bg-accent";
  if (score >= 65) return "bg-signal";
  return "bg-muted";
}

export function AnchorCard({ anchor, badgeUrl, awayBadgeUrl }: AnchorCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMarginal = anchor.isMarginalAnchor === true;

  return (
    <div className="rounded-[20px] border border-border bg-surface-strong p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <TeamBadge teamName={anchor.homeTeam} badgeUrl={badgeUrl} size={36} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold leading-snug truncate">{anchor.homeTeam}</h2>
              {isMarginal && (
                <span
                  title="Âncora marginal — value edge não totalmente confirmado"
                  className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                >
                  ⚠ marginal
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <TeamBadge teamName={anchor.awayTeam} badgeUrl={awayBadgeUrl} size={16} />
              <p className="text-xs text-muted truncate">vs. {anchor.awayTeam}</p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ExcludeMatchButton matchId={anchor.id} />
          <div
            className={`min-w-10 rounded-full px-3 py-1.5 text-center text-sm font-bold tabular-nums ${scoreStyle(anchor.score)}`}
          >
            {anchor.score}
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div className="mt-3 h-0.75 overflow-hidden rounded-full bg-border/60">
        <div
          className={`h-full rounded-full ${barColor(anchor.score)}`}
          style={{ width: `${anchor.score}%` }}
        />
      </div>

      {/* Reasons */}
      {anchor.reasons.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {anchor.reasons.map((reason) => (
            <li key={reason} className="flex items-start gap-2 text-xs leading-5 text-muted">
              <span className="mt-0.75 shrink-0 text-accent text-[10px]">▸</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Factor drawer toggle */}
      {anchor.factorBreakdown && anchor.factorBreakdown.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] font-medium text-accent hover:underline"
            aria-expanded={drawerOpen}
          >
            <span className={`transition-transform duration-150 ${drawerOpen ? "rotate-90" : "rotate-0"}`}>▶</span>
            {drawerOpen ? "Ocultar" : "Ver"} breakdown dos 15 fatores
          </button>

          {drawerOpen && (
            <div className="mt-2 overflow-auto rounded-xl border border-border">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-[rgba(21,86,61,0.04)] text-left text-[10px] font-semibold uppercase tracking-wider text-muted">
                    <th className="px-3 py-1.5">Fator</th>
                    <th className="px-3 py-1.5 text-right">Peso</th>
                    <th className="px-3 py-1.5 text-right">Valor (0–1)</th>
                    <th className="px-3 py-1.5 text-right">Contribuição</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {anchor.factorBreakdown.map((f) => (
                    <tr key={f.id} className="hover:bg-accent/5">
                      <td className="px-3 py-1.5">
                        <span className="mr-1 font-mono text-muted/60">{f.id}</span>
                        {f.label}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-muted">{f.weight}</td>
                      <td className="px-3 py-1.5 text-right font-mono">
                        <span
                          className={
                            f.value >= 0.7
                              ? "text-accent-strong font-semibold"
                              : f.value <= 0.3
                              ? "text-signal"
                              : "text-muted"
                          }
                        >
                          {f.value.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono font-semibold tabular-nums">
                        {f.contribution.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border bg-accent/5 font-semibold">
                    <td colSpan={3} className="px-3 py-1.5">Total</td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold text-accent-strong">
                      {anchor.score}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
