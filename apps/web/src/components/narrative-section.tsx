/**
 * NarrativeSection — Async Server Component
 *
 * Renderiza a análise narrativa do BOB gerada pela OpenAI.
 * Deve ser envolvido em <Suspense fallback={<NarrativeSkeleton />}> no dashboard
 * para não bloquear o restante da página enquanto a IA processa.
 *
 * Se a narrativa retornar vazia (sem chave, sem âncoras, erro da API),
 * o componente retorna null silenciosamente — zero impacto no layout.
 */

import type { ScoredMatch } from "@/lib/bob/engine/scoring";
import type { Variation } from "@/lib/bob/types";
import { generateRoundNarrative } from "@/lib/bob/ai/narrative";

// ─── Props ────────────────────────────────────────────────────────────────────

type NarrativeSectionProps = {
  season: number;
  round: number;
  anchors: ScoredMatch[];
  variations: Variation[];
};

// ─── Skeleton de loading ──────────────────────────────────────────────────────

export function NarrativeSkeleton() {
  return (
    <section className="panel rounded-[28px] p-8">
      <p className="kicker text-xs text-muted">Leitura do BOB</p>
      <div className="mt-5 space-y-3">
        <div className="h-4 w-3/4 animate-pulse rounded-full bg-border" />
        <div className="h-4 w-full animate-pulse rounded-full bg-border" />
        <div className="h-4 w-5/6 animate-pulse rounded-full bg-border" />
        <div className="mt-4 h-4 w-full animate-pulse rounded-full bg-border" />
        <div className="h-4 w-4/5 animate-pulse rounded-full bg-border" />
        <div className="mt-4 h-4 w-2/3 animate-pulse rounded-full bg-border" />
      </div>
    </section>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export async function NarrativeSection({
  season,
  round,
  anchors,
  variations,
}: NarrativeSectionProps) {
  const narrative = await generateRoundNarrative({ season, round, anchors, variations });

  if (!narrative) return null;

  // Divide em parágrafos por linha em branco
  const paragraphs = narrative
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <section className="panel rounded-[28px] p-8">
      <div className="flex items-center justify-between gap-4">
        <p className="kicker text-xs text-muted">Leitura do BOB</p>
        <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">
          gpt-4o-mini · rodada {round}/{season}
        </span>
      </div>

      <div className="mt-5 space-y-4 text-base leading-8 text-muted">
        {paragraphs.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}
