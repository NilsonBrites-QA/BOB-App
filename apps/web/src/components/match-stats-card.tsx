"use client";

import { useState } from "react";
import { TeamBadge } from "./team-badge";
import { MatchDetailModal } from "./match-detail-modal";
import type { ScoredMatch } from "@/lib/bob/engine/scoring";
import type { FactorBreakdown } from "@/lib/bob/engine/factor-breakdown";

type MatchStatsCardProps = {
  match: ScoredMatch;
  breakdown: FactorBreakdown;
  homeBadgeUrl?: string | null;
  awayBadgeUrl?: string | null;
  isAnchor?: boolean;
};

function resultLabel(r: "1" | "X" | "2", homeTeam: string, awayTeam: string): string {
  if (r === "1") return homeTeam;
  if (r === "2") return awayTeam;
  return "Empate";
}

function confidenceLabel(score: number): { text: string; cls: string } {
  if (score >= 70) return { text: "Alta", cls: "text-accent font-semibold" };
  if (score >= 50) return { text: "Média", cls: "text-signal font-semibold" };
  return { text: "Baixa", cls: "text-muted" };
}

function formDots(form: string[]): React.ReactNode {
  return (
    <span className="flex items-center gap-0.5">
      {form.slice(0, 5).map((r, i) => (
        <span
          key={i}
          className={[
            "inline-block h-1.5 w-1.5 rounded-full",
            r === "W" ? "bg-accent" : r === "D" ? "bg-signal" : "bg-muted/50",
          ].join(" ")}
        />
      ))}
    </span>
  );
}

export function MatchStatsCard({
  match,
  breakdown,
  homeBadgeUrl,
  awayBadgeUrl,
  isAnchor,
}: MatchStatsCardProps) {
  const [open, setOpen] = useState(false);
  const conf = confidenceLabel(match.score);

  const homeP = Math.round(breakdown.homeWinProbNorm * 100);
  const drawP = Math.round(breakdown.drawProbNorm * 100);
  const awayP = Math.round(breakdown.awayWinProbNorm * 100);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group w-full text-left rounded-[20px] border border-border bg-surface-strong p-4 transition hover:border-accent/40 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {/* ── Topo: times + âncora badge ─────────────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          {/* Times */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex items-center gap-1.5">
              <TeamBadge teamName={match.homeTeam} badgeUrl={homeBadgeUrl} size={24} />
              <span className="text-xs font-semibold text-muted">vs</span>
              <TeamBadge teamName={match.awayTeam} badgeUrl={awayBadgeUrl} size={24} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">
                {match.homeTeam}
                <span className="mx-1.5 text-muted font-normal">×</span>
                {match.awayTeam}
              </p>
            </div>
          </div>

          {/* Score + âncora */}
          <div className="flex shrink-0 items-center gap-2">
            {isAnchor && (
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                âncora
              </span>
            )}
            <span className="font-mono text-sm font-bold tabular-nums text-foreground">
              {match.score}
            </span>
          </div>
        </div>

        {/* ── Barra de probabilidades ──────────────────────────────────── */}
        <div className="mt-3 flex h-2 overflow-hidden rounded-full border border-border/40">
          <div className="bg-accent/80" style={{ width: `${homeP}%` }} />
          <div className="bg-muted/30" style={{ width: `${drawP}%` }} />
          <div className="bg-signal/70" style={{ width: `${awayP}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[10px] font-mono text-muted tabular-nums">
          <span>1 {homeP}%</span>
          <span>X {drawP}%</span>
          <span>{awayP}% 2</span>
        </div>

        {/* ── Rodapé: previsão + forma + confiança ─────────────────────── */}
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-muted">Previsão BOB</span>
              <span className="mt-0.5 text-sm font-semibold">
                {resultLabel(match.suggestedResult, match.homeTeam, match.awayTeam)}
              </span>
            </div>
            <div className="h-7 w-px bg-border" />
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted">{match.homeTeam.slice(0, 3).toUpperCase()}</span>
                {formDots(match.homeForm)}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted">{match.awayTeam.slice(0, 3).toUpperCase()}</span>
                {formDots(match.awayForm)}
              </div>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase tracking-wider text-muted block">Confiança</span>
            <span className={`text-sm ${conf.cls}`}>{conf.text}</span>
          </div>
        </div>
      </button>

      {open && (
        <MatchDetailModal
          match={match}
          breakdown={breakdown}
          homeBadgeUrl={homeBadgeUrl}
          awayBadgeUrl={awayBadgeUrl}
          isAnchor={isAnchor}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
