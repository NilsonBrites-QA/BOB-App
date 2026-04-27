"use client";

import { useState, useTransition } from "react";
import { approveAndDeliverRound, regenerateRound } from "./round-actions";

type RoundStateRow = {
  number: number;
  season: number;
  status: string; // DRAFT | READY | DELIVERED | SUPERSEDED | CLOSED
  version: number;
  frozenAt: string | null;
};

type Props = {
  detectedRound: number | null;
  detectedSeason: number;
  recent: RoundStateRow[];
};

function statusBadge(status: string) {
  switch (status) {
    case "DELIVERED":
      return { cls: "bg-accent/15 text-accent border-accent/20", label: "✓ Congelada" };
    case "DRAFT":
      return { cls: "bg-yellow-100 text-yellow-700 border-yellow-300", label: "Rascunho" };
    case "READY":
      return { cls: "bg-blue-100 text-blue-700 border-blue-300", label: "Pronta" };
    case "SUPERSEDED":
      return { cls: "bg-muted/15 text-muted border-border", label: "Substituída" };
    case "CLOSED":
      return { cls: "bg-foreground/10 text-foreground border-border", label: "Encerrada" };
    default:
      return { cls: "bg-muted/10 text-muted border-border", label: status };
  }
}

export function RoundControlPanel({ detectedRound, detectedSeason, recent }: Props) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [overrideRound, setOverrideRound] = useState<string>("");

  function handleDeliver() {
    setFeedback(null);
    startTransition(async () => {
      const r = overrideRound.trim() ? parseInt(overrideRound, 10) : detectedRound;
      const res = await approveAndDeliverRound(detectedSeason, r ?? null).catch((e) => ({
        ok: false as const,
        message: e instanceof Error ? e.message : "Erro inesperado.",
      }));
      setFeedback(res);
    });
  }

  function handleRegenerate(roundNum: number) {
    const reason = window.prompt(
      `⚠ Regenerar variações da R${roundNum}?\n\n` +
        "A versão atual ficará marcada como SUBSTITUÍDA (preservada no histórico) " +
        "e uma nova versão será gerada em DRAFT. Você precisará 'Aprovar e entregar' " +
        "novamente para liberar pros usuários.\n\n" +
        "Motivo (opcional, fica no histórico):",
    );
    if (reason === null) return; // cancelado

    setFeedback(null);
    startTransition(async () => {
      const res = await regenerateRound(detectedSeason, roundNum, reason || undefined).catch((e) => ({
        ok: false as const,
        message: e instanceof Error ? e.message : "Erro inesperado.",
      }));
      setFeedback(res);
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-surface-strong p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Próxima rodada detectada
        </p>
        <p className="mt-1 text-2xl font-bold">
          R{detectedRound ?? "?"} <span className="text-sm font-normal text-muted">· {detectedSeason}</span>
        </p>
        <p className="mt-1 text-xs text-muted">
          Detectada via menor matchday com jogos não-encerrados (drift-aware).
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={1}
            max={38}
            value={overrideRound}
            onChange={(e) => setOverrideRound(e.target.value)}
            placeholder={detectedRound ? `${detectedRound}` : "ex: 14"}
            className="w-24 rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={pending}
            onClick={handleDeliver}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Processando…" : "Aprovar e entregar"}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          Gera (se necessário) e <strong>congela</strong> a rodada. Após isto, /variacoes vai mostrar
          sempre o mesmo conteúdo. Idempotente: se já está DELIVERED, não altera.
        </p>
      </div>

      {feedback && (
        <div
          className={[
            "rounded-xl border px-4 py-3 text-sm",
            feedback.ok
              ? "border-accent/30 bg-accent/8 text-foreground"
              : "border-red-300 bg-red-50 text-red-800",
          ].join(" ")}
        >
          {feedback.message}
        </div>
      )}

      {recent.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface-strong/40 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Rodadas no banco (últimas {recent.length})
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-2 py-2">R</th>
                  <th className="px-2 py-2">Versão</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Congelada</th>
                  <th className="px-2 py-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recent.map((r, idx) => {
                  const badge = statusBadge(r.status);
                  return (
                    <tr key={`${r.number}-${r.version}-${idx}`} className="hover:bg-accent/5">
                      <td className="px-2 py-2 font-semibold">R{r.number}</td>
                      <td className="px-2 py-2 font-mono text-muted">v{r.version}</td>
                      <td className="px-2 py-2">
                        <span className={["rounded-full border px-2 py-0.5 text-[10px] font-semibold", badge.cls].join(" ")}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-muted">
                        {r.frozenAt
                          ? new Date(r.frozenAt).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "America/Sao_Paulo",
                            })
                          : "—"}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {r.status === "DELIVERED" ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => handleRegenerate(r.number)}
                            className="rounded-lg bg-yellow-100 px-3 py-1 text-[10px] font-semibold text-yellow-700 transition hover:bg-yellow-200 disabled:opacity-50"
                          >
                            Regenerar
                          </button>
                        ) : (
                          <span className="text-[10px] text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
