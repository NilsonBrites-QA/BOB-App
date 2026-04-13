"use client";

import { useEffect, useRef } from "react";
import { TeamBadge } from "./team-badge";
import type { ScoredMatch } from "@/lib/bob/engine/scoring";
import type { FactorBreakdown } from "@/lib/bob/engine/factor-breakdown";

type MatchDetailModalProps = {
  match: ScoredMatch;
  breakdown: FactorBreakdown;
  homeBadgeUrl?: string | null;
  awayBadgeUrl?: string | null;
  isAnchor?: boolean;
  onClose: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FormRow({ team, form }: { team: string; form: string[] }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 truncate text-xs text-muted">{team}</span>
      <div className="flex items-center gap-1.5">
        {form.slice(0, 5).map((r, i) => (
          <span
            key={i}
            className={[
              "flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold",
              r === "W"
                ? "bg-accent/15 text-accent"
                : r === "D"
                  ? "bg-signal/15 text-signal"
                  : "bg-muted/15 text-muted",
            ].join(" ")}
          >
            {r}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProbBar({
  homeP,
  drawP,
  awayP,
  homeTeam,
  awayTeam,
}: {
  homeP: number;
  drawP: number;
  awayP: number;
  homeTeam: string;
  awayTeam: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full border border-border/40">
        <div className="bg-accent/80 transition-all" style={{ width: `${homeP}%` }} />
        <div className="bg-muted/30 transition-all" style={{ width: `${drawP}%` }} />
        <div className="bg-signal/70 transition-all" style={{ width: `${awayP}%` }} />
      </div>
      <div className="grid grid-cols-3 text-xs">
        <div>
          <p className="truncate font-semibold text-foreground">{homeTeam}</p>
          <p className="font-mono text-lg font-bold text-accent tabular-nums">{homeP}%</p>
        </div>
        <div className="text-center">
          <p className="text-muted">Empate</p>
          <p className="font-mono text-lg font-bold tabular-nums">{drawP}%</p>
        </div>
        <div className="text-right">
          <p className="truncate font-semibold text-foreground">{awayTeam}</p>
          <p className="font-mono text-lg font-bold text-signal tabular-nums">{awayP}%</p>
        </div>
      </div>
    </div>
  );
}

function FactorRow({ score, label, weight }: { score: number; label: string; weight: number }) {
  const barW = `${score}%`;
  const color =
    score >= 70 ? "bg-accent" :
    score >= 50 ? "bg-signal" :
    "bg-muted/50";

  return (
    <div className="flex items-center gap-3">
      <div className="w-32 shrink-0">
        <span className="text-xs text-muted">{label}</span>
      </div>
      <div className="relative flex-1 h-1.5 overflow-hidden rounded-full bg-border/60">
        <div className={`h-full rounded-full ${color}`} style={{ width: barW }} />
      </div>
      <div className="flex w-12 shrink-0 items-center justify-end gap-1.5">
        <span className="font-mono text-xs font-semibold tabular-nums">{score}</span>
        <span className="text-[9px] text-muted">×{weight}</span>
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function MatchDetailModal({
  match,
  breakdown,
  homeBadgeUrl,
  awayBadgeUrl,
  isAnchor,
  onClose,
}: MatchDetailModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Fechar com Esc
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Fechar ao clicar fora
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const homeP = Math.round(breakdown.homeWinProbNorm * 100);
  const drawP = Math.round(breakdown.drawProbNorm * 100);
  const awayP = Math.round(breakdown.awayWinProbNorm * 100);

  const confScore = match.score;
  const confLabel =
    confScore >= 70 ? "Alta" : confScore >= 50 ? "Média" : "Baixa";
  const confColor =
    confScore >= 70 ? "text-accent" : confScore >= 50 ? "text-signal" : "text-muted";

  const suggestedLabel =
    match.suggestedResult === "1"
      ? match.homeTeam
      : match.suggestedResult === "2"
        ? match.awayTeam
        : "Empate";

  // Top 5 fatores por score
  const topFactors = [...breakdown.factors]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // Todos os 15 fatores agrupados em 3 cols para a tabela completa
  const allFactors = breakdown.factors;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:items-center"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[28px] border border-border bg-surface-strong shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 border-b border-border p-6 pb-5">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <TeamBadge teamName={match.homeTeam} badgeUrl={homeBadgeUrl} size={40} />
              <div className="px-2 py-1 text-center">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted">vs</p>
              </div>
              <TeamBadge teamName={match.awayTeam} badgeUrl={awayBadgeUrl} size={40} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">
                  {match.homeTeam}
                  <span className="mx-1.5 font-normal text-muted">×</span>
                  {match.awayTeam}
                </h2>
                {isAnchor && (
                  <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
                    âncora
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-muted">
                Score BOB: <span className="font-mono font-bold text-foreground">{match.score}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-2 text-muted transition hover:bg-border hover:text-foreground"
            aria-label="Fechar"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* ── Body (scrollável) ─────────────────────────────────────────── */}
        <div className="space-y-6 p-6">

          {/* ── Probabilidades ────────────────────────────────────────── */}
          <section>
            <p className="kicker text-[10px] uppercase tracking-wider text-muted">Probabilidades de mercado</p>
            <div className="mt-3">
              <ProbBar
                homeP={homeP}
                drawP={drawP}
                awayP={awayP}
                homeTeam={match.homeTeam}
                awayTeam={match.awayTeam}
              />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <span className="font-mono">1</span>
                <span className="font-semibold text-foreground">{match.homeOdd.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <span className="font-mono">X</span>
                <span className="font-semibold text-foreground">{match.drawOdd.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <span className="font-mono">2</span>
                <span className="font-semibold text-foreground">{match.awayOdd.toFixed(2)}</span>
              </div>
            </div>
          </section>

          {/* ── Previsão BOB ──────────────────────────────────────────── */}
          <section className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted">Previsão BOB</p>
                <p className="mt-1 text-lg font-semibold">{suggestedLabel}</p>
                <p className="mt-0.5 text-xs text-muted">
                  Confiança: <span className={`font-semibold ${confColor}`}>{confLabel}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted">Score</p>
                <p className="font-mono text-3xl font-bold tabular-nums text-foreground">
                  {match.score}
                </p>
              </div>
            </div>

            {/* Razões principais */}
            {match.reasons.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-t border-accent/20 pt-3">
                {match.reasons.map((r, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-5 text-muted">
                    <span className="text-accent">▸</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Forma recente ─────────────────────────────────────────── */}
          <section>
            <p className="kicker text-[10px] uppercase tracking-wider text-muted">Últimos 5 resultados</p>
            <div className="mt-3 space-y-2">
              <FormRow team={match.homeTeam} form={match.homeForm} />
              <FormRow team={match.awayTeam} form={match.awayForm} />
            </div>
          </section>

          {/* ── Top 5 fatores ─────────────────────────────────────────── */}
          <section>
            <p className="kicker text-[10px] uppercase tracking-wider text-muted">
              Fatores decisivos (top 5)
            </p>
            <div className="mt-3 space-y-2.5">
              {topFactors.map((f) => (
                <FactorRow key={f.id} score={f.score} label={f.label} weight={f.weight} />
              ))}
            </div>
          </section>

          {/* ── Todos os 15 fatores ───────────────────────────────────── */}
          <section>
            <p className="kicker text-[10px] uppercase tracking-wider text-muted">
              Todos os 15 fatores
            </p>
            <div className="mt-3 overflow-hidden rounded-2xl border border-border">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-[rgba(18,32,24,0.04)]">
                  <tr>
                    <th className="px-4 py-2 font-medium text-muted">Fator</th>
                    <th className="px-4 py-2 text-right font-medium text-muted">Nota</th>
                    <th className="px-4 py-2 text-right font-medium text-muted">Peso</th>
                    <th className="w-32 px-4 py-2 font-medium text-muted">Barômetro</th>
                  </tr>
                </thead>
                <tbody>
                  {allFactors.map((f) => {
                    const barColor =
                      f.score >= 70 ? "bg-accent" :
                      f.score >= 50 ? "bg-signal" :
                      "bg-muted/50";
                    return (
                      <tr key={f.id} className="border-t border-border/50">
                        <td className="px-4 py-2 text-muted">{f.label}</td>
                        <td className="px-4 py-2 text-right font-mono font-semibold tabular-nums">
                          {f.score}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-muted tabular-nums">
                          {f.weight}%
                        </td>
                        <td className="px-4 py-2">
                          <div className="h-1.5 overflow-hidden rounded-full bg-border/60">
                            <div
                              className={`h-full rounded-full ${barColor}`}
                              style={{ width: `${f.score}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Contexto extra ────────────────────────────────────────── */}
          {(match.weatherRain || match.refereeCardRate || match.homeAbsenceRate > 0.15 || match.awayAbsenceRate > 0.15) && (
            <section>
              <p className="kicker text-[10px] uppercase tracking-wider text-muted">Contexto adicional</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {match.weatherRain && (
                  <span className="rounded-full border border-border bg-surface-strong px-3 py-1 text-xs text-muted">
                    {match.weatherIntensity === "heavy"
                      ? "🌧 Chuva forte"
                      : match.weatherIntensity === "moderate"
                        ? "🌦 Chuva moderada"
                        : "🌂 Chuva leve"}
                  </span>
                )}
                {match.refereeCardRate && match.refereeCardRate > 3.0 && (
                  <span className="rounded-full border border-border bg-surface-strong px-3 py-1 text-xs text-muted">
                    ⚠ Árbitro rígido ({match.refereeCardRate.toFixed(1)} cart./jogo)
                  </span>
                )}
                {match.homeAbsenceRate > 0.15 && (
                  <span className="rounded-full border border-border bg-surface-strong px-3 py-1 text-xs text-muted">
                    ⚡ Desfalques mandante ({Math.round(match.homeAbsenceRate * 100)}%)
                  </span>
                )}
                {match.awayAbsenceRate > 0.15 && (
                  <span className="rounded-full border border-border bg-surface-strong px-3 py-1 text-xs text-muted">
                    ⚡ Desfalques visitante ({Math.round(match.awayAbsenceRate * 100)}%)
                  </span>
                )}
                {match.homeCupCompetition && match.homeCupCompetition !== "none" && (
                  <span className="rounded-full border border-border bg-surface-strong px-3 py-1 text-xs text-muted">
                    🏆 Mandante na {match.homeCupCompetition}
                  </span>
                )}
                {match.awayCupCompetition && match.awayCupCompetition !== "none" && (
                  <span className="rounded-full border border-border bg-surface-strong px-3 py-1 text-xs text-muted">
                    🏆 Visitante na {match.awayCupCompetition}
                  </span>
                )}
              </div>
            </section>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="border-t border-border px-6 py-4">
          <p className="text-[10px] text-muted">
            Análise gerada pelo motor BOB. Score baseado em 15 fatores com pesos adaptativos (ABQC).
            Não constitui aconselhamento financeiro.
          </p>
        </div>
      </div>
    </div>
  );
}
