import { SectionCard } from "@/components/section-card";
import { VariationCard } from "@/components/variation-card";
import { anchorFactors, anchors, currentRoundSnapshot, variations } from "@/lib/bob/mock-data";

export default function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
      <section className="panel rounded-[28px] p-8">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <p className="kicker text-sm text-muted">Dashboard da rodada</p>
            <h1 className="text-4xl font-semibold leading-tight">Entrega principal da rodada com cutoff operacional antes do primeiro jogo.</h1>
            <p className="max-w-3xl text-base leading-8 text-muted">
              O pacote oficial da rodada nasce com antecedência, sustentado por
              probáveis, notícias, contexto competitivo, forma e leitura de valor.
              Escalações confirmadas tardias passam a alimentar memória,
              auditoria e alertas secundários.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SectionCard title="Rodada" value={currentRoundSnapshot.label} description={currentRoundSnapshot.firstMatchWindow} />
            <SectionCard title="Cutoff" value="T - 1h do primeiro bloco" description={currentRoundSnapshot.cutoffLabel} />
            <SectionCard title="Regra de entrega" value="5 variações fixas" description={currentRoundSnapshot.deliveryRule} />
            <SectionCard title="Lineups confirmadas" value="Memória e pós-análise" description={currentRoundSnapshot.confirmedLineupPolicy} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="panel rounded-3xl p-6">
          <p className="kicker text-xs text-muted">Âncoras simuladas</p>
          <div className="mt-5 space-y-4">
            {anchors.map((anchor) => (
              <div key={anchor.team} className="rounded-[20px] border border-border bg-surface-strong p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">{anchor.team}</h2>
                    <p className="text-sm text-muted">vs. {anchor.opponent}</p>
                  </div>
                  <div className="rounded-full bg-accent px-4 py-2 text-white">
                    <span className="font-mono text-sm">{anchor.score}</span>
                  </div>
                </div>
                <ul className="mt-3 space-y-2 text-sm leading-7 text-muted">
                  {anchor.reasons.map((reason) => (
                    <li key={reason}>• {reason}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </article>

        <article className="panel rounded-3xl p-6">
          <p className="kicker text-xs text-muted">Fatores do Anchor Score</p>
          <div className="mt-5 overflow-hidden rounded-[20px] border border-border">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[rgba(29,92,65,0.06)] text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Fator</th>
                  <th className="px-4 py-3 font-medium">Peso</th>
                  <th className="px-4 py-3 font-medium">Leitura</th>
                </tr>
              </thead>
              <tbody>
                {anchorFactors.map((factor) => (
                  <tr key={factor.label} className="border-t border-border/70">
                    <td className="px-4 py-3 font-medium">{factor.label}</td>
                    <td className="px-4 py-3 font-mono">{factor.weight}%</td>
                    <td className="px-4 py-3 text-muted">{factor.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="kicker text-xs text-muted">Variações iniciais</p>
            <h2 className="mt-2 text-3xl font-semibold">As 5 múltiplas já respeitam a estrutura-base do método.</h2>
          </div>
          <p className="max-w-xl text-right text-sm leading-7 text-muted">
            Nesta primeira entrega, as variações ainda são mockadas, mas já
            refletem as regras operacionais do produto e servem como contrato do motor.
          </p>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          {variations.map((variation) => (
            <VariationCard key={variation.id} variation={variation} />
          ))}
        </div>
      </section>
    </div>
  );
}