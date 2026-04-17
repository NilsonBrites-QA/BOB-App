"use client";

import { TeamBadge } from "./team-badge";

type TeamIdentityProps = {
  teamName: string;
  displayName?: string;
  badgeUrl?: string | null;
  badgeSize?: number;
  className?: string;
  badgeClassName?: string;
  nameClassName?: string;
  subtitle?: string | null;
  subtitleClassName?: string;
};

export function TeamIdentity({
  teamName,
  displayName,
  badgeUrl,
  badgeSize = 24,
  className = "",
  badgeClassName = "",
  nameClassName = "",
  subtitle,
  subtitleClassName = "",
}: TeamIdentityProps) {
  const label = displayName?.trim() ? displayName : teamName;

  return (
    <div className={["flex min-w-0 items-center gap-2.5", className].filter(Boolean).join(" ")}>
      <TeamBadge
        teamName={teamName}
        badgeUrl={badgeUrl}
        size={badgeSize}
        className={["shrink-0", badgeClassName].filter(Boolean).join(" ")}
      />
      <div className="min-w-0">
        <p
          className={[
            "truncate text-sm font-semibold leading-tight text-foreground",
            nameClassName,
          ].filter(Boolean).join(" ")}
          title={label}
        >
          {label}
        </p>
        {subtitle ? (
          <p
            className={[
              "mt-0.5 truncate text-[10px] uppercase tracking-[0.18em] text-muted/70",
              subtitleClassName,
            ].filter(Boolean).join(" ")}
            title={subtitle}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}
