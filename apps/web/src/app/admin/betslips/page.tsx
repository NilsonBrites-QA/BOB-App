/**
 * BOB — /admin/betslips
 * Lista todas as rodadas salvas com links para o formulário de pós-rodada.
 */

import Link from "next/link";
import { getRounds } from "@/lib/bob/persist";

function statusLabel(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    DRAFT:     { label: "Rascunho",  cls: "text-muted" },
    READY:     { label: "Pronto",    cls: "text-accent-strong" },
    DELIVERED: { label: "Entregue", cls: "text-accent-strong" },
    CLOSED:    { label: "Fechado",   cls: "text-muted" },
  };
  return map[status] ?? { label: status, cls: "text-muted" };
}

export default async function BetslipsPage() {
  const rounds = await getRounds(40);

  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
      <section className="panel rounded-[28px] p-8">
        <p className="kicker text-sm text-muted">Pós-rodada</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight">
          Registro de resultados
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-8 text-muted">
          Selecione uma rodada para registrar os resultados reais dos picks.
          O feedback alimenta o histórico de performance e as métricas de ROI.
        </p>
      </section>

      {rounds.length === 0 ? (
        <section className="panel rounded-[28px] p-8">
          <p className="text-sm text-muted">
            Nenhuma rodada salva ainda. O BOB salva automaticamente quando gera
            variações com dados reais da API-Football.
          </p>
        </section>
      ) : (
        <section className="panel rounded-3xl p-6">
          <div className="overflow-hidden rounded-[20px] border border-border">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[rgba(29,92,65,0.06)] text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Temporada</th>
                  <th className="px-4 py-3 font-medium">Rodada</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Âncoras</th>
                  <th className="px-4 py-3 font-medium">Variações</th>
                  <th className="px-4 py-3 font-medium">Resultado</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rounds.map((r) => {
                  const st = statusLabel(r.status);
                  const netReturn = r.result?.netReturn ? Number(r.result.netReturn) : null;
                  return (
                    <tr key={r.id} className="border-t border-border/70">
                      <td className="px-4 py-3 font-medium">{r.season.year}</td>
                      <td className="px-4 py-3 font-mono">#{r.number}</td>
                      <td className={`px-4 py-3 font-medium ${st.cls}`}>{st.label}</td>
                      <td className="px-4 py-3">{r._count.anchors}</td>
                      <td className="px-4 py-3">{r.variations.length}</td>
                      <td className="px-4 py-3">
                        {r.result ? (
                          <span className={netReturn && netReturn >= 0 ? "text-accent-strong font-semibold" : "text-red-500 font-semibold"}>
                            {netReturn && netReturn >= 0 ? "+" : ""}
                            {netReturn !== null ? `R$ ${netReturn.toFixed(2)}` : "—"}
                          </span>
                        ) : (
                          <span className="text-muted">Pendente</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/betslips/${r.id}`}
                          className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-surface-strong"
                        >
                          {r.status === "CLOSED" ? "Ver detalhes" : "Registrar resultado"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
