"use client";

import { useState, useEffect, useCallback } from "react";
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

type SuggestionEntry = {
  market: string;
  option: string;
  optionLabel: string;
  odd: number;
  confidence: number | null;
  justification: string | null;
  result: string | null;
};

type ProfileSuggestions = Partial<Record<string, SuggestionEntry[]>>;
type SuggestionsMap     = Record<string, ProfileSuggestions>;

type ApostasClientProps = {
  serieA: Match[];
  serieB: Match[];
};

type ProfileId = "conservador" | "moderado" | "agressivo" | "matematico";
type Tab       = "serie-a" | "serie-b" | "ao-vivo" | "historico";

// ─── Helpers & constantes ──────────────────────────────────────────────────────

// ─── Helpers & constantes ──────────────────────────────────────────────────────

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

const MARKET_LABELS: Record<string, string> = {
  RESULT_1X2:       "1×2",
  BTTS:             "Ambas Marcam",
  OVER_UNDER:       "Over/Under",
  DOUBLE_CHANCE:    "Dupla Chance",
  EXACT_SCORE:      "Placar Exato",
  ASIAN_HANDICAP:   "Handicap Asiático",
  FIRST_HALF_GOALS: "Gols 1º Tempo",
  CORNERS:          "Escanteios",
  CARDS:            "Cartões",
};

const PROFILES: {
  id: ProfileId;
  label: string;
  emoji: string;
  colorClass: string;
  borderClass: string;
  bgClass: string;
}[] = [
  { id: "conservador", label: "Conservador", emoji: "🛡️", colorClass: "text-emerald-600 dark:text-emerald-400",  borderClass: "border-emerald-500/60", bgClass: "bg-emerald-500/8"  },
  { id: "moderado",    label: "Moderado",    emoji: "⚖️", colorClass: "text-amber-600 dark:text-amber-400",     borderClass: "border-amber-500/60",   bgClass: "bg-amber-500/8"    },
  { id: "agressivo",   label: "Agressivo",   emoji: "🔥", colorClass: "text-red-600 dark:text-red-400",         borderClass: "border-red-500/60",     bgClass: "bg-red-500/8"      },
  { id: "matematico",  label: "Matemático",  emoji: "🔢", colorClass: "text-blue-600 dark:text-blue-400",       borderClass: "border-blue-500/60",    bgClass: "bg-blue-500/8"     },
];

function confidenceMeta(conf: number | null): { label: string; colorClass: string; pct: number } {
  if (conf == null) return { label: "—",              colorClass: "text-muted",                             pct: 0 };
  if (conf >= 0.70) return { label: "Alta Confiança",  colorClass: "text-emerald-600 dark:text-emerald-400", pct: conf * 100 };
  if (conf >= 0.50) return { label: "Confiança Média", colorClass: "text-amber-600 dark:text-amber-400",    pct: conf * 100 };
  return               { label: "Baixa Confiança", colorClass: "text-red-500",                            pct: conf * 100 };
}

// ─── Badge de resultado ────────────────────────────────────────────────────────

