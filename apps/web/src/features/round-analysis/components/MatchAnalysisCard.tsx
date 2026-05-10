"use client";

import type { MatchAnalysisCardData } from "../types/round-analysis.types";
import { useState } from "react";

interface MatchAnalysisCardProps {
  data: MatchAnalysisCardData;
  onExpand?: () => void;
}

function getTeamInitials(teamName: string): string {
  if (!teamName) return "??";

  const cleaned = teamName.trim().replace(/[-_]+/g, " ");
  const words = cleaned.split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
  }

  return cleaned.slice(0, 2).toUpperCase();
}

function TeamCrest({
  teamName,
  badgeUrl,
}: {
  teamName: string;
  badgeUrl?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const showFallback = !badgeUrl || failed;

  if (showFallback) {
    return (
      <span
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-gradient-to-br from-accent/25 to-accent/5 text-[10px] font-bold uppercase tracking-wide text-accent shadow-sm"
        role="img"
        aria-label={`Escudo do ${teamName}`}
      >
        {getTeamInitials(teamName)}
      </span>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={badgeUrl}
      alt={`Escudo do ${teamName}`}
      width={28}
      height={28}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-7 w-7 shrink-0 rounded-full border border-border/55 bg-background/60 object-contain"
    />
  );
}

export function MatchAnalysisCard({ data, onExpand }: MatchAnalysisCardProps) {
  const [expanded, setExpanded] = useState(false);

  const handleExpand = () => {
    setExpanded(!expanded);
    onExpand?.();
  };

  const confidenceColor = (confidence: number) => {
    if (confidence >= 70) return "from-emerald-500/10 to-emerald-500/5 border-emerald-200/40";
    if (confidence >= 50) return "from-amber-500/10 to-amber-500/5 border-amber-200/40";
    return "from-slate-500/10 to-slate-500/5 border-slate-200/40";
  };

  const confidenceDot = (confidence: number) => {
    if (confidence >= 70) return "bg-emerald-500";
    if (confidence >= 50) return "bg-amber-500";
    return "bg-slate-400";
  };

  return (
    <div
      className={`rounded-[20px] border bg-gradient-to-br p-5 transition cursor-pointer hover:shadow-md ${confidenceColor(
        data.confidence
      )}`}
      onClick={handleExpand}
    >
      {/* Header: Times e Score */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted uppercase tracking-wide">
            {data.homeTeam} × {data.awayTeam}
          </p>
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <TeamCrest teamName={data.homeTeam} badgeUrl={data.homeBadgeUrl} />
              <p className="truncate text-sm font-semibold text-foreground">
                {data.homeTeam}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <TeamCrest teamName={data.awayTeam} badgeUrl={data.awayBadgeUrl} />
              <p className="truncate text-sm font-medium text-foreground/85">
                {data.awayTeam}
              </p>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-background/60 px-2.5 py-1 text-xs font-semibold">
            <span className={`h-1.5 w-1.5 rounded-full ${confidenceDot(data.confidence)}`} />
            {data.confidence}
          </p>
        </div>
      </div>

      {/* Odds Info */}
      <div className="mt-4 flex items-end justify-between border-t border-border/30 pt-3">
        <div className="text-sm">
          <p className="text-xs text-muted">Odd mandante</p>
          <p className="mt-0.5 font-bold text-accent">{data.odds?.home?.toFixed(2) ?? "-"}</p>
        </div>
        <div className="text-sm text-center">
          <p className="text-xs text-muted">Empate</p>
          <p className="mt-0.5 text-sm font-medium text-muted/60">{data.odds?.draw?.toFixed(2) ?? "-"}</p>
        </div>
        <div className="text-sm text-right">
          <p className="text-xs text-muted">Odd visitante</p>
          <p className="mt-0.5 font-bold">{data.odds?.away?.toFixed(2) ?? "-"}</p>
        </div>
      </div>

      {/* Recommendation Badge */}
      {data.recommendation && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent">
          Recomendacao: {data.recommendation}
        </div>
      )}

      {/* Expanded Content */}
      {expanded && (
        <div className="mt-4 space-y-3 border-t border-border/30 pt-4">
          {/* Risk Flags */}
          {data.riskFlags && data.riskFlags.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase">Riscos</p>
              <div className="mt-2 space-y-1">
                {data.riskFlags.map((flag, idx) => (
                  <p key={idx} className="text-xs text-signal/80">
                    Alerta: {flag.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Insights */}
          {data.insightBlocks && data.insightBlocks.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase">Análise</p>
              <div className="mt-2 space-y-1">
                {data.insightBlocks.map((insight, idx) => (
                  <div key={idx} className="text-xs leading-relaxed text-muted">
                    <p className="font-medium">{insight.headline}</p>
                    <p className="mt-0.5 text-muted/80">{insight.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
