import Link from "next/link";
import { BOB_TRAITS, BOB_QUANTUM, BOB_VARIATIONS } from "@/lib/bob/personality";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="panel grid-lines overflow-hidden rounded-[28px] p-8 sm:p-10">
        <div className="grid gap-10 lg:grid-cols-[1.35fr_0.95fr]">

          {/* Identidade + CTAs */}
          <div className="flex flex-col justify-between gap-8">
            <div className="space-y-5">
              <p className="kicker text-sm text-muted">BOB · Brasileirão 2026</p>
              <h1 className="max-w-xl text-4xl font-semibold leading-tight text-left sm:text-5xl">
                {BOB_TRAITS.missao}
              </h1>
              <p className="max-w-lg text-base leading-8 text-muted text-left">
                Motor determinístico, memória evolutiva e IAs analíticas em paralelo.
                Cinco variações simultâneas por rodada. Cada decisão com justificativa auditável.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="rounded-full bg-accent px-6 py-3 text-center text-sm font-semibold text-white transition hover:bg-accent-strong"
              >
                Dashboard da rodada
              </Link>
              <Link
                href="/chat"
                className="rounded-full border border-border bg-surface-strong px-6 py-3 text-center text-sm font-semibold transition hover:border-accent hover:text-accent"
              >
                Falar com o BOB
              </Link>
            </div>
          </div>

          {/* Manifesto */}
          <div className="flex flex-col justify-center rounded-3xl bg-accent px-7 py-7 text-white">
            <p className="kicker text-xs text-white/60 text-left">Manifesto</p>
            <blockquote className="mt-4 text-base leading-8 text-white/90 text-left">
              {BOB_QUANTUM.manifesto}
            </blockquote>
            <p className="mt-5 font-mono text-xs text-white/40 text-left">— BOB</p>
          </div>

        </div>
      </section>

      {/* ── Capacidades ───────────────────────────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">

        {/* 01 — Motor: bloco dominante */}
        <article className="panel rounded-3xl p-7">
          <p className="font-mono text-xs text-muted">01</p>
          <h2 className="mt-3 text-2xl font-semibold">Motor determinístico</h2>
          <p className="mt-3 max-w-lg text-sm leading-7 text-muted">
            Quinze fatores ponderados por backtests — forma, mando de campo, H2H,
            gols, ausências, árbitro, calendário, Value Edge e mais.
            Pick só entra se a probabilidade calculada superar o preço de mercado.
            Lógica 100% auditável, sem caixa-preta.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {(
              [
                { label: "Fatores analíticos", value: "15" },
                { label: "Âncoras por rodada", value: "até 4" },
                { label: "Variações geradas", value: "V1–V5" },
              ] as const
            ).map((item) => (
              <div
                key={item.label}
                className="rounded-[18px] border border-border bg-surface-strong px-4 py-3"
              >
                <p className="font-mono text-2xl font-semibold">{item.value}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{item.label}</p>
              </div>
            ))}
          </div>
        </article>

        {/* 02 + 03 — empilhados */}
        <div className="flex flex-col gap-4">
          <article className="panel flex-1 rounded-3xl p-6">
            <p className="font-mono text-xs text-muted">02</p>
            <h2 className="mt-2 text-lg font-semibold">Dual-Mind IA</h2>
            <p className="mt-2 text-sm leading-7 text-muted">
              Claude Sonnet analisa. GPT-4o questiona. O calibrador determinístico
              decide com evidência de rodadas anteriores.
            </p>
          </article>
          <article className="panel flex-1 rounded-3xl p-6">
            <p className="font-mono text-xs text-muted">03</p>
            <h2 className="mt-2 text-lg font-semibold">Autonomia total</h2>
            <p className="mt-2 text-sm leading-7 text-muted">
              Crons T&#8209;48h, T&#8209;1h e pós-rodada. Pipeline completo sem intervenção
              humana — da coleta ao fechamento da rodada.
            </p>
          </article>
        </div>

      </section>

      {/* ── Variações ─────────────────────────────────────────────────── */}
      <section className="panel rounded-3xl p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <p className="kicker text-xs text-muted text-left">Método BOB · Cinco variações por rodada</p>
          <p className="max-w-lg text-xs text-muted text-left sm:text-right">{BOB_QUANTUM.superposicao}</p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-5">
          {(Object.entries(BOB_VARIATIONS) as [string, { nome: string; postura: string; descricao: string }][]).map(
            ([code, v]) => (
              <div
                key={code}
                className="rounded-[20px] border border-border bg-surface-strong px-4 py-4"
              >
                <p className="font-mono text-xs text-muted">{code}</p>
                <p className="mt-1 text-sm font-semibold">{v.nome}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{v.postura}</p>
              </div>
            )
          )}
        </div>
      </section>

    </div>
  );
}
