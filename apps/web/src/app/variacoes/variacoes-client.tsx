"use client";

import { useState } from "react";
import Image from "next/image";
import { AccordionItem, Accordion } from "@/components/ui/accordion";
import { Modal } from "@/components/ui/modal";

// ─── Types compartilhados com o servidor ────────────────────────────────────

export type VariationLeg = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  pickOutcome: "Home" | "Draw" | "Away";
  pickLabel: string;
  pickOdd: number;
  fairOdd: number;
  cleanProb: number;
  isAnchor: boolean;
  homeBadge: string | null;
  awayBadge: string | null;
};

export type VariationView = {
  id: "V1" | "V2" | "V3" | "V4" | "V5";
  title: string;
  intention: string;
  combinedOdd: number;
  probabilityMass: number;
  legCount: number;
  anchorPrimaryCount: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  legs: VariationLeg[];
  shortJustification: string;
  detailedJustification: string;
  alerts: string[];
};

export type AnchorView = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  pick: "Home" | "Draw" | "Away";
  pickLabel: string;
  type: "STRONG" | "ACCEPTABLE" | "CONDITIONAL";
  confidence: number;
  reason: string;
  risks: string[];
  homeBadge: string | null;
  awayBadge: string | null;
};

export type AuditView = {
  status: "APPROVED" | "APPROVED_WITH_ALERTS";
  passed: boolean;
  alerts: string[];
  warnings: string[];
  checks: { label: string; ok: boolean }[];
};

export type RoundView = {
  label: string;
  source: "api" | "demo";
  firstMatch: string;
  cutoff: string;
  totalMatches: number;
  difficulty: "easy" | "balanced" | "hard";
  difficultyLabel: string;
  bobMessage: string;
  aiProvider?: "claude" | "gpt" | "gemini" | "heuristic" | "none";
};

type Props = {
  round: RoundView;
  anchors: AnchorView[];
  variations: VariationView[];
  audit: AuditView;
};

// ─── UI Helpers ──────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: VariationView["riskLevel"] }) {
  const map = {
    LOW: { class: "bob-risk-low", label: "Risco baixo" },
    MEDIUM: { class: "bob-risk-medium", label: "Risco médio" },
    HIGH: { class: "bob-risk-high", label: "Risco alto" },
    EXTREME: { class: "bob-risk-extreme", label: "Risco extremo" },
  };
  const c = map[level];
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${c.class}`}>
      {c.label}
    </span>
  );
}

function AnchorTypeBadge({ type }: { type: AnchorView["type"] }) {
  const map = {
    STRONG: { class: "bg-[var(--accent-soft)] text-[var(--accent-strong)]", label: "Forte" },
    ACCEPTABLE: { class: "bob-risk-medium", label: "Aceitável" },
    CONDITIONAL: { class: "bob-risk-high", label: "Condicional" },
  };
  const c = map[type];
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${c.class}`}>
      {c.label}
    </span>
  );
}

