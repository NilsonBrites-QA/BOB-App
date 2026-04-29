"use client";

import { useState } from "react";

export type TeamShieldSize = "sm" | "md" | "lg";

type TeamShieldProps = {
  teamName: string;
  src?: string | null;
  size?: TeamShieldSize | number;
  className?: string;
};

const SIZE_MAP: Record<TeamShieldSize, { px: number; text: string }> = {
  sm: { px: 24, text: "text-[10px]" },
  md: { px: 32, text: "text-sm" },
  lg: { px: 48, text: "text-base" },
};

/**
 * Pega até 2 letras iniciais do nome do time.
 * Ex: "Palmeiras" → "PA", "São Paulo" → "SP", "Atlético-MG" → "AM"
 */
function getInitials(name: string): string {
  if (!name) return "??";
  const cleaned = name.trim().replace(/[-_]+/g, " ");
  const words = cleaned.split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    return ((words[0][0] ?? "") + (words[1][0] ?? "")).toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

/**
 * <TeamShield /> — Componente universal de escudo de time.
 *
 * Renderiza a imagem (src) com fallback premium em caso de erro/ausência:
 * círculo perfeito com glassmorphism + iniciais do time. NUNCA mostra ícone
 * de imagem quebrada do navegador.
 */
export function TeamShield({
  teamName,
  src,
  size = "md",
  className = "",
}: TeamShieldProps) {
  const [failed, setFailed] = useState(false);

  const sizeConfig =
    typeof size === "number"
      ? { px: size, text: size <= 24 ? "text-[10px]" : size <= 32 ? "text-sm" : "text-base" }
      : SIZE_MAP[size];

  const showFallback = !src || failed;

  if (showFallback) {
    return (
      <span
        className={[
          "inline-flex shrink-0 items-center justify-center rounded-full",
          "bg-gradient-to-br from-white/10 to-transparent backdrop-blur-md",
          "border border-white/10 text-white font-semibold shadow-lg",
          sizeConfig.text,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ width: sizeConfig.px, height: sizeConfig.px }}
        aria-label={teamName}
        role="img"
      >
        {getInitials(teamName)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={teamName}
      width={sizeConfig.px}
      height={sizeConfig.px}
      className={["shrink-0 object-contain", className].filter(Boolean).join(" ")}
      style={{ width: sizeConfig.px, height: sizeConfig.px }}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}

// ─── Compat: alias TeamBadge mantém retrocompatibilidade ──────────────────
// Componentes legados (TeamIdentity, MatchDetailModal) importam TeamBadge.
// Mantemos a mesma assinatura antiga, redirecionando para TeamShield.

type LegacyBadgeProps = {
  teamName: string;
  badgeUrl?: string | null;
  size?: number;
  className?: string;
};

export function TeamBadge({
  teamName,
  badgeUrl,
  size = 28,
  className = "",
}: LegacyBadgeProps) {
  return (
    <TeamShield
      teamName={teamName}
      src={badgeUrl}
      size={size}
      className={className}
    />
  );
}