function ResultBadge({ result }: { result: string | null }) {
  if (!result) return null;
  const map: Record<string, { label: string; cls: string }> = {
    WON:  { label: "✓ Green", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    LOST: { label: "✗ Red",   cls: "bg-red-500/15 text-red-600 dark:text-red-400"            },
    VOID: { label: "— Void",  cls: "bg-muted/20 text-muted"                                   },
  };
  const meta = map[result];
  if (!meta) return null;
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

// ─── Card de sugestão por perfil (estilo Bet365 "Criar Aposta+") ───────────────

function ProfileCard({
  profile,
  selections,
  onCopy,
  matchId,
  homeTeam,
  awayTeam,
}: {
  profile: (typeof PROFILES)[number];
  selections: SuggestionEntry[] | undefined;
  onCopy: (sels: Omit<BetSelection, "id">[]) => void;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
}) {
  if (!selections || selections.length === 0) {
    return (
      <div className={`rounded-2xl border ${profile.borderClass} ${profile.bgClass} p-4`}>
        <p className="text-center text-xs text-muted">
          Sem sugestão {profile.label.toLowerCase()} para este jogo.
          <br />
          <span className="opacity-70">Acione a análise em <code className="rounded bg-surface-strong px-1">/api/bob/analyze-match</code>.</span>
        </p>
      </div>
    );
  }

  const combinedOdd = Math.round(selections.reduce((a, s) => a * s.odd, 1) * 100) / 100;
  const avgConf     = selections.reduce((a, s) => a + (s.confidence ?? 0), 0) / selections.length;
  const confMeta    = confidenceMeta(avgConf);

  const handleCopy = () => {
    const betSels: Omit<BetSelection, "id">[] = selections.map((s) => ({
      matchId,
      homeTeam,
      awayTeam,
      market:      s.market,
      marketLabel: MARKET_LABELS[s.market] ?? s.market,
      option:      s.option,
      optionLabel: s.optionLabel,
      odd:         s.odd,
    }));
    onCopy(betSels);
  };

  return (
    <div className={`rounded-2xl border ${profile.borderClass} ${profile.bgClass} p-4`}>
      {/* Lista de seleções */}
      <div className="space-y-2.5">
        {selections.map((sel, i) => (
          <div key={i} className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="rounded-md bg-surface-strong px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  {MARKET_LABELS[sel.market] ?? sel.market}
                </span>
                <span className="text-xs font-semibold">{sel.optionLabel}</span>
                <ResultBadge result={sel.result} />
              </div>
              {sel.justification && (
                <p className="mt-0.5 text-[11px] leading-snug text-muted">{sel.justification}</p>
              )}
            </div>
            <span className={`shrink-0 font-mono text-sm font-bold ${profile.colorClass}`}>
              {sel.odd.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      {/* Separador */}
      <div className={`my-3 h-px border-t ${profile.borderClass} opacity-40`} />

      {/* Rodapé: odd combinada + confiança */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Odd Combinada</p>
          <p className={`font-mono text-xl font-bold ${profile.colorClass}`}>{combinedOdd.toFixed(2)}</p>

          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 w-20 overflow-hidden rounded-full bg-border">
              <div
                className={`h-full rounded-full transition-all ${
                  confMeta.pct >= 70 ? "bg-emerald-500" : confMeta.pct >= 50 ? "bg-amber-500" : "bg-red-400"
                }`}
                style={{ width: `${confMeta.pct}%` }}
              />
            </div>
            <span className={`text-[10px] font-semibold ${confMeta.colorClass}`}>{confMeta.label}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className={`flex items-center gap-1.5 rounded-xl border ${profile.borderClass} px-3 py-2 text-xs font-semibold transition hover:opacity-80 active:scale-95 ${profile.colorClass}`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <rect x="0.75" y="3.75" width="7.5" height="7.5" rx="1.5" />
            <path d="M3.75 3.75V2.25a1.5 1.5 0 0 1 1.5-1.5h4.5a1.5 1.5 0 0 1 1.5 1.5v4.5a1.5 1.5 0 0 1-1.5 1.5H9" />
          </svg>
          Adicionar ao Bilhete
        </button>
      </div>
    </div>
  );
}

// ─── Card de partida expandível ────────────────────────────────────────────────

function MatchCard({
  match,
  suggestions,
  onAddSelections,
  loading,
}: {
  match: Match;
  suggestions: ProfileSuggestions | undefined;
  onAddSelections: (sels: Omit<BetSelection, "id">[]) => void;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeProfile, setProfile] = useState<ProfileId>("conservador");

  const isFinished = match.status === "FINISHED";
  const isLive     = match.status === "LIVE";
  const activeProfileMeta = PROFILES.find((p) => p.id === activeProfile)!;

  return (
    <div className="panel overflow-hidden rounded-2xl transition-all">
      {/* Cabeçalho sempre visível */}
      <button
        type="button"
        onClick={() => !isFinished && setExpanded((v) => !v)}
        className={`w-full p-4 text-left transition ${!isFinished ? "hover:bg-surface-strong/50 cursor-pointer" : "cursor-default"}`}
      >
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

        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-1 flex-col items-center gap-1.5">
            {match.homeCrest ? (
              <Image src={match.homeCrest} alt={match.homeTeamShort} width={36} height={36} className="h-9 w-9 object-contain" unoptimized />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-strong text-xs font-bold text-muted">
                {match.homeTeamShort.slice(0, 3).toUpperCase()}
              </div>
            )}
            <span className="max-w-20 text-center text-xs font-semibold leading-tight">{match.homeTeamShort}</span>
          </div>

          <div className="flex flex-col items-center gap-0.5">
            {isFinished || isLive ? (
              <span className="font-mono text-2xl font-bold tracking-tight">
                {match.homeScore ?? 0} – {match.awayScore ?? 0}
              </span>
            ) : (
              <span className="text-lg font-bold text-muted">×</span>
            )}
            {!isFinished && !isLive && (
              <span className="text-[10px] text-muted/60">{expanded ? "▲" : "▼"}</span>
            )}
          </div>

          <div className="flex flex-1 flex-col items-center gap-1.5">
            {match.awayCrest ? (
              <Image src={match.awayCrest} alt={match.awayTeamShort} width={36} height={36} className="h-9 w-9 object-contain" unoptimized />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-strong text-xs font-bold text-muted">
                {match.awayTeamShort.slice(0, 3).toUpperCase()}
              </div>
            )}
            <span className="max-w-20 text-center text-xs font-semibold leading-tight">{match.awayTeamShort}</span>
          </div>
        </div>
      </button>

      {/* Painel de sugestões BOB */}
      {expanded && !isFinished && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">
              BOB Analisa
            </span>
            {loading && (
              <svg
                width="12" height="12" viewBox="0 0 12 12" fill="none"
                stroke="currentColor" strokeWidth="2"
                className="animate-spin text-accent" aria-hidden
              >
                <path d="M6 1v2M6 9v2M1 6h2M9 6h2M2.93 2.93l1.41 1.41M7.66 7.66l1.41 1.41M2.93 9.07l1.41-1.41M7.66 4.34l1.41-1.41" />
              </svg>
            )}
          </div>

          {/* Seletor de perfil */}
          <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface-strong p-1">
            {PROFILES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProfile(p.id)}
                className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  activeProfile === p.id
                    ? `${p.bgClass} ${p.colorClass} border ${p.borderClass}`
                    : "text-muted hover:text-foreground"
                }`}
              >
                <span>{p.emoji}</span>
                <span>{p.label}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center rounded-2xl border border-border py-8">
              <span className="text-sm text-muted">BOB analisando mercados...</span>
            </div>
          ) : (
            <ProfileCard
              profile={activeProfileMeta}
              selections={suggestions?.[activeProfile]}
              onCopy={onAddSelections}
              matchId={match.id}
              homeTeam={match.homeTeam}
              awayTeam={match.awayTeam}
            />
          )}
        </div>
      )}

      {isFinished && (
        <div className="border-t border-border px-4 py-2.5 text-center">
          <span className="text-[11px] text-muted">Partida encerrada</span>
        </div>
      )}
    </div>
  );
}

// ─── Lista agrupada por rodada ─────────────────────────────────────────────────

function MatchList({
  matches,
  suggestions,
  loadingSuggestions,
  onAddSelections,
}: {
  matches: Match[];
  suggestions: SuggestionsMap;
  loadingSuggestions: boolean;
  onAddSelections: (sels: Omit<BetSelection, "id">[]) => void;
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
          Execute a importação em{" "}
          <code className="rounded bg-surface-strong px-1">/api/cron/import-matches</code>.
        </p>
      </div>
    );
  }

  const byRound = matches.reduce<Record<number, Match[]>>((acc, m) => {
    const r = m.round;
    if (!acc[r]) acc[r] = [];
    acc[r].push(m);
    return acc;
  }, {});

  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);

  return (
    <div className="space-y-8">
      {rounds.map((round) => (
        <section key={round}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
            Rodada {round}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {byRound[round]!.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                suggestions={suggestions[match.id]}
                onAddSelections={onAddSelections}
                loading={loadingSuggestions && !suggestions[match.id]}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ─── Componente raiz ───────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: "serie-a",   label: "Série A"       },
  { id: "serie-b",   label: "Série B"       },
  { id: "ao-vivo",   label: "Ao Vivo"       },
  { id: "historico", label: "Histórico BOB" },
];

export function ApostasClient({ serieA, serieB }: ApostasClientProps) {
  const [tab, setTab]                               = useState<Tab>("serie-a");
  const [suggestions, setSuggestions]               = useState<SuggestionsMap>({});
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const { selections, addSelection, removeSelection, clearAll } = useBetSlip();

  const liveMatches    = [...serieA, ...serieB].filter((m) => m.status === "LIVE");
  const historyMatches = [...serieA, ...serieB].filter((m) => m.status === "FINISHED");

  const currentMatches =
    tab === "serie-a"   ? serieA.filter((m) => m.status !== "FINISHED") :
    tab === "serie-b"   ? serieB.filter((m) => m.status !== "FINISHED") :
    tab === "ao-vivo"   ? liveMatches :
    historyMatches;

  // Busca sugestões para partidas visíveis
  useEffect(() => {
    const ids = currentMatches.map((m) => m.id);
    if (ids.length === 0) return;
    let cancelled = false;
    setLoadingSuggestions(true);

    fetch(`/api/bob/suggestions?matchIds=${ids.join(",")}`)
      .then((r) => r.json())
      .then((data: { suggestions?: SuggestionsMap }) => {
        if (!cancelled && data.suggestions) {
          setSuggestions((prev) => ({ ...prev, ...data.suggestions }));
        }
      })
      .catch(() => {/* silencioso */})
      .finally(() => { if (!cancelled) setLoadingSuggestions(false); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleAddSelections = useCallback(
    (sels: Omit<BetSelection, "id">[]) => { sels.forEach((sel) => addSelection(sel)); },
    [addSelection],
  );

  return (
    <>
      {/* Tabs de navegação */}
      <div className="mb-6 flex items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-surface-strong p-1">
        {TABS.map((t) => {
          const count = t.id === "ao-vivo" ? liveMatches.length : undefined;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                tab === t.id ? "bg-accent/10 text-accent" : "text-muted hover:text-foreground"
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

      {/* Banner BOB Analyzer */}
      {(tab === "serie-a" || tab === "serie-b") && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/5 p-3.5">
          <span className="mt-0.5 text-lg" aria-hidden>🧠</span>
          <div>
            <p className="text-xs font-semibold text-accent">BOB Bet Analyzer</p>
            <p className="mt-0.5 text-xs text-muted">
              Clique em uma partida para ver as sugestões do BOB por perfil de apostador.
              Copie a aposta diretamente para o seu bilhete.
            </p>
          </div>
        </div>
      )}

      {/* Lista de partidas */}
      <MatchList
        matches={currentMatches}
        suggestions={suggestions}
        loadingSuggestions={loadingSuggestions}
        onAddSelections={handleAddSelections}
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

