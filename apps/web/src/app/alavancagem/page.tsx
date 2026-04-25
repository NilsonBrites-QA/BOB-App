"use client";

import { useState } from "react";

// SVG Icons
const IconTrendingUp = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>;
const IconTarget = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>;
const IconCalculator = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/></svg>;
const IconZap = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
const IconBrain = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>;

interface LeverageLevel {
  id: string;
  name: string;
  bankrollPercent: number;
  weeklyStake: number;
  targetOdd: number;
  description: string;
  risk: "conservador" | "moderado" | "agressivo";
  bobAdvice: string;
}

const leverageLevels: LeverageLevel[] = [
  {
    id: "safe",
    name: "Conservador",
    bankrollPercent: 2,
    weeklyStake: 100,
    targetOdd: 200,
    description: "Proteção máxima da banca com crescimento lento e consistente",
    risk: "conservador",
    bobAdvice: "Ideal para quem está começando ou tem aversão a risco. Foco em âncoras com odd 1.40-1.80. Crescimento de 5-10% ao mês."
  },
  {
    id: "balanced",
    name: "Equilibrado",
    bankrollPercent: 5,
    weeklyStake: 275,
    targetOdd: 500,
    description: "Balanceamento entre proteção de capital e potencial de crescimento",
    risk: "moderado",
    bobAdvice: "Estratégia recomendada para a maioria. Usa método das variações com 5 bilhetes de R$ 55. Retorno potencial 50x-100x."
  },
  {
    id: "aggressive",
    name: "Agressivo",
    bankrollPercent: 10,
    weeklyStake: 500,
    targetOdd: 1000,
    description: "Máxima exposição para crescimento acelerado com risco elevado",
    risk: "agressivo",
    bobAdvice: "Apenas para quem tem experiência e banca robusta. Inclui zebras calculadas e empates. Risco de perda significativa."
  }
];