function TeamCrest({ url, name, size = 24 }: { url: string | null; name: string; size?: number }) {
  if (url) {
    return (
      <Image
        src={url}
        alt={name}
        width={size}
        height={size}
        className="rounded-sm object-contain"
        unoptimized
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-sm bg-[var(--surface-elevated)] text-[10px] font-bold text-muted"
      style={{ width: size, height: size }}
    >
      {name.substring(0, 2).toUpperCase()}
    </div>
  );
}

// ─── Página principal ───────────────────────────────────────────────────────

export function VariacoesClient({ round, anchors, variations, audit }: Props) {
  const [activeId, setActiveId] = useState<VariationView["id"]>("V3"); // V3 = leitura principal
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [copiedVariation, setCopiedVariation] = useState<string | null>(null);

  const active = variations.find((v) => v.id === activeId) ?? variations[0];

  const copyVariation = (v: VariationView) => {
    const lines = [
      `${v.id} — ${v.title}`,
      `Odd combinada: ${v.combinedOdd.toFixed(2)}× | ${v.legCount} jogos`,
      "",
      ...v.legs.map((l, i) => `${i + 1}. ${l.homeTeam} x ${l.awayTeam}: ${l.pickLabel} (${l.pickOdd.toFixed(2)})`),
      "",
      v.shortJustification,
    ];
    navigator.clipboard.writeText(lines.join("\n"));
    setCopiedVariation(v.id);
    setTimeout(() => setCopiedVariation(null), 2200);
  };

  const allMatches = active
    ? Array.from(new Map(variations.flatMap((v) => v.legs).map((l) => [l.matchId, l])).values())
    : [];

  return (
    <div className="space-y-4">
      {/* Hero — info da rodada */}
      <div className="bob-hero">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="kicker text-white/70">Rodada</span>
            {audit.status === "APPROVED" ? (
              <span className="inline-flex items-center rounded-md bg-white/15 px-2 py-0.5 text-[10px] font-bold text-white">
                ✓ APROVADO
              </span>
            ) : (
              <span className="inline-flex items-center rounded-md bg-[var(--signal)]/30 px-2 py-0.5 text-[10px] font-bold text-white">
                ⚠ APROVADO COM ALERTAS
              </span>
            )}
            <span className="inline-flex items-center rounded-md bg-white/15 px-2 py-0.5 text-[10px] font-bold text-white">
              {round.source === "api" ? "DADOS AO VIVO" : "DEMO"}
            </span>
          </div>
          <h1 className="mt-2 text-xl font-bold text-white sm:text-2xl">{round.label}</h1>
          <p className="mt-1 text-sm text-white/85">
            {anchors.length} âncoras · {variations.length} variações · primeiro jogo {round.firstMatch}
          </p>
          {round.aiProvider && (
            <p className="mt-1.5 text-[11px] text-white/70">
              Análise por:{" "}
              <span className="font-mono font-semibold uppercase tracking-wider">
                {round.aiProvider === "claude" && "🧠 Claude Sonnet"}
                {round.aiProvider === "gpt" && "🧠 GPT-4o"}
                {round.aiProvider === "gemini" && "🧠 Gemini Flash"}
                {round.aiProvider === "heuristic" && "⚡ Heurística determinística"}
                {round.aiProvider === "none" && "⚠️ Sem análise"}
              </span>
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/80">
            <span>📊 {round.difficultyLabel}</span>
            <span className="text-white/40">·</span>
            <span>🕐 Janela final: {round.cutoff}</span>
          </div>
        </div>
      </div>

      {/* Tabs V1-V5 */}
      <div className="bob-card overflow-hidden">
        <div className="flex overflow-x-auto border-b border-[var(--border)]">
          {variations.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setActiveId(v.id)}
              className={`bob-tab flex-1 min-w-[100px] flex-col gap-0.5 ${activeId === v.id ? "bob-tab-active" : ""}`}
            >
              <span className="font-bold">{v.id}</span>
              <span className="text-[10px] text-muted normal-case tracking-normal font-normal">{v.title}</span>
              <span className="text-[11px] font-bold text-[var(--accent)]">
                {v.combinedOdd.toFixed(0)}×
              </span>
            </button>
          ))}
        </div>

        {active && (
          <div className="p-4 space-y-4">
            {/* Header da variação ativa */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-foreground">{active.id} · {active.title}</h2>
                  <RiskBadge level={active.riskLevel} />
                </div>
                <p className="mt-1 text-sm text-muted">{active.intention}</p>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-[10px] text-muted uppercase tracking-wider">Odd combinada</p>
                  <p className="font-mono text-2xl font-bold text-[var(--signal)]">{active.combinedOdd.toFixed(2)}×</p>
                </div>
                <button
                  type="button"
                  onClick={() => copyVariation(active)}
                  className="bob-btn-primary"
                >
                  {copiedVariation === active.id ? "✓ Copiado" : "Copiar bilhete"}
                </button>
              </div>
            </div>

            {/* Stats da variação */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg bg-[var(--surface-strong)] px-3 py-2">
                <p className="text-[10px] text-muted uppercase tracking-wider">Jogos</p>
                <p className="text-base font-bold">{active.legCount}</p>
              </div>
              <div className="rounded-lg bg-[var(--surface-strong)] px-3 py-2">
                <p className="text-[10px] text-muted uppercase tracking-wider">Âncoras primárias</p>
                <p className="text-base font-bold">{active.anchorPrimaryCount}/{anchors.length}</p>
              </div>
              <div className="rounded-lg bg-[var(--surface-strong)] px-3 py-2">
                <p className="text-[10px] text-muted uppercase tracking-wider">Prob. acerto total</p>
                <p className="text-base font-bold">{(active.probabilityMass * 100).toFixed(2)}%</p>
              </div>
              <div className="rounded-lg bg-[var(--surface-strong)] px-3 py-2">
                <p className="text-[10px] text-muted uppercase tracking-wider">Status</p>
                <p className="text-base font-bold text-[var(--accent-strong)]">Pronta</p>
              </div>
            </div>

            {/* Lista de pernas */}
            <div className="bob-card-elevated divide-y divide-[var(--border)]">
              {active.legs.map((leg, i) => (
                <div key={leg.matchId} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="text-[10px] font-mono text-muted w-5">{i + 1}</span>

                  <div className="flex flex-1 items-center gap-2 min-w-0">
                    <TeamCrest url={leg.homeBadge} name={leg.homeTeam} />
                    <span className="text-xs font-medium truncate">{leg.homeTeam}</span>
                    <span className="text-[10px] text-muted">×</span>
                    <span className="text-xs font-medium truncate">{leg.awayTeam}</span>
                    <TeamCrest url={leg.awayBadge} name={leg.awayTeam} />
                  </div>

                  {leg.isAnchor && (
                    <span className="hidden sm:inline-flex items-center rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--accent-strong)]">
                      Âncora
                    </span>
                  )}

                  <span className="text-xs font-semibold text-[var(--accent-strong)] min-w-[60px] text-right">
                    {leg.pickLabel}
                  </span>
                  <span className="bob-odd bob-odd-active">{leg.pickOdd.toFixed(2)}</span>
                </div>
              ))}
            </div>

            {/* Justificativa em accordion */}
            <Accordion>
              <AccordionItem
                title="Justificativa do BOB"
                subtitle={active.shortJustification}
                defaultOpen={false}
              >
                <p className="text-sm leading-6 whitespace-pre-line text-muted">{active.detailedJustification}</p>
              </AccordionItem>

              {active.alerts.length > 0 && (
                <AccordionItem
                  title={`Alertas (${active.alerts.length})`}
                  subtitle="Riscos identificados pelo BOB"
                  badge={<span className="ml-2 rounded bg-[var(--signal)]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--signal)]">Atenção</span>}
                >
                  <ul className="space-y-1.5 text-sm text-muted">
                    {active.alerts.map((a, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-[var(--signal)]">⚠</span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </AccordionItem>
              )}
            </Accordion>

            {/* Botão Ver Matriz */}
            <div className="flex justify-center pt-1">
              <button type="button" onClick={() => setMatrixOpen(true)} className="bob-btn-ghost text-sm">
                📋 Ver matriz completa V1–V5
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Âncoras — sanfonas individuais (RN: cada âncora abre sua própria explicação) */}
      <div className="bob-card overflow-hidden">
        <div className="bob-section-header">
          <h2 className="font-semibold text-sm">Âncoras da rodada ({anchors.length})</h2>
          <span className="text-[10px] text-muted uppercase tracking-wider">Toque para ver detalhes</span>
        </div>
        <Accordion>
          {anchors.map((a) => (
            <AccordionItem
              key={a.matchId}
              title={
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <TeamCrest url={a.homeBadge} name={a.homeTeam} size={18} />
                  <span className="text-sm font-medium truncate">{a.homeTeam}</span>
                  <span className="text-[10px] text-muted">×</span>
                  <span className="text-sm font-medium truncate">{a.awayTeam}</span>
                  <TeamCrest url={a.awayBadge} name={a.awayTeam} size={18} />
                </div>
              }
              subtitle={`${a.pickLabel} · confiança ${a.confidence}/100`}
              badge={<AnchorTypeBadge type={a.type} />}
              defaultOpen={false}
            >
              <div className="space-y-3">
                <div>
                  <p className="kicker text-xs mb-1">Leitura do BOB</p>
                  <p className="text-sm leading-6 text-foreground">{a.reason}</p>
                </div>
                {a.risks.length > 0 && (
                  <div>
                    <p className="kicker text-xs mb-1 text-[var(--signal)]">Riscos identificados</p>
                    <ul className="space-y-1 text-sm text-muted">
                      {a.risks.map((r, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-[var(--signal)]">⚠</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      {/* Auditoria */}
      <Accordion>
        <AccordionItem
          title="Auditoria de completude"
          subtitle={audit.passed ? "Todas as validações passaram" : `${audit.alerts.length} alerta(s)`}
          badge={
            audit.status === "APPROVED" ? (
              <span className="ml-2 rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--accent-strong)]">✓ APROVADO</span>
            ) : (
              <span className="ml-2 rounded bg-[var(--signal)]/15 px-1.5 py-0.5 text-[9px] font-bold text-[var(--signal)]">⚠ COM ALERTAS</span>
            )
          }
        >
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {audit.checks.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={c.ok ? "text-[var(--accent-strong)]" : "text-[var(--danger)]"}>
                  {c.ok ? "✓" : "✗"}
                </span>
                <span className={c.ok ? "text-foreground" : "text-[var(--danger)]"}>{c.label}</span>
              </div>
            ))}
          </div>
          {audit.alerts.length > 0 && (
            <div className="mt-3 border-t border-[var(--border)] pt-3">
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Alertas</p>
              <ul className="space-y-1 text-xs text-muted">
                {audit.alerts.map((a, i) => <li key={i}>⚠ {a}</li>)}
              </ul>
            </div>
          )}
        </AccordionItem>
      </Accordion>

      {/* Modal Matriz V1-V5 */}
      <Modal
        open={matrixOpen}
        onClose={() => setMatrixOpen(false)}
        title="Matriz V1–V5 × Jogos"
        subtitle="Visão consolidada de picks por jogo em todas as variações"
        size="xl"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-strong)]">
                <th className="px-2 py-2 text-left font-semibold">Jogo</th>
                {variations.map((v) => (
                  <th key={v.id} className="px-2 py-2 text-center font-semibold">
                    {v.id}<br/>
                    <span className="text-[10px] font-normal text-muted">{v.combinedOdd.toFixed(0)}×</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allMatches.map((match) => (
                <tr key={match.matchId} className="border-b border-[var(--border)] hover:bg-[var(--surface-elevated)]">
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      <TeamCrest url={match.homeBadge} name={match.homeTeam} size={16} />
                      <span className="font-medium">{match.homeTeam}</span>
                      <span className="text-muted">×</span>
                      <span className="font-medium">{match.awayTeam}</span>
                      <TeamCrest url={match.awayBadge} name={match.awayTeam} size={16} />
                    </div>
                  </td>
                  {variations.map((v) => {
                    const leg = v.legs.find((l) => l.matchId === match.matchId);
                    return (
                      <td key={v.id} className="px-2 py-2 text-center">
                        {leg ? (
                          <span className={`inline-block rounded px-1.5 py-0.5 font-bold ${
                            leg.pickOutcome === "Home" ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" :
                            leg.pickOutcome === "Away" ? "bg-[var(--surface-elevated)] text-foreground" :
                            "bg-[var(--signal)]/20 text-[var(--signal)]"
                          }`}>
                            {leg.pickOutcome === "Home" ? "1" : leg.pickOutcome === "Away" ? "2" : "X"}
                          </span>
                        ) : (
                          <span className="text-muted text-[10px]">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
}
