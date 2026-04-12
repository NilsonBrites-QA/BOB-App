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
  return (
    <div className="rounded-[20px] border border-border bg-surface-strong p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <TeamBadge teamName={anchor.homeTeam} badgeUrl={badgeUrl} size={36} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-snug truncate">{anchor.homeTeam}</h2>
            <div className="mt-0.5 flex items-center gap-1.5">
              <TeamBadge teamName={anchor.awayTeam} badgeUrl={awayBadgeUrl} size={16} />
              <p className="text-xs text-muted truncate">vs. {anchor.awayTeam}</p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ExcludeMatchButton matchId={anchor.id} />
          <div
            className={`min-w-[2.5rem] rounded-full px-3 py-1.5 text-center text-sm font-bold tabular-nums ${scoreStyle(anchor.score)}`}
          >
            {anchor.score}
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-border/60">
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
              <span className="mt-[3px] shrink-0 text-accent text-[10px]">▸</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
