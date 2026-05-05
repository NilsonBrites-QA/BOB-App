"use client";

/**
 * BOB — RoundReflectionCard
 *
 * Componente premium de reflexão pós-rodada para o módulo de fechamento.
 * Mostra taxa de acerto das variações e âncoras, breakdown por pick,
 * e a narrativa honesta gerada pelo BOB via LLM.
 *
 * Integra com DB-first badges via TeamShield.
 * Design: Apple-style, tom visual adaptativo (verde para boas rodadas, vermelho para ruins).
 */

import { TeamShield } from "@/components/team-shield";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type RoundReflectionData = {
  season: number;
  round: number;
  totalPicks: number;
  correctPicks: number;
  hitRate: number;
  totalAnchors: number;
  correctAnchors: number;
  anchorHitRate: number;
  variationsDetail: Array<{
    code: string;
    title: string;
    totalPicks: number;
    correctPicks: number;
    hitRate: number;
    green: boolean;
    combinedOdd: number;
    picks: Array<{
      match: string;
      pick: string;
      actual: string;
      correct: boolean;
      odd: number;
    }>;
  }>;
  anchorsDetail: Array<{
    team: string;
    opponent: string;
    predicted: string;
    actual: string;
    correct: boolean;
    score: number;
  }>;
  bobNarrative: string | null;
  createdAt: string;
};

type Props = {
  data: RoundReflectionData;
  badgeMap?: Record<string, string>;
};

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function HitRateRing({
  rate,
  label,
  size = 80,
}: {
  rate: number;
  label: string;
  size?: number;
}) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (rate / 100) * circumference;
  const color = rate >= 70 ? "#22c55e" : rate >= 50 ? "#eab308" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="rotate-[-90deg]"
          style={{ position: "absolute", inset: 0 }}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={3.5}
            className="text-border"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={3.5}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-lg font-bold">{rate.toFixed(0)}%</span>
        </div>
      </div>
      <span className="text-[9px] uppercase tracking-widest text-muted">{label}</span>
    </div>
  );
}

function VariationRow({
  variation,
}: {
  variation: RoundReflectionData["variationsDetail"][0];
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={[
              "flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold",
              variation.green
                ? "bg-emerald-500/15 text-emerald-600"
                : "bg-red-500/15 text-red-500",
            ].join(" ")}
          >
            {variation.green ? "✓" : "✗"}
          </span>
          <div>
            <span className="text-sm font-semibold">{variation.code}</span>
            <span className="ml-1.5 text-xs text-muted">{variation.title}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted">
            {variation.correctPicks}/{variation.totalPicks}
          </span>
          <span
            className={[
              "rounded-full px-2 py-0.5 text-[10px] font-bold",
              variation.green
                ? "bg-emerald-500/15 text-emerald-600"
                : "bg-red-500/15 text-red-500",
            ].join(" ")}
          >
            {variation.green ? "GREEN" : "RED"}
          </span>
        </div>
      </div>

      {/* Picks expandidos */}
      <div className="ml-9 space-y-1">
        {variation.picks.map((p, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className={p.correct ? "text-emerald-500" : "text-red-400"}>
                {p.correct ? "✓" : "✗"}
              </span>
              <span className="truncate text-muted">{p.match}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-mono text-muted">@{p.odd.toFixed(2)}</span>
              <span className="w-12 text-right text-[10px] text-muted">
                {p.pick}
              </span>
              <span
                className={[
                  "w-14 text-right text-[10px] font-medium",
                  p.correct ? "text-emerald-500" : "text-red-400",
                ].join(" ")}
              >
                {p.actual}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnchorRow({
  anchor,
  badgeUrl,
}: {
  anchor: RoundReflectionData["anchorsDetail"][0];
  badgeUrl?: string | null;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <TeamShield teamName={anchor.team} src={badgeUrl ?? null} size={24} />
        <div className="min-w-0">
          <span className="text-sm font-semibold truncate">{anchor.team}</span>
          <span className="ml-1 text-xs text-muted">× {anchor.opponent}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-mono text-xs text-muted">
          score {anchor.score.toFixed(0)}
        </span>
        <span
          className={[
            "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
            anchor.correct
              ? "bg-emerald-500/15 text-emerald-500"
              : "bg-red-500/15 text-red-500",
          ].join(" ")}
        >
          {anchor.correct ? "✓" : "✗"}
        </span>
      </div>
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export function RoundReflectionCard({ data, badgeMap = {} }: Props) {
  const isGoodRound = data.hitRate >= 65;
  const greenCount = data.variationsDetail.filter((v) => v.green).length;

  return (
    <div className="rounded-[28px] border border-border bg-surface overflow-hidden">
      {/* Header com tom contextual */}
      <div
        className={[
          "px-5 py-5 sm:px-6",
          isGoodRound
            ? "bg-gradient-to-br from-emerald-500/10 to-transparent"
            : "bg-gradient-to-br from-red-500/8 to-transparent",
        ].join(" ")}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted">
              Reflexão · Rodada {data.round}
            </p>
            <h2 className="mt-1 text-xl font-bold">
              {isGoodRound ? "Rodada Sólida" : "Rodada Turbulenta"}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <HitRateRing rate={data.hitRate} label="Geral" />
            <HitRateRing rate={data.anchorHitRate} label="Âncoras" />
          </div>
        </div>

        {/* Narrativa do BOB */}
        {data.bobNarrative && (
          <div className="mt-4 rounded-2xl border border-border bg-surface/80 px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-accent/15 text-accent text-[10px] font-bold">
                B
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted">
                Reflexão do BOB
              </span>
            </div>
            <p className="text-sm leading-6 text-foreground">
              {data.bobNarrative}
            </p>
          </div>
        )}
      </div>

      {/* Stats rápidos */}
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
        <div className="px-4 py-3 text-center">
          <p className="font-mono text-lg font-bold">
            {data.correctPicks}/{data.totalPicks}
          </p>
          <p className="text-[10px] text-muted uppercase tracking-wider">
            Picks Corretos
          </p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="font-mono text-lg font-bold">
            {data.correctAnchors}/{data.totalAnchors}
          </p>
          <p className="text-[10px] text-muted uppercase tracking-wider">
            Âncoras
          </p>
        </div>
        <div className="px-4 py-3 text-center">
          <p
            className={[
              "font-mono text-lg font-bold",
              greenCount > 0 ? "text-emerald-500" : "text-red-500",
            ].join(" ")}
          >
            {greenCount}/{data.variationsDetail.length}
          </p>
          <p className="text-[10px] text-muted uppercase tracking-wider">
            Variações Green
          </p>
        </div>
      </div>

      {/* Âncoras */}
      <div className="px-5 py-4 sm:px-6 border-b border-border">
        <h3 className="text-sm font-semibold mb-2">Âncoras da Rodada</h3>
        <div className="divide-y divide-border/50">
          {data.anchorsDetail.map((anchor, i) => (
            <AnchorRow
              key={i}
              anchor={anchor}
              badgeUrl={badgeMap[anchor.team.toLowerCase()] ?? null}
            />
          ))}
        </div>
      </div>

      {/* Variações */}
      <div className="px-5 py-4 sm:px-6">
        <h3 className="text-sm font-semibold mb-3">Variações</h3>
        <div className="space-y-4">
          {data.variationsDetail.map((variation) => (
            <VariationRow key={variation.code} variation={variation} />
          ))}
        </div>
      </div>
    </div>
  );
}
