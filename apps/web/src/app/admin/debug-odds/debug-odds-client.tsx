"use client";

import { useState } from "react";

type Source = {
  status?: number;
  ok?: boolean;
  error?: string;
  bookmaker?: string;
  bookmakerId?: number | string;
  url?: string;
  sample?: unknown;
  totalFixtures?: number | null;
  quotaRemaining?: string | null;
};

type DebugResult = {
  fixtureId: number | null;
  fontes: {
    oddspapi_pinnacle: Source;
    oddspapi_bet365: Source;
    api_football_bet365: Source;
    api_football_all: Source;
  };
  notas: string[];
};

function diagnose(result: DebugResult): { source: string; verdict: string; color: string }[] {
  const out: { source: string; verdict: string; color: string }[] = [];
  const f = result.fontes;

  // OddsPapi Pinnacle
  if (f.oddspapi_pinnacle.ok && (f.oddspapi_pinnacle.totalFixtures ?? 0) > 0) {
    out.push({
      source: "OddsPapi (Pinnacle)",
      verdict: `✅ Retorna ${f.oddspapi_pinnacle.totalFixtures} fixtures. Parser do projeto está QUEBRADO contra esta estrutura — odds nunca chegam.`,
      color: "amber",
    });
  } else {
    out.push({
      source: "OddsPapi (Pinnacle)",
      verdict: `❌ ${f.oddspapi_pinnacle.error || `HTTP ${f.oddspapi_pinnacle.status}`}`,
      color: "red",
    });
  }

  // OddsPapi Bet365
  if (f.oddspapi_bet365.ok && (f.oddspapi_bet365.totalFixtures ?? 0) > 0) {
    out.push({
      source: "OddsPapi (Bet365)",
      verdict: `✅ Bet365 disponível no plano free! ${f.oddspapi_bet365.totalFixtures} fixtures.`,
      color: "emerald",
    });
  } else {
    out.push({
      source: "OddsPapi (Bet365)",
      verdict: `⚠️ Bet365 NÃO disponível no plano free da OddsPapi (esperado).`,
      color: "amber",
    });
  }

  // API-Football Bet365
  const afBet365Sample = f.api_football_bet365.sample as Array<{ bookmakers?: unknown[] }> | undefined;
  const hasAfData = Array.isArray(afBet365Sample) && afBet365Sample[0]?.bookmakers && (afBet365Sample[0].bookmakers as unknown[]).length > 0;
  if (f.api_football_bet365.ok && hasAfData) {
    out.push({
      source: "API-Football (Bet365 id=8)",
      verdict: `✅ FONTE RECOMENDADA. Bet365 nativo. Quota restante: ${f.api_football_bet365.quotaRemaining || "?"}`,
      color: "emerald",
    });
  } else {
    out.push({
      source: "API-Football (Bet365 id=8)",
      verdict: `❌ ${f.api_football_bet365.error || "Sem dados Bet365 para este fixture"}`,
      color: "red",
    });
  }

  // API-Football All
  const afAllSample = f.api_football_all.sample as Array<{ bookmakers?: Array<{ name?: string }> }> | undefined;
  const allBookmakers = Array.isArray(afAllSample) && afAllSample[0]?.bookmakers
    ? (afAllSample[0].bookmakers as Array<{ name?: string }>).map((b) => b.name).filter(Boolean).join(", ")
    : null;
  if (allBookmakers) {
    out.push({
      source: "API-Football (todas as casas)",
      verdict: `Casas disponíveis para este fixture: ${allBookmakers}`,
      color: "blue",
    });
  } else {
    out.push({
      source: "API-Football (todas as casas)",
      verdict: `❌ ${f.api_football_all.error || "Sem dados"}`,
      color: "red",
    });
  }

  return out;
}

const COLOR_CLASSES: Record<string, string> = {
  emerald: "border-emerald-300 bg-emerald-50 text-emerald-900",
  amber: "border-amber-300 bg-amber-50 text-amber-900",
  red: "border-red-300 bg-red-50 text-red-900",
  blue: "border-blue-300 bg-blue-50 text-blue-900",
};

export default function DebugOddsClient() {
  const [fixtureId, setFixtureId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DebugResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runDebug() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const url = fixtureId
        ? `/api/admin/debug/odds?fixtureId=${fixtureId}`
        : `/api/admin/debug/odds`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      const data: DebugResult = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const diagnostic = result ? diagnose(result) : null;

  return (
    <div className="space-y-6">
      {/* Controles */}
      <section className="panel rounded-3xl p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="mb-1.5 block text-xs font-medium text-muted">
              Fixture ID (API-Football) — opcional, usa o último Pick se vazio
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={fixtureId}
              onChange={(e) => setFixtureId(e.target.value)}
              placeholder="ex: 1234567"
              className="w-full rounded-xl border border-border bg-surface-strong px-4 py-3 text-sm outline-none transition focus:border-accent"
            />
          </label>
          <button
            type="button"
            onClick={runDebug}
            disabled={loading}
            className="rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Consultando…" : "Rodar diagnóstico"}
          </button>
        </div>
      </section>

      {error && (
        <section className="panel rounded-3xl border-red-300 bg-red-50 p-6">
          <p className="text-sm font-semibold text-red-900">Erro</p>
          <pre className="mt-2 overflow-auto text-xs text-red-800">{error}</pre>
        </section>
      )}

      {/* Diagnóstico resumido */}
      {diagnostic && (
        <section className="panel rounded-3xl p-6">
          <h2 className="mb-4 text-lg font-bold">Diagnóstico</h2>
          <div className="space-y-2">
            {diagnostic.map((d, i) => (
              <div
                key={i}
                className={`rounded-xl border px-4 py-3 ${COLOR_CLASSES[d.color] || ""}`}
              >
                <p className="text-sm font-semibold">{d.source}</p>
                <p className="mt-1 text-xs">{d.verdict}</p>
              </div>
            ))}
          </div>
          {result?.fixtureId && (
            <p className="mt-4 text-xs text-muted">
              Fixture testado: <strong>{result.fixtureId}</strong>
            </p>
          )}
        </section>
      )}

      {/* JSON cru pra inspeção */}
      {result && (
        <section className="panel rounded-3xl p-6">
          <h2 className="mb-4 text-lg font-bold">Resposta crua (JSON)</h2>
          <p className="mb-3 text-xs text-muted">
            Copie e cole isso no chat para que eu veja exatamente o que cada fonte retorna.
          </p>
          <pre className="max-h-[600px] overflow-auto rounded-xl border border-border bg-surface-strong p-4 text-xs leading-relaxed">
            {JSON.stringify(result, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}
