import Link from "next/link";
import { SectionCard } from "@/components/section-card";
import { currentRoundSnapshot, dailyManifesto, integrations, memoryLayers } from "@/lib/bob/mock-data";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col gap-10 px-4 py-10 sm:px-6 lg:px-10">
      <section className="panel grid-lines overflow-hidden rounded-[28px] p-8 sm:p-10">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_0.9fr]">
          <div className="space-y-6">
            <p className="kicker text-sm text-muted">Início da implementação</p>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
                BOB começou a ganhar forma como produto: análise da rodada,
                cérebro estratégico e operação com memória persistente.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted">
                O primeiro incremento já organiza o app ao redor do método do
                Camillo: 5 variações fixas, 4 âncoras por rodada, cutoff antes do
                primeiro jogo, painel administrativo e calculadora de
                investimento x retorno.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <SectionCard title="Rodada atual" value={currentRoundSnapshot.label} description={currentRoundSnapshot.cutoffLabel} />
              <SectionCard title="Integracoes" value={`${integrations.length} conectores`} description="Dados estáticos, estruturais e dinâmicos" />
              <SectionCard title="Memória" value={`${memoryLayers.length} camadas`} description="Persistência total com uso seletivo no motor" />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dashboard"
                className="rounded-full bg-accent px-6 py-3 text-center text-sm font-semibold text-white transition hover:bg-accent-strong"
              >
                Abrir dashboard da rodada
              </Link>
              <Link
                href="/investimento-retorno"
                className="rounded-full border border-border bg-surface-strong px-6 py-3 text-center text-sm font-semibold transition hover:border-accent hover:text-accent"
              >
                Simular investimento x retorno
              </Link>
            </div>
          </div>

          <aside className="panel rounded-3xl bg-[rgba(255,250,240,0.75)] p-6">
            <p className="kicker text-xs text-muted">Manifesto do BOB</p>
            <div className="mt-4 space-y-4">
              <p className="text-lg leading-8">{dailyManifesto.dailyOpening}</p>
              <div className="rounded-[20px] bg-accent px-5 py-4 text-white">
                <p className="kicker text-xs text-white/70">Entrega</p>
                <p className="mt-2 text-sm leading-7">{dailyManifesto.deliverySignature}</p>
              </div>
              <p className="text-sm leading-7 text-muted">
                A camada de personalidade já entra no produto, mas continua
                isolada do motor analítico. O cérebro decide por dados e entrega
                com convicção.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="Dashboard"
          value="Âncoras, variações e cutoff"
          description="Primeira visão operacional da rodada com pesos, âncoras simuladas e variações mockadas."
        />
        <SectionCard
          title="Admin"
          value="Integrações e custos"
          description="Base inicial do painel para governança de APIs, prompts, cache e memória autônoma."
        />
        <SectionCard
          title="Calculadora"
          value="Temporada do BR"
          description="Simula custo por rodada, investimento anual, ponto de retorno e lucro líquido por big odd."
        />
      </section>
    </div>
  );
}
