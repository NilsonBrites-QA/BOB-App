"use client";

/**
 * BOB — Glossário inline com tooltips
 *
 * Componente <Term> que envolve jargão técnico e exibe um tooltip
 * explicativo ao passar o mouse / tocar no mobile.
 *
 * Uso: <Term k="V1">V1 Segurança</Term>
 */

import { useState, useRef, useEffect, type ReactNode } from "react";

// ─── Dicionário de termos ─────────────────────────────────────────────────────

const GLOSSARY: Record<string, string> = {
  // Variações
  V1: "Variação mais conservadora. Usa todos os 4 âncoras + favoritos claros. Menor risco, odd a partir de 500x.",
  V2: "Equilíbrio entre segurança e valor. 3 âncoras + empates em jogos de placar travado. Odd a partir de 800x.",
  V3: "Aposta na lógica pura do campeonato. 4 âncoras + favoritos confirmados. Odd a partir de 800x.",
  V4: "Curta e agressiva. Menos jogos, seleção cirúrgica dos confrontos mais limpos. Odd mínima 1000x.",
  V5: "Variação extrema. Aceita empates e azarões para buscar odds muito altas. Piso mínimo 1000x.",

  // Conceitos do motor
  âncora: "Jogo com altíssima previsibilidade — score ≥ 65 no motor de análise. Até 4 por rodada. São os pilares da múltipla.",
  ancora: "Jogo com altíssima previsibilidade — score ≥ 65 no motor de análise. Até 4 por rodada. São os pilares da múltipla.",
  score: "Nota de 0 a 100 que o BOB dá a cada jogo. Combina posição na tabela, forma, mandante/visitante, gols, H2H e motivação.",
  fill: "Jogo complementar adicionado à variação para elevar a odd total. Não é âncora, mas tem boa previsibilidade.",
  odd: "Multiplicador de retorno. Odd 1000x = R$10 pode virar R$10.000. As odds são o produto de todas as cotações individuais.",

  // Fatores de análise
  forma: "Resultados recentes do time — vitórias (W), empates (D) e derrotas (L) nos últimos 5 jogos.",
  momentum: "Tendência de melhora ou piora: compara a performance dos últimos 5 jogos com os 5 anteriores.",
  H2H: "Head-to-Head — histórico de confrontos diretos entre os dois times.",
  h2h: "Head-to-Head — histórico de confrontos diretos entre os dois times.",
  mandante: "Vantagem do time que joga em casa. No Brasileirão, mandantes vencem ~50% dos jogos.",
  clássico: "Derby regional (ex: Fla-Flu, Corinthians x Palmeiras). Jogos com alta imprevisibilidade.",

  // Método
  BOB: "Big Odds Brasileirão — sistema que analisa cada rodada do Brasileirão e gera 5 variações de apostas múltiplas com odds acima de 500x.",
  múltipla: "Tipo de aposta que combina vários jogos. Todas as previsões precisam acertar para ganhar, mas o retorno é muito maior.",
  rodada: "Conjunto de 10 jogos disputados na mesma semana do Brasileirão. São 38 rodadas por temporada.",
  cutoff: "Momento limite para fechar as variações — até 1h antes do primeiro jogo da rodada.",
};

// ─── Componente Term ──────────────────────────────────────────────────────────

export function Term({ k, children }: { k: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const definition = GLOSSARY[k];

  // Fechar ao clicar fora
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!definition) return <>{children}</>;

  return (
    <span
      ref={ref}
      className="relative inline-block cursor-help"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen((v) => !v)}
    >
      <span className="border-b border-dashed border-white/30 text-white/90">{children}</span>
      {open && (
        <span className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-normal leading-relaxed text-zinc-200 shadow-xl ring-1 ring-white/10">
          {definition}
          <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-zinc-800 ring-1 ring-white/10" />
        </span>
      )}
    </span>
  );
}

// ─── Seção de glossário completo (para rodapé ou página dedicada) ─────────────

export function GlossarySection() {
  const categories = [
    {
      label: "Variações",
      terms: ["V1", "V2", "V3", "V4", "V5"],
    },
    {
      label: "Conceitos",
      terms: ["âncora", "score", "fill", "odd", "múltipla", "rodada", "cutoff"],
    },
    {
      label: "Análise",
      terms: ["forma", "momentum", "H2H", "mandante", "clássico"],
    },
  ];

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-white">Glossário BOB</h3>
      {categories.map((cat) => (
        <div key={cat.label}>
          <h4 className="mb-2 text-sm font-medium text-white/60">{cat.label}</h4>
          <dl className="space-y-1">
            {cat.terms.map((t) => (
              <div key={t} className="flex gap-3 text-sm">
                <dt className="min-w-20 font-mono text-emerald-400">{t}</dt>
                <dd className="text-zinc-400">{GLOSSARY[t]}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
