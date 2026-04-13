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
    <section className="panel rounded-3xl border p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="kicker text-xs text-muted">Observabilidade viva</p>
          <h2 className="mt-1 text-2xl font-semibold">Cérebro BOB em tempo real</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadSnapshot(season)}
            className="rounded-xl border border-accent/25 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent-strong transition hover:bg-accent/15"
          >
            Atualizar agora
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
        <label htmlFor="season">Temporada:</label>
        <input
          id="season"
          type="number"
          value={season}
          onChange={(e) => setSeason(Number(e.target.value) || new Date().getFullYear())}
          className="w-24 rounded-lg border border-border bg-surface-strong px-2 py-1 text-foreground"
        />
        <span>última sync: {fmtDate(lastSync)}</span>
      </div>

      {loading && (
        <div className="mt-5 rounded-2xl border border-border bg-surface-strong px-4 py-3 text-sm text-muted">Carregando cérebro real...</div>
      )}

      {error && (
        <div className="mt-5 rounded-2xl border border-red-300/40 bg-red-500/10 px-4 py-3 text-sm text-red-300 dark:border-red-500/30 dark:text-red-200">{error}</div>
      )}

      {data && !loading && !error && (
        <div className="mt-6 space-y-6">
          <div className="grid gap-3 md:grid-cols-4">
            <article className="rounded-2xl border border-border bg-surface-strong px-4 py-3">
              <p className="text-xs text-muted">Modo de pensamento</p>
              <p className="mt-1 text-lg font-semibold">{data.brain.thinkingMode.replace("_", " ")}</p>
            </article>
            <article className="rounded-2xl border border-border bg-surface-strong px-4 py-3">
              <p className="text-xs text-muted">Aprendizado (24h)</p>
              <p className="mt-1 text-lg font-semibold">{data.brain.learningVelocity24h}</p>
            </article>
            <article className="rounded-2xl border border-border bg-surface-strong px-4 py-3">
              <p className="text-xs text-muted">Memórias totais</p>
              <p className="mt-1 text-lg font-semibold">{data.snapshot.totalMemoryEvents}</p>
            </article>
            <article className="rounded-2xl border border-border bg-surface-strong px-4 py-3">
              <p className="text-xs text-muted">Rodada mais recente</p>
              <p className="mt-1 text-lg font-semibold">{data.snapshot.latestRound ? `R${data.snapshot.latestRound.number}` : "-"}</p>
            </article>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <article className="rounded-2xl border border-border bg-surface-strong p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold">Novas cognições entrando no cérebro</h3>
                <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-700 dark:text-emerald-300">polling 10s</span>
              </div>
              <div className="mt-3 max-h-95 space-y-2 overflow-auto pr-1">
                {data.memory.length === 0 && (
                  <p className="text-sm text-muted">Nenhum evento de memória disponível.</p>
                )}
                {data.memory.slice().reverse().map((event) => {
                  const pulse = highlightIds.includes(event.id);
                  return (
                    <div
                      key={event.id}
                      className={[
                        "rounded-xl border border-border bg-surface px-3 py-2 transition",
                        pulse ? "ring-1 ring-emerald-500/70" : "",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em]">{event.type}</p>
                        <p className="text-[11px] text-muted">{fmtDate(event.createdAt)}</p>
                      </div>
                      <p className="mt-1 text-sm leading-6">
                        {event.summary.title || event.summary.publicText || event.summary.adminText || "Evento sem resumo textual."}
                      </p>
                      <p className="mt-1 text-[11px] text-muted">
                        camada {event.layer} · rodada {event.round ? `R${event.round.number}` : "n/a"} · relevância {event.relevanceScore ?? "n/a"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="rounded-2xl border border-border bg-surface-strong p-4">
              <h3 className="text-base font-semibold">Conexões reais</h3>
              <div className="mt-3 space-y-2">
                {connectionRows.map((conn) => (
                  <div key={conn.label} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span>{conn.label}</span>
                    <span className={[
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      conn.ok
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "bg-muted/15 text-muted",
                    ].join(" ")}>
                      {conn.ok ? "ativo" : "off"}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-border p-3 text-xs text-muted">
                <p>Último tipo aprendido: <strong className="text-foreground">{data.brain.latestMemoryType ?? "-"}</strong></p>
                <p className="mt-1">Última entrada: <strong className="text-foreground">{fmtDate(data.brain.latestMemoryAt)}</strong></p>
                <p className="mt-1">Acurácia rodada mais recente: <strong className="text-foreground">{pct(data.factorWeights[0]?.overallAccuracy ?? null)}</strong></p>
              </div>
            </article>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-border bg-surface-strong p-4">
              <h3 className="text-base font-semibold">Padrões aprendidos</h3>
              <div className="mt-3 space-y-2 text-sm">
                {data.patterns.slice(0, 5).map((pattern) => (
                  <div key={pattern.id} className="rounded-lg border border-border px-3 py-2">
                    <p className="line-clamp-2">{pattern.condition}</p>
                    <p className="mt-1 text-xs text-muted">
                      ocorrências {pattern.occurrences} · acerto {pct(pattern.hitRate)}
                    </p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-border bg-surface-strong p-4">
              <h3 className="text-base font-semibold">Evolução recente de pesos</h3>
              <div className="mt-3 space-y-2 text-sm">
                {data.factorWeights.slice(0, 5).map((row) => (
                  <div key={row.round} className="rounded-lg border border-border px-3 py-2">
                    <p className="font-medium">Rodada {row.round}</p>
                    <p className="mt-1 text-xs text-muted">
                      geral {pct(row.overallAccuracy)} · âncoras {pct(row.anchorAccuracy)}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </div>
      )}
    </section>
  );
}