export default function AlavancagemPage() {
  const [bankroll, setBankroll] = useState<number>(5000);
  const [selectedLevel, setSelectedLevel] = useState<LeverageLevel>(leverageLevels[1]);
  const [showCalculator, setShowCalculator] = useState(false);

  const calculateProjection = (weeks: number) => {
    const weeklyInvestment = bankroll * (selectedLevel.bankrollPercent / 100);
    const hitRate = selectedLevel.risk === "conservador" ? 0.25 : selectedLevel.risk === "moderado" ? 0.15 : 0.08;
    const avgReturn = selectedLevel.targetOdd * 0.6; // Assuming partial wins
    
    let total = bankroll;
    let invested = 0;
    let won = 0;
    
    for (let i = 0; i < weeks; i++) {
      invested += weeklyInvestment;
      if (Math.random() < hitRate) {
        won += weeklyInvestment * avgReturn;
      }
      total = bankroll - invested + won;
    }
    
    return {
      final: total,
      invested,
      won,
      roi: invested > 0 ? ((won - invested) / invested) * 100 : 0
    };
  };

  const projection4weeks = calculateProjection(4);
  const projection12weeks = calculateProjection(12);

  return (
    <div className="min-h-full space-y-6">
      {/* Header */}
      <section className="rounded-[28px] border border-border bg-gradient-to-br from-surface to-surface-strong p-6 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-accent"><IconTrendingUp /></span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                Gestão de Banca
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-bold">Alavancagem Inteligente</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              O BOB calcula o nível ideal de exposição baseado na sua banca. 
              Escolha entre conservador, equilibrado ou agressivo e veja projeções realistas.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowCalculator(!showCalculator)}
              className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm font-medium text-accent transition hover:bg-accent/20"
            >
              <span className="h-4 w-4"><IconCalculator /></span>
              Simular Cenários
            </button>
          </div>
        </div>

        {/* Bankroll Input */}
        <div className="mt-6 rounded-2xl border border-border bg-background/50 p-4">
          <label className="text-[10px] uppercase tracking-wider text-muted">Sua Banca Atual</label>
          <div className="mt-2 flex items-center gap-4">
            <span className="text-2xl font-bold">R$</span>
            <input
              type="number"
              value={bankroll}
              onChange={(e) => setBankroll(Number(e.target.value))}
              className="flex-1 rounded-xl border border-border bg-background px-4 py-2 text-2xl font-bold outline-none focus:border-accent"
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            Valor que você tem disponível para apostas. O BOB recomenda nunca arriscar mais que 10% da banca por semana.
          </p>
        </div>
      </section>

      {/* Leverage Levels */}
      <section className="grid gap-4 lg:grid-cols-3">
        {leverageLevels.map((level) => {
          const isSelected = selectedLevel.id === level.id;
          const weeklyAmount = Math.round(bankroll * (level.bankrollPercent / 100));
          
          return (
            <button
              key={level.id}
              onClick={() => setSelectedLevel(level)}
              className={`relative rounded-2xl border p-5 text-left transition ${
                isSelected
                  ? "border-accent bg-accent/10 ring-1 ring-accent"
                  : "border-border bg-surface hover:border-accent/50"
              }`}
            >
              {isSelected && (
                <span className="absolute right-4 top-4 rounded-full bg-accent px-2 py-1 text-[10px] font-bold text-white">
                  SELECIONADO
                </span>
              )}
              
              <div className="flex items-center gap-2">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                  level.risk === "conservador" ? "bg-emerald-500/20 text-emerald-500" :
                  level.risk === "moderado" ? "bg-accent/20 text-accent" :
                  "bg-red-500/20 text-red-500"
                }`}>
                  {level.risk === "conservador" ? <IconTarget /> :
                   level.risk === "moderado" ? <IconTrendingUp /> :
                   <IconZap />}
                </div>
                <div>
                  <h3 className="font-semibold">{level.name}</h3>
                  <span className={`text-[10px] ${
                    level.risk === "conservador" ? "text-emerald-500" :
                    level.risk === "moderado" ? "text-accent" :
                    "text-red-500"
                  }`}>
                    {level.risk.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Exposição semanal:</span>
                  <span className="font-semibold">R$ {weeklyAmount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">% da banca:</span>
                  <span className="font-semibold">{level.bankrollPercent}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Odd alvo:</span>
                  <span className="font-semibold">{level.targetOdd}x</span>
                </div>
              </div>

              <p className="mt-3 text-xs text-muted leading-relaxed">
                {level.description}
              </p>
            </button>
          );
        })}
      </section>

      {/* BOB Advice */}
      <section className="rounded-[24px] border border-accent/30 bg-accent/5 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
            <IconBrain />
          </div>
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              Opinião do BOB
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] text-accent">
                {selectedLevel.name}
              </span>
            </h3>
            <p className="mt-2 text-sm text-muted leading-relaxed">
              {selectedLevel.bobAdvice}
            </p>
            <div className="mt-3 rounded-xl border border-border bg-surface p-3">
              <p className="text-xs text-muted">
                💡 <strong>Exemplo prático:</strong> Com banca de {bankroll.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}, 
                você investe {Math.round(bankroll * (selectedLevel.bankrollPercent / 100)).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})} por semana 
                em {selectedLevel.risk === "moderado" ? "5 bilhetes de R$ 55 cada" : "bilhetes selecionados"}. 
                Se acertar uma odd {selectedLevel.targetOdd}x, recebe {Math.round(bankroll * (selectedLevel.bankrollPercent / 100) * selectedLevel.targetOdd).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Projection Calculator */}
      {showCalculator && (
        <section className="rounded-[24px] border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold mb-4">Projeção de Crescimento</h2>
          <p className="text-sm text-muted mb-4">
            Simulação estatística baseada em taxas de acerto típicas para cada perfil de risco.
            {selectedLevel.risk === "conservador" && " Taxa estimada: 25% (1 em 4 semanas)."}
            {selectedLevel.risk === "moderado" && " Taxa estimada: 15% (1 em 7 semanas)."}
            {selectedLevel.risk === "agressivo" && " Taxa estimada: 8% (1 em 12 semanas)."}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-background/50 p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted">Em 4 semanas</p>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Investido:</span>
                  <span>{projection4weeks.invested.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Retorno (est.):</span>
                  <span className={projection4weeks.won > projection4weeks.invested ? "text-emerald-500" : "text-red-500"}>
                    {projection4weeks.won.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-semibold">
                  <span>Banca final:</span>
                  <span className={projection4weeks.final > bankroll ? "text-emerald-500" : projection4weeks.final < bankroll ? "text-red-500" : ""}>
                    {projection4weeks.final.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted">
                  <span>ROI:</span>
                  <span>{projection4weeks.roi.toFixed(1)}%</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background/50 p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted">Em 12 semanas (3 meses)</p>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Investido:</span>
                  <span>{projection12weeks.invested.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Retorno (est.):</span>
                  <span className={projection12weeks.won > projection12weeks.invested ? "text-emerald-500" : "text-red-500"}>
                    {projection12weeks.won.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-semibold">
                  <span>Banca final:</span>
                  <span className={projection12weeks.final > bankroll ? "text-emerald-500" : projection12weeks.final < bankroll ? "text-red-500" : ""}>
                    {projection12weeks.final.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted">
                  <span>ROI:</span>
                  <span>{projection12weeks.roi.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-muted">
            ⚠️ <strong>Aviso:</strong> Estas são projeções estatísticas baseadas em probabilidades. 
            Resultados reais podem variar significativamente. Nunca aposte mais do que pode perder.
          </p>
        </section>
      )}

      {/* Rules Section */}
      <section className="rounded-[24px] border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold mb-4">Regras de Ouro da Alavancagem</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-background/30 p-4">
            <h3 className="text-sm font-semibold mb-2">1. Nunca All-in</h3>
            <p className="text-xs text-muted leading-relaxed">
              Mesmo no modo agressivo, máximo 10% da banca por semana. Proteção é prioridade.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background/30 p-4">
            <h3 className="text-sm font-semibold mb-2">2. Stop Loss Semanal</h3>
            <p className="text-xs text-muted leading-relaxed">
              Se perder 50% do investimento semanal, pare. Sem exceções. Volte na próxima rodada.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background/30 p-4">
            <h3 className="text-sm font-semibold mb-2">3. Reinvestir Lucros</h3>
            <p className="text-xs text-muted leading-relaxed">
              Após acerto de Big Odd, retire 50% do lucro e reinveste 50% na banca.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background/30 p-4">
            <h3 className="text-sm font-semibold mb-2">4. Consistência</h3>
            <p className="text-xs text-muted leading-relaxed">
              Mesma estratégia por pelo menos 10 rodadas antes de avaliar resultados. 
              Disciplina vence variação de curto prazo.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
