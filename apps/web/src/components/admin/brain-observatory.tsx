"use client";

import { useEffect, useMemo, useState } from "react";

type BrainMemoryEvent = {
  id: string;
  type: string;
  layer: string;
  source: string | null;
  createdAt: string;
  relevanceScore: number | null;
  round: {
    number: number;
    status: string;
    season: number;
  } | null;
  summary: {
    title: string | null;
    publicText: string | null;
    adminText: string | null;
    source: string | null;
    accuracy: number | null;
    anchorAcc: number | null;
    strengths: string[];
    weaknesses: string[];
    narrative: string | null;
    claudeOnline: boolean;
    gptOnline: boolean;
  };
};

type BrainStatusResponse = {
  generatedAt: string;
  season: number;
  env: {
    footballData: boolean;
    anthropic: boolean;
    openai: boolean;
    apiFootball: boolean;
    oddspapi: boolean;
    cronSecret: boolean;
  };
  brain: {
    thinkingMode: "DUAL_MIND" | "CLAUDE_ONLY" | "GPT_ONLY" | "OFFLINE";
    dualMindOnline: boolean;
    learningVelocity24h: number;
    latestMemoryType: string | null;
    latestMemoryAt: string | null;
  };
  live: {
    cursor: string | null;
    deltaMode: boolean;
    heartbeatMs: number;
    serverNow: string;
  };
  snapshot: {
    roundsTracked: number;
    latestRound: { number: number; status: string } | null;
    latestDeliveredRound: number | null;
    latestWeightsRound: number | null;
    totalMemoryEvents: number;
    totalReflections: number;
    totalDualAnalyses: number;
    totalChatMessages: number;
    userChatMessages: number;
    totalPatterns: number;
    totalSimulations: number;
    newEventsInPayload: number;
  };
  rounds: Array<{
    id: string;
    number: number;
    status: string;
    anchors: number;
    variations: number;
    memoryEvents: number;
  }>;
  factorWeights: Array<{
    round: number;
    overallAccuracy: number | null;
    anchorAccuracy: number | null;
  }>;
  patterns: Array<{
    id: string;
    condition: string;
    occurrences: number;
    hitRate: number | null;
    isAntiCorr: boolean;
    isSuppressed: boolean;
  }>;
  memory: BrainMemoryEvent[];
};

function fmtDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function pct(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

export function BrainObservatory({ initialSeason }: { initialSeason: number }) {
  const [season, setSeason] = useState<number>(initialSeason);
  const [data, setData] = useState<BrainStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);

  // Lê o tema global (data-theme no html) para manter consistência com o ThemeToggle
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return document.documentElement.getAttribute("data-theme") === "dark";
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  async function loadSnapshot(targetSeason: number) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/bob/brain/status?season=${targetSeason}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Falha ao carregar estado do cérebro.");
      }

      const payload = (await res.json()) as BrainStatusResponse;
      setData(payload);
      setCursor(payload.live.cursor ?? null);
      setLastSync(payload.generatedAt);
      setHighlightIds(payload.memory.slice(-3).map((item) => item.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro inesperado.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSnapshot(season);
  }, [season]);

  useEffect(() => {
    if (!data) return;

    const timer = window.setInterval(async () => {
      try {
        const query = cursor
          ? `/api/bob/brain/status?season=${season}&since=${encodeURIComponent(cursor)}`
          : `/api/bob/brain/status?season=${season}`;

        const res = await fetch(query, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        if (!res.ok) return;

        const incoming = (await res.json()) as BrainStatusResponse;

        setData((current) => {
          if (!current) return incoming;

          const known = new Set(current.memory.map((item) => item.id));
          const appended = incoming.memory.filter((item) => !known.has(item.id));
          const mergedMemory = [...current.memory, ...appended].slice(-120);

          return {
            ...incoming,
            memory: mergedMemory,
          };
        });

        if (incoming.memory.length > 0) {
          const newIds = incoming.memory.map((item) => item.id);
          setHighlightIds(newIds);
          window.setTimeout(() => setHighlightIds([]), 4000);
        }

        setCursor(incoming.live.cursor ?? cursor);
        setLastSync(incoming.generatedAt);
      } catch {
        // Silencia erros de polling para não quebrar o painel.
      }
    }, 10000);

    return () => window.clearInterval(timer);
  }, [data, cursor, season]);

  const connectionRows = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Football Data", ok: data.env.footballData },
      { label: "Claude", ok: data.env.anthropic },
      { label: "OpenAI", ok: data.env.openai },
      { label: "API-Football", ok: data.env.apiFootball },
      { label: "OddsPapi", ok: data.env.oddspapi },
      { label: "Cron Secret", ok: data.env.cronSecret },
    ];
  }, [data]);

  return (
    <div className="space-y-5">
      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
            Observabilidade · Tempo Real
          </p>
          <h2 className="mt-1 text-2xl font-semibold">Cérebro BOB</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-surface-strong px-3 py-1 text-[11px] text-muted">
            <span className={`h-1.5 w-1.5 rounded-full ${data ? "animate-pulse bg-emerald-500" : "bg-muted/50"}`} />
            polling 10s · {fmtDate(lastSync)}
          </span>
          <div className="flex items-center gap-1.5">
            <label htmlFor="brain-season" className="text-xs text-muted">Temporada</label>
            <input
              id="brain-season"
              type="number"
              value={season}
              onChange={(e) => setSeason(Number(e.target.value) || new Date().getFullYear())}
              className="w-20 rounded-lg border border-border bg-surface-strong px-2 py-1 text-xs text-foreground"
            />
          </div>
          <button
            type="button"
            onClick={() => loadSnapshot(season)}
            className="rounded-xl border border-accent/25 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/15 active:scale-95"
          >
            Atualizar
          </button>
        </div>
      </div>

      {/* ── Estados de loading / erro ───────────────────────────────────────── */}
      {loading && !data && (
        <div className="panel rounded-2xl border p-6 text-center text-sm text-muted">
          Carregando estado do cérebro...
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* ── Grade principal: Feed | Núcleo | Conexões ──────────────────── */}
          <div className="grid gap-4 lg:grid-cols-[1fr_260px_1fr]">

            {/* ── Coluna Esq.: Live Cognições ─────────────────────────────── */}
            <div className="panel rounded-2xl border p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">LIVE OBSERVABILIDADE</h3>
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  {data.snapshot.newEventsInPayload} novo(s)
                </span>
              </div>

              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {data.memory.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted">
                    Nenhuma cognição registrada ainda.
                  </p>
                ) : (
                  data.memory
                    .slice()
                    .reverse()
                    .map((event) => {
                      const isNew = highlightIds.includes(event.id);
                      return (
                        <div
                          key={event.id}
                          className={[
                            "rounded-xl border px-3 py-2.5 transition-all",
                            isNew
                              ? "border-emerald-500/50 bg-emerald-500/6 ring-1 ring-emerald-500/30"
                              : "border-border bg-surface-strong/50",
                          ].join(" ")}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              {isNew && (
                                <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500" />
                              )}
                              <span className="text-[10px] font-bold uppercase tracking-widest text-accent">
                                {event.type}
                              </span>
                              <span className="text-[10px] text-muted/60">{event.layer}</span>
                            </div>
                            <span className="shrink-0 text-[10px] text-muted">
                              {fmtDate(event.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-muted">
                            {event.summary.publicText ??
                              event.summary.adminText ??
                              event.summary.title ??
                              `Evento ${event.type}`}
                          </p>
                          {event.round && (
                            <p className="mt-1 text-[10px] text-muted/60">
                              R{event.round.number} · {event.round.status}
                              {event.relevanceScore != null &&
                                ` · relevância ${event.relevanceScore.toFixed(2)}`}
                            </p>
                          )}
                        </div>
                      );
                    })
                )}
              </div>
            </div>

            {/* ── Coluna Centro: Núcleo do Cérebro ────────────────────────── */}
            <div className="panel flex flex-col items-center gap-4 rounded-2xl border p-4">
              {/* Mini stats */}
              <div className="grid w-full grid-cols-2 gap-1.5">
                {[
                  { label: "Rodadas",  value: data.snapshot.roundsTracked        },
                  { label: "Memórias", value: data.snapshot.totalMemoryEvents     },
                  { label: "Padrões",  value: data.snapshot.totalPatterns         },
                  { label: "Análises", value: data.snapshot.totalDualAnalyses     },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-lg border border-border bg-surface-strong px-2 py-1.5 text-center"
                  >
                    <p className="text-[10px] text-muted">{stat.label}</p>
                    <p className="font-mono text-sm font-bold">{stat.value}</p>
                  </div>
                ))}
              </div>

              {/* Núcleo com anéis animados + nós de conexão */}
              <div className="relative flex h-52 w-52 items-center justify-center">
                {/* Anéis pulsantes */}
                <span
                  className="absolute h-52 w-52 rounded-full border border-accent/10"
                  style={{ animation: "bobRingPulse 3s ease-in-out infinite" }}
                />
                <span
                  className="absolute h-40 w-40 rounded-full border border-accent/20"
                  style={{ animation: "bobRingPulse 2.2s ease-in-out infinite", animationDelay: "0.4s" }}
                />
                <span className="absolute h-28 w-28 rounded-full border border-accent/35" />

                {/* Core — núcleo central */}
                <div
                  className="relative z-10 flex h-20 w-20 flex-col items-center justify-center rounded-full border border-accent/60 bg-gradient-to-b from-accent/25 to-surface-strong text-center"
                  style={{
                    boxShadow: "0 0 28px rgba(46,139,99,0.5), inset 0 0 10px rgba(46,139,99,0.15)",
                  }}
                >
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-accent">BOB</span>
                  <span className="text-[10px] font-semibold leading-none">
                    {data.brain.thinkingMode.split("_")[0]}
                  </span>
                </div>

                {/* Nós de conexão orbitando */}
                {connectionRows.map((conn, i) => {
                  const angle = (i / connectionRows.length) * 2 * Math.PI - Math.PI / 2;
                  const r     = 88;
                  const cx    = 104 + r * Math.cos(angle);
                  const cy    = 104 + r * Math.sin(angle);
                  return (
                    <div
                      key={conn.label}
                      title={conn.label}
                      className={[
                        "absolute flex h-7 w-7 items-center justify-center rounded-full border text-[8px] font-bold transition-all",
                        conn.ok
                          ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "border-border bg-surface-strong text-muted/50",
                      ].join(" ")}
                      style={{ left: `${cx - 14}px`, top: `${cy - 14}px` }}
                    >
                      {conn.label.slice(0, 2).toUpperCase()}
                    </div>
                  );
                })}
              </div>

              {/* Modo de cognição */}
              <div className="w-full text-center">
                <p className="text-[10px] text-muted">Modo de Cognição</p>
                <p
                  className={`mt-0.5 text-sm font-semibold ${
                    data.brain.dualMindOnline ? "text-accent" : "text-muted"
                  }`}
                >
                  {data.brain.thinkingMode.replace(/_/g, " ")}
                </p>
                <p className="mt-1 text-[10px] text-muted">
                  Aprendizado 24h:{" "}
                  <strong className="text-foreground">{data.brain.learningVelocity24h}</strong>
                </p>
                <p className="mt-0.5 text-[10px] text-muted">
                  Última memória:{" "}
                  <strong className="text-foreground">
                    {data.brain.latestMemoryType ?? "—"}
                  </strong>
                </p>
              </div>
            </div>

            {/* ── Coluna Dir.: Conexões + Conhecimento ────────────────────── */}
            <div className="flex flex-col gap-3">
              {/* Conexões Reais */}
              <div className="panel rounded-2xl border p-4">
                <h3 className="mb-3 text-sm font-semibold">Conexões Reais</h3>
                <div className="space-y-1.5">
                  {connectionRows.map((conn) => (
                    <div
                      key={conn.label}
                      className="flex items-center justify-between rounded-lg border border-border px-2.5 py-2"
                    >
                      <span className="text-xs">{conn.label}</span>
                      <span
                        className={`flex items-center gap-1.5 text-[10px] font-semibold ${
                          conn.ok
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-muted"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            conn.ok ? "animate-pulse bg-emerald-500" : "bg-muted/40"
                          }`}
                        />
                        {conn.ok ? "online" : "offline"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Conhecimento Aprendido */}
              <div className="panel flex-1 rounded-2xl border p-4">
                <h3 className="mb-3 text-sm font-semibold">Conhecimento Aprendido</h3>
                {data.patterns.length === 0 ? (
                  <p className="text-xs text-muted">Nenhum padrão identificado ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {data.patterns.slice(0, 5).map((p) => (
                      <div
                        key={p.id}
                        className={`rounded-lg border p-2.5 ${
                          p.isAntiCorr
                            ? "border-amber-500/40 bg-amber-500/5"
                            : "border-border bg-surface-strong/50"
                        }`}
                      >
                        <p className="line-clamp-2 text-[11px] leading-relaxed">{p.condition}</p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-border">
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{ width: `${Math.round((p.hitRate ?? 0) * 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted">
                            {pct(p.hitRate)} · {p.occurrences}×
                          </span>
                        </div>
                        {p.isAntiCorr && (
                          <span className="mt-1 inline-block rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                            ⚠ anti-correlação
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Evolução de Pesos ────────────────────────────────────────────── */}
          <div className="panel rounded-2xl border p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Evolução de Pesos por Rodada</h3>
              <div className="flex items-center gap-3 text-[10px] text-muted">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-3.5 rounded bg-accent/80" /> Geral
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-3 rounded bg-signal/80" /> Âncoras
                </span>
              </div>
            </div>

            {data.factorWeights.length === 0 ? (
              <p className="text-xs text-muted">
                Nenhum snapshot de pesos salvo ainda. Execute a calibração.
              </p>
            ) : (
              <div className="flex items-end gap-2 overflow-x-auto pb-2 pt-1">
                {data.factorWeights
                  .slice(0, 12)
                  .reverse()
                  .map((fw) => {
                    const accH    = Math.max(4, (fw.overallAccuracy ?? 0) * 80);
                    const ancH    = Math.max(2, (fw.anchorAccuracy ?? 0) * 80);
                    const accPct  = pct(fw.overallAccuracy);
                    return (
                      <div
                        key={fw.round}
                        className="flex min-w-[44px] flex-col items-center gap-1"
                      >
                        <span className="text-[9px] text-muted">{accPct}</span>
                        <div className="flex items-end gap-0.5">
                          <div
                            className="w-4 rounded-t-sm bg-accent/80 transition-all"
                            style={{ height: `${accH}px` }}
                            title={`Geral: ${accPct}`}
                          />
                          <div
                            className="w-3 rounded-t-sm bg-signal/80 transition-all"
                            style={{ height: `${ancH}px` }}
                            title={`Âncoras: ${pct(fw.anchorAccuracy)}`}
                          />
                        </div>
                        <span className="font-mono text-[9px] text-muted">R{fw.round}</span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Animações CSS */}
      <style>{`
        @keyframes bobRingPulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.04); }
        }
      `}</style>
    </div>
  );
}
