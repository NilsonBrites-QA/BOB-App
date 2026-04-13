"use client";

import { useState } from "react";
import Image from "next/image";
import { BetSlip, useBetSlip } from "@/components/betslip";
import type { BetSelection } from "@/components/betslip";

// ─── Tipos ─────────────────────────────────────────────────────────────────────

type OddEntry = {
  market: string;
  option: string;
  optionLabel: string;
  odd: number;
};

type Match = {
  id: string;
  homeTeam: string;
  homeTeamShort: string;
  homeCrest: string | null;
  awayTeam: string;
  awayTeamShort: string;
  awayCrest: string | null;
  competition: string;
  round: number;
  scheduledAt: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  odds: OddEntry[];
};

type ApostasClientProps = {
  serieA: Match[];
  serieB: Match[];
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

// ─── Card de uma partida ────────────────────────────────────────────────────────

function MatchCard({
  match,
  selectedOddId,
  onAdd,
}: {
  match: Match;
  selectedOddId: string | null;
  onAdd: (sel: Omit<BetSelection, "id">) => void;
}) {
  // odds 1x2: home, draw, away
  const odds1x2 = match.odds.filter((o) => o.market === "RESULT_1X2");
  const homeOdd = odds1x2.find((o) => o.option === "HOME");
  const drawOdd = odds1x2.find((o) => o.option === "DRAW");
  const awayOdd = odds1x2.find((o) => o.option === "AWAY");

  const isFinished = match.status === "FINISHED";
  const isLive = match.status === "LIVE";

  return (
    <div className="panel rounded-2xl p-4">
      {/* Header: rodada + horário */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">
          Rodada {match.round}
        </span>
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-500">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
              Ao Vivo
            </span>
          )}
          <span className="text-xs text-muted">{formatDate(match.scheduledAt)}</span>
        </div>
      </div>

      {/* Times */}
      <div className="mb-4 flex items-center justify-between gap-3">
        {/* Casa */}
        <div className="flex flex-1 flex-col items-center gap-1.5">
          {match.homeCrest ? (
            <Image
              src={match.homeCrest}
              alt={match.homeTeamShort}
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
              unoptimized
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-strong text-xs font-bold text-muted">
              {match.homeTeamShort.slice(0, 3).toUpperCase()}
            </div>
          )}
          <span className="max-w-20 text-center text-xs font-semibold leading-tight">
            {match.homeTeamShort}
          </span>
        </div>

        {/* Placar ou VS */}
        <div className="flex flex-col items-center">
          {isFinished || isLive ? (
            <span className="font-mono text-2xl font-bold tracking-tight">
              {match.homeScore ?? 0} – {match.awayScore ?? 0}
            </span>
          ) : (
            <span className="text-lg font-bold text-muted">×</span>
          )}
        </div>

        {/* Fora */}
        <div className="flex flex-1 flex-col items-center gap-1.5">
          {match.awayCrest ? (
            <Image
              src={match.awayCrest}
              alt={match.awayTeamShort}
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
              unoptimized
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-strong text-xs font-bold text-muted">
              {match.awayTeamShort.slice(0, 3).toUpperCase()}
            </div>
          )}
          <span className="max-w-20 text-center text-xs font-semibold leading-tight">
            {match.awayTeamShort}
          </span>
        </div>
      </div>

      {/* Odds 1×2 */}
      {!isFinished && (homeOdd || drawOdd || awayOdd) && (
        <div className="grid grid-cols-3 gap-1.5">
          {[
            homeOdd && { ...homeOdd, label: "Casa" },
            drawOdd && { ...drawOdd, label: "Empate" },
            awayOdd && { ...awayOdd, label: "Fora" },
          ]
            .filter(Boolean)
            .map((entry) => {
              if (!entry) return null;
              const selId = `${match.id}-${entry.market}-${entry.option}`;
              const isActive = selectedOddId === selId;

              return (
                <button
                  key={entry.option}
                  type="button"
                  onClick={() =>
                    onAdd({
                      matchId: match.id,
                      homeTeam: match.homeTeam,
                      awayTeam: match.awayTeam,
                      market: entry.market,
                      marketLabel: "1×2",
                      option: entry.option,
                      optionLabel: entry.label,
                      odd: entry.odd,
                    })
                  }
                  className={`flex flex-col items-center rounded-xl border px-2 py-2 text-xs transition active:scale-95 ${
                    isActive
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-surface-strong text-muted hover:border-accent hover:text-foreground"
                  }`}
                >
                  <span className="text-[10px]">{entry.label}</span>
                  <span className="mt-0.5 font-mono font-semibold">{entry.odd.toFixed(2)}</span>
                </button>
              );
            })}
        </div>
      )}

      {isFinished && (
        <div className="flex items-center justify-center rounded-xl border border-border px-3 py-1.5">
          <span className="text-[11px] text-muted">Partida encerrada</span>
        </div>
      )}

      {!isFinished && !homeOdd && !drawOdd && !awayOdd && (
        <div className="flex items-center justify-center rounded-xl border border-border/50 px-3 py-1.5">
          <span className="text-[11px] text-muted">Odds não disponíveis</span>
        </div>
      )}
    </div>
  );
}

