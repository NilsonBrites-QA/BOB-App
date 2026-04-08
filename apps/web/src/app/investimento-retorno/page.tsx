import { InvestmentReturnCalculator } from "@/components/investment-return-calculator";

export default function InvestmentReturnPage() {
  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
      <section className="panel rounded-[28px] p-8">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <p className="kicker text-sm text-muted">Investimento x retorno</p>
            <h1 className="text-4xl font-semibold leading-tight">Simulador da temporada para acompanhar custo por rodada, esforço anual e retorno de uma big odd.</h1>
            <p className="max-w-3xl text-base leading-8 text-muted">
              A calculadora começa pelos exemplos do método: valor por variação,
              cinco múltiplas por rodada e projeção da temporada completa do Brasileirão.
              Ela serve tanto para cenários mínimos quanto para simulações mais agressivas.
            </p>
          </div>

          <div className="rounded-3xl bg-accent px-6 py-6 text-white">
            <p className="kicker text-xs text-white/70">Exemplo do Camillo</p>
            <div className="mt-4 space-y-3 text-sm leading-7 text-white/90">
              <p>R$ 3,00 por múltipla × 5 variações = R$ 15,00 por rodada.</p>
              <p>R$ 15,00 × 38 rodadas = R$ 570,00 investidos na temporada.</p>
              <p>Quando uma big odd bate, o cálculo precisa mostrar retorno bruto, margem e recuperação da temporada.</p>
            </div>
          </div>
        </div>
      </section>

      <InvestmentReturnCalculator />
    </div>
  );
}