"use client";

import { useState } from "react";
import type { Variation } from "@/lib/bob/types";
import { TeamBadge } from "./team-badge";

// ─── Config de risco por variação ─────────────────────────────────────────────

const RISK_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  V1: {
    label: "Conservador",
    dot: "bg-emerald-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  V2: {
    label: "Equilibrado",
    dot: "bg-teal-500",
    badge: "border-teal-200 bg-teal-50 text-teal-700",
  },
  V3: {
    label: "Analítico",
    dot: "bg-sky-500",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
  },
  V4: {
    label: "Calculado",
    dot: "bg-amber-500",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
  },
  V5: {
    label: "Agressivo",
    dot: "bg-red-500",
    badge: "border-red-200 bg-red-50 text-red-700",
  },
};

const RESULT_LABEL: Record<string, string> = {
  "1": "Casa",
  X: "Empate",
  "2": "Fora",
};

const RESULT_STYLE: Record<string, string> = {
  "1": "bg-accent/10 text-accent-strong",
  X: "bg-signal/10 text-signal",
  "2": "bg-muted/10 text-muted",
};

function formatOdd(odd: number): string {
  if (odd >= 10_000) return `${(odd / 1000).toFixed(0)}k×`;
  if (odd >= 1_000) return `${(odd / 1000).toFixed(1)}k×`;
  return `${odd.toFixed(0)}×`;
}

function splitTeams(match: string): [string, string] {
  const parts = match.split(/\s+x\s+/i);
  return [(parts[0] ?? "").trim(), (parts[1] ?? "").trim()];
}

type VariationCardProps = {
  variation: Variation;
  teamBadges?: Record<string, string | null>;
};

export function VariationCard({ variation, teamBadges = {} }: VariationCardProps) {
  const risk = RISK_CONFIG[variation.id] ?? RISK_CONFIG.V1!;
  const [picksOpen, setPicksOpen] = useState(true);

  // Verifica se alguma âncora desta variação é "marginal" (fallback L1/L2)
  const hasMarginalAnchor = variation.picks.some(
    (p) => p.isAnchor && p.isMarginal
  );

  return (
    <article className="panel rounded-3xl p-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="kicker text-xs text-muted">{variation.id}</p>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${risk.badge}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${risk.dot}`} />
              {risk.label}
            </span>
            {hasMarginalAnchor && (
              <span
                title="Esta variação contém âncora marginal — rodada com poucos favoritos claros"
                className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
              >
                ⚠ marginal
              </span>
            )}
          </div>
          <h3 className="mt-1.5 text-xl font-semibold leading-snug">{variation.title}</h3>
        </div>

        {/* Odd em destaque */}
        <div className="shrink-0 rounded-2xl bg-accent-soft px-4 py-2.5 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-accent-strong/60">
            Odd proj.
          </p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums leading-none text-accent-strong">
            {formatOdd(variation.projectedOdd)}
          </p>
        </div>
      </div>

      {/* ── Postura + Sumário ── */}
      <p className="mt-3 text-sm leading-6 text-muted">{variation.posture}</p>
      <p className="mt-1 text-sm leading-6 text-muted">{variation.summary}</p>

      {/* ── Stats row ── */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-border px-2.5 py-1 text-muted">
          {variation.gameCount} jogos
        </span>
        <span
          className={`rounded-full border px-2.5 py-1 ${
            variation.anchorsTogether
              ? "border-accent/25 bg-accent/5 text-accent-strong"
              : "border-border text-muted"
          }`}
        >
          Âncoras {variation.anchorsTogether ? "juntas ✓" : "separadas"}
        </span>
      </div>

      {/* ── Picks (accordion) ── */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-border">
        {/* Linha de toggle */}
        <button
          type="button"
          onClick={() => setPicksOpen((v) => !v)}
          className="flex w-full items-center justify-between bg-[rgba(21,86,61,0.04)] px-4 py-2 text-left"
          aria-expanded={picksOpen}
        >
          <div className="grid flex-1 grid-cols-[1fr_62px_50px] text-[10px] font-semibold uppercase tracking-wider text-muted">
            <span>Jogo</span>
            <span>Resultado</span>
            <span className="text-right">Odd</span>
          </div>
          <span className={`ml-2 text-muted transition-transform duration-200 ${picksOpen ? "rotate-180" : "rotate-0"}`}>
            ▾
          </span>
        </button>

        {/* Linhas colapsáveis */}
        {picksOpen && (
          <div className="divide-y divide-border">
            {variation.picks.map((pick) => {
              const [homeTeam, awayTeam] = splitTeams(pick.match);
              return (
                <div
                  key={`${variation.id}-${pick.match}`}
                  className="grid grid-cols-[1fr_62px_50px] items-center gap-2 px-4 py-2.5"
                >
                  {/* Jogo */}
                  <div className="flex min-w-0 items-center gap-2">
                    {/* Escudos sobrepostos */}
                    <div className="flex shrink-0 -space-x-1.5">
                      <TeamBadge
                        teamName={homeTeam}
                        badgeUrl={teamBadges[homeTeam] ?? null}
                        size={22}
                        className="ring-1 ring-background"
                      />
                      <TeamBadge
                        teamName={awayTeam}
                        badgeUrl={teamBadges[awayTeam] ?? null}
                        size={22}
                        className="ring-1 ring-background"
                      />
                    </div>
                    <span className="truncate text-sm font-medium">{pick.match}</span>
                    {pick.isAnchor && (
                      <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                        âncora
                      </span>
                    )}
                    {pick.isAnchor && pick.isMarginal && (
                      <span
                        title="Âncora marginal — value edge não totalmente confirmado"
                        className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber-700"
                      >
                        !
                      </span>
                    )}
                  </div>

                  {/* Resultado */}
                  <span
                    className={`rounded-full px-2 py-1 text-center text-[11px] font-semibold leading-none ${RESULT_STYLE[pick.result] ?? ""}`}
                  >
                    {RESULT_LABEL[pick.result] ?? pick.result}
                  </span>

                  {/* Odd */}
                  <span className="text-right font-mono text-sm font-semibold tabular-nums">
                    {pick.odd.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
}
