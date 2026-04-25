"use client";

import { useState, useTransition } from "react";
import { recalcVariationJudgement, deleteVariationJudgement, type RecalcResult } from "./actions";

type JudgementRow = {
  id: string;
  season: number;
  round: number;
  provider: string;
  createdAt: string;
  updatedAt: string;
  payloadSummary: {
    enrichments: number;
    replacementsProposed: number;
    replacementsApproved: number;
  };
};

type Props = {
  llmDisabled: boolean;
  hasClaudeKey: boolean;
  hasGptKey: boolean;
  hasGeminiKey: boolean;
  judgements: JudgementRow[];
  currentSeason: number;
};

const PROVIDER_BADGE: Record<string, { label: string; className: string }> = {
  claude: { label: "🧠 Claude", className: "bg-purple-500/20 text-purple-200 border-purple-500/40" },
  gpt: { label: "🧠 GPT-4o", className: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40" },
  gemini: { label: "🧠 Gemini", className: "bg-blue-500/20 text-blue-200 border-blue-500/40" },
  heuristic: { label: "⚡ Heurística", className: "bg-amber-500/20 text-amber-200 border-amber-500/40" },
  none: { label: "⚠️ Nenhum", className: "bg-red-500/20 text-red-200 border-red-500/40" },
};

function ProviderBadge({ provider }: { provider: string }) {
  const cfg = PROVIDER_BADGE[provider] ?? { label: provider, className: "bg-white/10 text-white/70 border-white/20" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-mono font-bold ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function LlmAdminClient(props: Props) {
  const [season, setSeason] = useState(props.currentSeason);
  const [round, setRound] = useState<string>("");
  const [result, setResult] = useState<RecalcResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRecalc() {
    setResult(null);
    startTransition(async () => {
      const r = await recalcVariationJudgement(
        season,
        round.trim() === "" ? null : parseInt(round, 10),
      );
      setResult(r);
    });
  }

  function handleDelete(s: number, r: number) {
    if (!confirm(`Apagar análise da rodada ${s}/${r}?`)) return;
    startTransition(async () => {
      await deleteVariationJudgement(s, r);
    });
  }

  const llmAvailable = props.hasClaudeKey || props.hasGptKey || props.hasGeminiKey;

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-10 sm:px-6 lg:px-10">
      {/* Status global */}
      <section className="panel rounded-[28px] p-8">
        <p className="kicker text-sm text-muted">Painel admin</p>
        <h1 className="mt-2 text-3xl font-semibold">Análise LLM das Variações</h1>
        <p className="mt-2 text-sm text-muted">
          A análise das variações é pré-computada via cron e lida do banco. Usuários nunca esperam LLM no SSR.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatusCard
            title="Kill switch (BOB_DISABLE_LLM)"
            value={props.llmDisabled ? "BLOQUEADA" : "Permitida"}
            status={props.llmDisabled ? "warning" : "ok"}
            hint={props.llmDisabled ? "Setar para vazio na Vercel para reativar" : "Setar BOB_DISABLE_LLM=1 para desligar"}
          />
          <StatusCard
            title="Anthropic Claude"
            value={props.hasClaudeKey ? "Configurada" : "Sem chave"}
            status={props.hasClaudeKey ? "ok" : "off"}
          />
          <StatusCard
            title="OpenAI GPT-4o"
            value={props.hasGptKey ? "Configurada" : "Sem chave"}
            status={props.hasGptKey ? "ok" : "off"}
          />
          <StatusCard
            title="Google Gemini"
            value={props.hasGeminiKey ? "Configurada" : "Sem chave"}
            status={props.hasGeminiKey ? "ok" : "off"}
          />
        </div>

        {!llmAvailable && !props.llmDisabled && (
          <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            ⚠️ Nenhuma chave LLM configurada. Sistema usará apenas heurística determinística.
          </div>
        )}
      </section>

      {/* Recalcular */}
      <section className="panel rounded-[28px] p-8">
        <h2 className="text-xl font-semibold">Recalcular análise agora</h2>
        <p className="mt-1 text-sm text-muted">
          Dispara LLM cascade para a rodada e persiste no banco. Pode demorar até 60s.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Temporada</label>
            <input
              type="number"
              value={season}
              onChange={(e) => setSeason(parseInt(e.target.value, 10))}
              className="rounded-md border border-white/15 bg-black/20 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Rodada (vazio = atual)</label>
            <input
              type="number"
              value={round}
              onChange={(e) => setRound(e.target.value)}
              placeholder="ex: 12"
              className="rounded-md border border-white/15 bg-black/20 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={handleRecalc}
            disabled={isPending}
            className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-50"
          >
            {isPending ? "Calculando…" : "Recalcular agora"}
          </button>
        </div>

        {result && (
          <div
            className={`mt-4 rounded-lg border p-4 text-sm ${
              result.ok
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                : "border-red-500/40 bg-red-500/10 text-red-100"
            }`}
          >
            {result.ok ? (
              <div className="space-y-1">
                <div className="font-semibold">
                  ✅ Análise da rodada {result.season}/{result.round} concluída em {result.elapsedMs}ms
                </div>
                <div>
                  Provider: <ProviderBadge provider={result.provider ?? "none"} /> · Enrichments: {result.enrichments} ·
                  Substituições: {result.replacementsApproved}/{result.replacementsProposed} aprovadas
                </div>
              </div>
            ) : (
              <div>❌ Erro: {result.error}</div>
            )}
          </div>
        )}
      </section>

      {/* Histórico */}
      <section className="panel rounded-[28px] p-8">
        <h2 className="text-xl font-semibold">Análises persistidas no banco</h2>
        <p className="mt-1 text-sm text-muted">
          Tabela <code className="font-mono text-xs">variation_judgements</code> · até 20 mais recentes
        </p>

        {props.judgements.length === 0 ? (
          <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-muted">
            Nenhuma análise persistida ainda. Use o botão acima ou aguarde o cron.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted">
                <tr className="border-b border-white/10">
                  <th className="py-2 pr-4">Temporada</th>
                  <th className="py-2 pr-4">Rodada</th>
                  <th className="py-2 pr-4">Provider</th>
                  <th className="py-2 pr-4">Variações</th>
                  <th className="py-2 pr-4">Subs (aprovadas/total)</th>
                  <th className="py-2 pr-4">Atualizado</th>
                  <th className="py-2 pr-4">Ação</th>
                </tr>
              </thead>
              <tbody>
                {props.judgements.map((j) => (
                  <tr key={j.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 pr-4">{j.season}</td>
                    <td className="py-2 pr-4 font-mono">{j.round}</td>
                    <td className="py-2 pr-4">
                      <ProviderBadge provider={j.provider} />
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{j.payloadSummary.enrichments}/5</td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {j.payloadSummary.replacementsApproved}/{j.payloadSummary.replacementsProposed}
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted">{formatDate(j.updatedAt)}</td>
                    <td className="py-2 pr-4">
                      <button
                        type="button"
                        onClick={() => handleDelete(j.season, j.round)}
                        disabled={isPending}
                        className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                      >
                        Apagar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Como controlar */}
      <section className="panel rounded-[28px] p-8 text-sm text-muted">
        <h2 className="text-base font-semibold text-white">Como controlar</h2>
        <ul className="mt-3 space-y-2">
          <li>
            <strong className="text-white">Desligar LLM globalmente:</strong> defina{" "}
            <code className="font-mono text-xs">BOB_DISABLE_LLM=1</code> nas env vars da Vercel.
          </li>
          <li>
            <strong className="text-white">Ligar de novo:</strong> remova a variável (ou defina vazia).
          </li>
          <li>
            <strong className="text-white">Forçar recálculo:</strong> botão acima ou{" "}
            <code className="font-mono text-xs">curl https://...../api/cron/judge-variations?token=$CRON_SECRET</code>
          </li>
          <li>
            <strong className="text-white">Cron automático:</strong> roda 3x/dia (09h, 14h, 19h UTC) via Vercel Cron.
          </li>
        </ul>
      </section>
    </div>
  );
}

function StatusCard({
  title,
  value,
  status,
  hint,
}: {
  title: string;
  value: string;
  status: "ok" | "warning" | "off";
  hint?: string;
}) {
  const colors = {
    ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
    warning: "border-amber-500/40 bg-amber-500/10 text-amber-100",
    off: "border-white/15 bg-white/5 text-white/60",
  };
  return (
    <div className={`rounded-lg border p-4 ${colors[status]}`}>
      <p className="text-xs uppercase tracking-wider opacity-80">{title}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
      {hint && <p className="mt-1 text-[11px] opacity-70">{hint}</p>}
    </div>
  );
}
