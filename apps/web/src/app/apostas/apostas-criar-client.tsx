"use client";

import { useMemo, useState } from "react";
import { AccordionItem, Accordion } from "@/components/ui/accordion";
import { Modal } from "@/components/ui/modal";
import { TeamShield } from "@/components/team-shield";

export type CriarApostaPickView = {
  market: string;
  label: string;
  odd: number;
  probability: number;
};

export type CriarApostaView = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeBadge: string | null;
  awayBadge: string | null;
  competition: string;
  profile: "ALAVANCAGEM" | "MODERADA" | "AGRESSIVA";
  picks: CriarApostaPickView[];
  combinedOdd: number;
  combinedProbability: number;
  confidence: number;
  bobNarrative: string;
  riskLabel: "Baixo" | "Médio" | "Alto";
  alerts: string[];
};

type Props = {
  apostas: CriarApostaView[];
  roundLabel: string;
};

const PROFILE_META: Record<CriarApostaView["profile"], { label: string; emoji: string; description: string; color: string }> = {
  ALAVANCAGEM: {
    label: "Alavancagem",
    emoji: "🛡️",
    description: "Odd 1.28–2.00 · risco baixo · base do método",
    color: "text-[var(--accent-strong)]",
  },
  MODERADA: {
    label: "Moderada",
    emoji: "⚖️",
    description: "Odd 2.00–5.00 · risco controlado · valor balanceado",
    color: "text-[var(--signal)]",
  },
  AGRESSIVA: {
    label: "Agressiva",
    emoji: "🎯",
    description: "Odd 5.00+ · alta convicção · narrativa forte",
    color: "text-[var(--danger)]",
  },
};

