"use client";

/**
 * BOB — Apostas Client
 *
 * Exibe os tickets prontos entregues pelo BOB, um por jogo da rodada.
 * O usuário COPIA o ticket — não monta nada.
 *
 * Layout:
 *   • Hero com contexto da rodada
 *   • Filtro por perfil (todos / alavancagem / moderada / agressiva)
 *   • Cards de ticket — cada um com picks prontos e botão "Copiar"
 */

import { useState } from "react";
import { TeamShield } from "@/components/team-shield";
import type { CriarApostaPick, CriarApostaProfile } from "@/lib/bob/engine/criar-apostas";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type TicketView = {
  matchId:             string;
  homeTeam:            string;
  awayTeam:            string;
  homeCrest:           string | null;
  awayCrest:           string | null;
  competition:         string;
  profile:             CriarApostaProfile;
  picks:               CriarApostaPick[];
  combinedOdd:         number;
  combinedProbability: number;
  confidence:          number;
  bobNarrative:        string;
  riskLabel:           "Baixo" | "Médio" | "Alto";
  alerts:              string[];
};

type Props = {
  tickets:    TicketView[];
  roundLabel: string;
  isDemo:     boolean;
};

type FilterProfile = "TODOS" | CriarApostaProfile;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROFILE_LABELS: Record<CriarApostaProfile, string> = {
  ALAVANCAGEM: "Alavancagem",
  MODERADA:    "Moderada",
  AGRESSIVA:   "Agressiva",
};

const PROFILE_COLORS: Record<CriarApostaProfile, string> = {
  ALAVANCAGEM: "bg-accent/15 text-accent-strong border-accent/30",
  MODERADA:    "bg-signal/15 text-signal border-signal/30",
  AGRESSIVA:   "bg-red-500/15 text-red-600 border-red-500/30",
};

const RISK_COLORS: Record<string, string> = {
  Baixo: "text-accent",
  Médio: "text-signal",
  Alto:  "text-red-500",
};

