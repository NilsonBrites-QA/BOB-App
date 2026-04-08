import type { Variation } from "@/lib/bob/types";

type VariationCardProps = {
  variation: Variation;
};

export function VariationCard({ variation }: VariationCardProps) {
  return (
    <article className="panel rounded-3xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="kicker text-xs text-muted">{variation.id}</p>
          <h3 className="mt-2 text-2xl font-semibold">{variation.title}</h3>
        </div>
        <div className="rounded-full bg-accent-soft px-4 py-2 text-right">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent-strong">
            Odd projetada
          </p>
          <p className="mt-1 text-lg font-semibold text-accent-strong">
            {variation.projectedOdd.toFixed(0)}x
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-7 text-muted">{variation.posture}</p>
      <p className="mt-2 text-sm leading-7 text-muted">{variation.summary}</p>

      <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-muted">
        <span className="rounded-full border border-border px-3 py-1">
          {variation.gameCount} jogos
        </span>
        <span className="rounded-full border border-border px-3 py-1">
          Âncoras juntas: {variation.anchorsTogether ? "sim" : "não"}
        </span>
      </div>

      <div className="mt-5 overflow-hidden rounded-[18px] border border-border">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-[rgba(29,92,65,0.06)] text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Jogo</th>
              <th className="px-4 py-3 font-medium">Resultado</th>
              <th className="px-4 py-3 font-medium">Odd</th>
            </tr>
          </thead>
          <tbody>
            {variation.picks.map((pick) => (
              <tr key={`${variation.id}-${pick.match}`} className="border-t border-border/70">
                <td className="px-4 py-3">
                  <span className="font-medium">{pick.match}</span>
                  {pick.isAnchor ? (
                    <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">
                      âncora
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 font-mono">{pick.result}</td>
                <td className="px-4 py-3 font-mono">{pick.odd.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}