// ─── Lista de partidas agrupada por rodada ─────────────────────────────────────

function MatchList({
  matches,
  selections,
  onAdd,
}: {
  matches: Match[];
  selections: BetSelection[];
  onAdd: (sel: Omit<BetSelection, "id">) => void;
}) {
  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center text-muted">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="20" cy="20" r="18" />
          <path d="M14 14l12 12M26 14L14 26" />
        </svg>
        <p className="text-sm">Nenhuma partida disponível.</p>
        <p className="text-xs">
          Execute a importação manual em{" "}
          <code className="rounded bg-surface-strong px-1">/api/cron/import-matches</code>{" "}
          para carregar as partidas.
        </p>
      </div>
    );
  }

  // Agrupa por rodada
  const byRound = matches.reduce<Record<number, Match[]>>((acc, m) => {
    const r = m.round;
    if (!acc[r]) acc[r] = [];
    acc[r].push(m);
    return acc;
  }, {});

  const rounds = Object.keys(byRound)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="space-y-8">
      {rounds.map((round) => (
        <section key={round}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
            Rodada {round}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {byRound[round].map((match) => {
              const activeSel = selections.find((s) => s.matchId === match.id);
              const activeOddId = activeSel
                ? `${activeSel.matchId}-${activeSel.market}-${activeSel.option}`
                : null;

              return (
                <MatchCard
                  key={match.id}
                  match={match}
                  selectedOddId={activeOddId}
                  onAdd={onAdd}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ─── Componente principal da página ────────────────────────────────────────────

type Tab = "serie-a" | "serie-b" | "ao-vivo" | "historico";

const TABS: { id: Tab; label: string }[] = [
  { id: "serie-a", label: "Série A" },
  { id: "serie-b", label: "Série B" },
  { id: "ao-vivo", label: "Ao Vivo" },
  { id: "historico", label: "Histórico BOB" },
];

export function ApostasClient({ serieA, serieB }: ApostasClientProps) {
  const [tab, setTab] = useState<Tab>("serie-a");
  const { selections, addSelection, removeSelection, clearAll } = useBetSlip();

  const liveMatches = [...serieA, ...serieB].filter((m) => m.status === "LIVE");
  const historyMatches = [...serieA, ...serieB].filter(
    (m) => m.status === "FINISHED"
  );

  const currentMatches =
    tab === "serie-a"
      ? serieA.filter((m) => m.status !== "FINISHED")
      : tab === "serie-b"
      ? serieB.filter((m) => m.status !== "FINISHED")
      : tab === "ao-vivo"
      ? liveMatches
      : historyMatches;

  return (
    <>
      {/* Tabs */}
      <div className="mb-6 flex items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-surface-strong p-1">
        {TABS.map((t) => {
          const count =
            t.id === "ao-vivo" ? liveMatches.length : undefined;

          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                tab === t.id
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {t.label}
              {count !== undefined && count > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500/90 px-1 text-[10px] font-bold text-white">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Lista */}
      <MatchList
        matches={currentMatches}
        selections={selections}
        onAdd={addSelection}
      />

      {/* BetSlip flutuante */}
      <BetSlip
        selections={selections}
        onRemove={removeSelection}
        onClear={clearAll}
      />
    </>
  );
}