function confidenceBar(confidence: number) {
  const pct = Math.min(100, Math.max(0, confidence));
  const color =
    pct >= 70 ? "bg-accent" :
    pct >= 50 ? "bg-signal" :
    "bg-red-500";
  return (
    <div className="h-1 w-full rounded-full bg-border/40">
      <div
        className={`h-1 rounded-full transition-all ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function buildCopyText(t: TicketView): string {
  const header = `🎯 BOB · ${t.homeTeam} x ${t.awayTeam}`;
  const picks  = t.picks.map((p) => `  • ${p.label} @${p.odd.toFixed(2)}`).join("\n");
  const odd    = `  Odd combinada: ${t.combinedOdd.toFixed(2)}×`;
  const conf   = `  Confiança: ${t.confidence}% · Risco: ${t.riskLabel}`;
  return [header, picks, odd, conf].join("\n");
}

// ─── Card de Ticket ───────────────────────────────────────────────────────────

function TicketCard({ ticket }: { ticket: TicketView }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildCopyText(ticket));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard indisponível */
    }
  }

  return (
    <article className="panel flex flex-col gap-0 overflow-hidden rounded-[24px]">
      {/* Header: times */}
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <TeamShield teamName={ticket.homeTeam} src={ticket.homeCrest} size={28} />
          <span className="truncate text-sm font-semibold">{ticket.homeTeam}</span>
        </div>

        <span className="shrink-0 rounded-full bg-surface-strong px-2 py-0.5 text-[10px] font-bold text-muted">
          x
        </span>

        <div className="flex items-center gap-3 min-w-0 justify-end">
          <span className="truncate text-sm font-semibold">{ticket.awayTeam}</span>
          <TeamShield teamName={ticket.awayTeam} src={ticket.awayCrest} size={28} />
        </div>
      </div>

      {/* Perfil + risco */}
      <div className="flex items-center justify-between gap-2 px-5 pt-3">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PROFILE_COLORS[ticket.profile]}`}>
          {PROFILE_LABELS[ticket.profile]}
        </span>
        <span className={`text-xs font-medium ${RISK_COLORS[ticket.riskLabel]}`}>
          Risco {ticket.riskLabel}
        </span>
      </div>

      {/* Barra de confiança */}
      <div className="px-5 pt-2">
        <div className="flex items-center justify-between text-[10px] text-muted mb-1">
          <span>Confiança</span>
          <span className="font-mono font-semibold">{ticket.confidence}%</span>
        </div>
        {confidenceBar(ticket.confidence)}
      </div>

      {/* Picks */}
      <div className="mt-3 space-y-1.5 px-5">
        <p className="text-[10px] uppercase tracking-widest text-muted">Picks BOB</p>
        {ticket.picks.map((pick, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-surface-strong px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted">{pick.market}</p>
              <p className="mt-0.5 truncate text-sm font-semibold">{pick.label}</p>
            </div>
            <span className="shrink-0 rounded-lg bg-accent/10 px-2.5 py-1 font-mono text-sm font-bold text-accent-strong">
              {pick.odd.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      {/* Odd combinada */}
      <div className="mx-5 mt-3 flex items-center justify-between rounded-[14px] border border-accent/20 bg-accent/5 px-4 py-2.5">
        <span className="text-xs text-muted">Odd combinada</span>
        <span className="font-mono text-lg font-bold text-accent-strong">
          {ticket.combinedOdd.toFixed(2)}×
        </span>
      </div>

      {/* Narrativa do BOB */}
      {ticket.bobNarrative && (
        <p className="px-5 pt-3 text-xs leading-6 text-muted">
          {ticket.bobNarrative}
        </p>
      )}

      {/* Alertas */}
      {ticket.alerts.length > 0 && (
        <div className="mx-5 mt-3 space-y-1">
          {ticket.alerts.map((alert, i) => (
            <p key={i} className="text-[10px] text-signal">⚠ {alert}</p>
          ))}
        </div>
      )}

      {/* Botão copiar */}
      <div className="px-5 pb-5 pt-4">
        <button
          onClick={() => void handleCopy()}
          className={[
            "w-full rounded-xl py-2.5 text-sm font-semibold transition-all",
            copied
              ? "bg-accent text-white"
              : "border border-border bg-surface-strong text-muted hover:border-accent/40 hover:text-foreground",
          ].join(" ")}
        >
          {copied ? "✓ Copiado!" : "Copiar ticket"}
        </button>
      </div>
    </article>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ApostasClient({ tickets, roundLabel, isDemo }: Props) {
  const [filter, setFilter] = useState<FilterProfile>("TODOS");

  const filtered =
    filter === "TODOS" ? tickets : tickets.filter((t) => t.profile === filter);

  const countByProfile = (p: CriarApostaProfile) =>
    tickets.filter((t) => t.profile === p).length;

  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">

      {/* Hero */}
      <section>
        <p className="kicker text-xs text-muted">{roundLabel} · Criar Apostas</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight">
          O BOB já fez o trabalho.<br />
          <span className="text-accent">Escolha, copie e aposte.</span>
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-7 text-muted">
          Uma aposta por jogo, montada com os dados da rodada. Você não monta nada —
          o algoritmo analisou o contexto, as odds e a narrativa de cada partida.
          Leia a análise, confie no processo.
        </p>
      </section>

      {/* Banner demo */}
      {isDemo && (
        <div className="rounded-[20px] border border-signal/25 bg-signal/8 px-5 py-4">
          <p className="text-sm font-semibold text-signal">Modo demonstrativo</p>
          <p className="mt-1 text-sm text-muted">
            Os tickets abaixo são gerados com dados de exemplo. Quando a rodada real for carregada, os picks refletirão os jogos e odds reais do Brasileirão.
          </p>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {(["TODOS", "ALAVANCAGEM", "MODERADA", "AGRESSIVA"] as FilterProfile[]).map((f) => {
          const active = filter === f;
          const count  = f === "TODOS" ? tickets.length : countByProfile(f as CriarApostaProfile);
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={[
                "rounded-full px-4 py-1.5 text-xs font-medium transition-all",
                active
                  ? "bg-accent text-white shadow-sm"
                  : "border border-border bg-surface-strong text-muted hover:border-accent/40 hover:text-foreground",
              ].join(" ")}
            >
              {f === "TODOS" ? "Todos" : PROFILE_LABELS[f as CriarApostaProfile]}
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? "bg-white/20" : "bg-border/60"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Legenda dos perfis */}
      <div className="grid gap-3 sm:grid-cols-3">
        {(["ALAVANCAGEM", "MODERADA", "AGRESSIVA"] as CriarApostaProfile[]).map((p) => {
          const descriptions: Record<CriarApostaProfile, string> = {
            ALAVANCAGEM: "Odds curtas (1.10–2.00). Alta probabilidade de acerto. Base do bilhete.",
            MODERADA:    "Odds médias (2.00–5.00). Equilíbrio entre proteção e retorno.",
            AGRESSIVA:   "Odds longas (5.00+). Retorno alto, risco elevado. Posição menor.",
          };
          return (
            <div key={p} className="rounded-[18px] border border-border/70 bg-surface-strong px-4 py-3">
              <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PROFILE_COLORS[p]}`}>
                {PROFILE_LABELS[p]}
              </span>
              <p className="mt-2 text-xs leading-5 text-muted">{descriptions[p]}</p>
            </div>
          );
        })}
      </div>

      {/* Grid de tickets */}
      {filtered.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((ticket) => (
            <TicketCard key={ticket.matchId} ticket={ticket} />
          ))}
        </div>
      ) : (
        <div className="panel rounded-[24px] p-6 text-center">
          <p className="text-sm font-semibold">Nenhum ticket neste filtro.</p>
          <p className="mt-2 text-sm text-muted">
            Tente outro perfil ou aguarde a rodada ser carregada com dados reais.
          </p>
          <button
            onClick={() => setFilter("TODOS")}
            className="mt-4 rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted hover:text-foreground transition"
          >
            Ver todos os tickets
          </button>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-center text-[10px] text-muted/50">
        BOB não garante resultados. Apostas envolvem risco de capital — jogue com responsabilidade.
        Lei 14.790/2023.
      </p>
    </div>
  );
}
