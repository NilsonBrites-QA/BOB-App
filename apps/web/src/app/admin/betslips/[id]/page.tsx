/**
 * BOB — /admin/betslips/[id]
 * Formulário de pós-rodada para registrar resultado de cada pick.
 * Server Component que busca os dados e passa para o formulário Client Component.
 */

import { notFound } from "next/navigation";
import { getRoundWithPicks } from "@/lib/bob/persist";
import { BetslipResultForm } from "./result-form";

export default async function BetslipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const round = await getRoundWithPicks(id);

  if (!round) notFound();

  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
      <section className="panel rounded-[28px] p-8">
        <p className="kicker text-sm text-muted">Pós-rodada</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight">
          Rodada #{round.number} · {round.season.year}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-8 text-muted">
          Marque o resultado real de cada pick. O BOB usa esses dados para
          calcular taxa de acerto, ROI e calibrar a memória de padrões.
        </p>
      </section>

      <BetslipResultForm round={round} />
    </div>
  );
}