function RiskBadge({ level }: { level: CriarApostaView["riskLabel"] }) {
  const map = {
    "Baixo": "bob-risk-low",
    "Médio": "bob-risk-medium",
    "Alto": "bob-risk-high",
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${map[level]}`}>
      Risco {level}
    </span>
  );
}

function ApostaCard({ aposta, onCopy, copied, onOpenDetail }: {
  aposta: CriarApostaView;
  onCopy: (a: CriarApostaView) => void;
  copied: boolean;
  onOpenDetail: (a: CriarApostaView) => void;
}) {
  const profile = PROFILE_META[aposta.profile];

  return (
    <div className="bob-card overflow-hidden">
      {/* Header */}
      <div className="bob-section-header">
        <div className="flex items-center gap-2 min-w-0">
          <TeamShield teamName={aposta.homeTeam} src={aposta.homeBadge} size={20} />
          <span className="font-semibold text-sm truncate">{aposta.homeTeam}</span>
          <span className="text-[10px] text-muted">×</span>
          <span className="font-semibold text-sm truncate">{aposta.awayTeam}</span>
          <TeamShield teamName={aposta.awayTeam} src={aposta.awayBadge} size={20} />
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <RiskBadge level={aposta.riskLabel} />
        </div>
      </div>

      {/* Picks */}
      <div className="divide-y divide-[var(--border)]">
        {aposta.picks.map((p, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-[10px] font-bold text-muted uppercase w-9">{p.market}</span>
            <span className="flex-1 text-xs font-medium">{p.label}</span>
            <span className="bob-odd bob-odd-active">{p.odd.toFixed(2)}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs">
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider">Combinada</p>
              <p className="font-mono text-base font-bold text-[var(--signal)]">{aposta.combinedOdd.toFixed(2)}×</p>
            </div>
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider">Confiança</p>
              <p className="font-bold text-foreground">{aposta.confidence}/100</p>
            </div>
            <div className="hidden sm:block">
              <p className="text-[10px] text-muted uppercase tracking-wider">Perfil</p>
              <p className={`text-xs font-bold ${profile.color}`}>{profile.emoji} {profile.label}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onOpenDetail(aposta)} className="bob-btn-ghost text-xs">
              Análise
            </button>
            <button type="button" onClick={() => onCopy(aposta)} className="bob-btn-primary text-xs">
              {copied ? "✓ Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ApostasCriarClient({ apostas, roundLabel }: Props) {
  const [filter, setFilter] = useState<"all" | "ALAVANCAGEM" | "MODERADA" | "AGRESSIVA">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [detailAposta, setDetailAposta] = useState<CriarApostaView | null>(null);

  const filtered = useMemo(() => {
    if (filter === "all") return apostas;
    return apostas.filter((a) => a.profile === filter);
  }, [apostas, filter]);

  const counts = useMemo(() => ({
    all: apostas.length,
    ALAVANCAGEM: apostas.filter((a) => a.profile === "ALAVANCAGEM").length,
    MODERADA: apostas.filter((a) => a.profile === "MODERADA").length,
    AGRESSIVA: apostas.filter((a) => a.profile === "AGRESSIVA").length,
  }), [apostas]);

  const copyAposta = (a: CriarApostaView) => {
    const lines = [
      `${a.homeTeam} × ${a.awayTeam}`,
      `Criar Aposta — ${PROFILE_META[a.profile].label}`,
      `Odd combinada: ${a.combinedOdd.toFixed(2)}×`,
      "",
      ...a.picks.map((p, i) => `${i + 1}. ${p.label} (${p.odd.toFixed(2)})`),
    ];
    navigator.clipboard.writeText(lines.join("\n"));
    setCopiedId(a.matchId);
    setTimeout(() => setCopiedId(null), 2200);
  };

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="bob-hero">
        <div className="relative z-10">
          <span className="kicker text-white/70">Criar Apostas</span>
          <h1 className="mt-2 text-xl font-bold text-white sm:text-2xl">{roundLabel}</h1>
          <p className="mt-1 text-sm text-white/85">
            {apostas.length} jogos · uma aposta pronta por partida · entregue pelo BOB com base em dados.
          </p>
          <p className="mt-2 text-xs text-white/70">
            ⚡ Alavancagem (1.28–2.00) · ⚖️ Moderada (2.00–5.00) · 🎯 Agressiva (5.00+)
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bob-card overflow-x-auto">
        <div className="flex border-b border-[var(--border)]">
          {[
            { id: "all", label: "Todas", count: counts.all },
            { id: "ALAVANCAGEM", label: "Alavancagem", count: counts.ALAVANCAGEM },
            { id: "MODERADA", label: "Moderada", count: counts.MODERADA },
            { id: "AGRESSIVA", label: "Agressiva", count: counts.AGRESSIVA },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id as typeof filter)}
              className={`bob-tab gap-1.5 ${filter === tab.id ? "bob-tab-active" : ""}`}
            >
              {tab.label}
              <span className="rounded bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[10px] font-bold">{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="bob-card p-6 text-center">
          <p className="text-sm text-muted">Nenhuma aposta neste perfil para a rodada atual.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((a) => (
            <ApostaCard
              key={a.matchId}
              aposta={a}
              onCopy={copyAposta}
              copied={copiedId === a.matchId}
              onOpenDetail={setDetailAposta}
            />
          ))}
        </div>
      )}

      {/* Modal de detalhes */}
      <Modal
        open={Boolean(detailAposta)}
        onClose={() => setDetailAposta(null)}
        title={detailAposta ? `${detailAposta.homeTeam} × ${detailAposta.awayTeam}` : ""}
        subtitle={detailAposta ? `Análise BOB · ${PROFILE_META[detailAposta.profile].label}` : ""}
        size="lg"
      >
        {detailAposta && (
          <div className="space-y-4">
            <div className="rounded-lg bg-[var(--surface)] p-3">
              <p className="kicker text-xs">Narrativa do BOB</p>
              <p className="mt-1.5 text-sm leading-6 text-foreground">{detailAposta.bobNarrative}</p>
            </div>

            <div>
              <p className="kicker text-xs mb-2">Picks da aposta</p>
              <div className="space-y-1.5">
                {detailAposta.picks.map((p, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-bold text-muted uppercase mr-2">{p.market}</span>
                      <span className="text-sm font-medium">{p.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-muted">prob {(p.probability * 100).toFixed(0)}%</span>
                      <span className="bob-odd bob-odd-active">{p.odd.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between rounded-lg bg-[var(--accent-soft)] px-3 py-2">
                <span className="text-sm font-bold text-[var(--accent-strong)]">Odd combinada</span>
                <span className="font-mono text-lg font-bold text-[var(--accent-strong)]">{detailAposta.combinedOdd.toFixed(2)}×</span>
              </div>
            </div>

            {detailAposta.alerts.length > 0 && (
              <div className="rounded-lg bg-[var(--signal)]/10 border border-[var(--signal)]/30 p-3">
                <p className="kicker text-xs text-[var(--signal)]">Alertas</p>
                <ul className="mt-1.5 space-y-1 text-sm text-foreground">
                  {detailAposta.alerts.map((a, i) => (
                    <li key={i}>⚠ {a}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setDetailAposta(null)} className="bob-btn-ghost">Fechar</button>
              <button type="button" onClick={() => { copyAposta(detailAposta); }} className="bob-btn-primary">
                {copiedId === detailAposta.matchId ? "✓ Copiado" : "Copiar bilhete"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
