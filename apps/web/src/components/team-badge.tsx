"use client";

import { useState } from "react";

type TeamBadgeProps = {
  teamName: string;
  badgeUrl?: string | null;
  size?: number;
  className?: string;
};

/**
 * Exibe o escudo do time via TheSportsDB.
 * Fallback: círculo com iniciais do time se a imagem falhar ou não existir.
 */
export function TeamBadge({
  teamName,
  badgeUrl,
  size = 28,
  className = "",
}: TeamBadgeProps) {
  const [failed, setFailed] = useState(false);

  // Iniciais: primeira letra de cada palavra (máx. 2)
  const initials = teamName
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (!badgeUrl || failed) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-accent/10 font-bold text-accent-strong ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: Math.max(8, Math.round(size * 0.36)),
        }}
        aria-label={teamName}
      >
        {initials}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={badgeUrl}
      alt={teamName}
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}
