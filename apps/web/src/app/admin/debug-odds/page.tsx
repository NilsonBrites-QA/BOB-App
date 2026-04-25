/**
 * Página de debug de odds — compara Bet365 vs Pinnacle nas fontes free.
 * Acesso: somente role=ADMIN.
 *
 * Esta página é client-side: chama /api/admin/debug/odds e mostra
 * o JSON formatado em colunas, com diagnóstico automático de qual
 * fonte está retornando dados úteis.
 */

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import DebugOddsClient from "./debug-odds-client";

export const dynamic = "force-dynamic";

export default async function DebugOddsPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  const dbUser = user?.email
    ? await prisma.user.findUnique({
        where: { email: user.email.toLowerCase() },
        select: { role: true, active: true },
      })
    : null;

  if (!dbUser?.active || dbUser.role !== "ADMIN") {
    return (
      <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
        <section className="panel rounded-[28px] p-8">
          <h1 className="text-2xl font-bold">Acesso negado</h1>
          <p className="mt-3 text-sm text-muted">Esta página é restrita a administradores.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
      <section className="panel rounded-[28px] p-8">
        <p className="kicker mb-2">Diagnóstico</p>
        <h1 className="text-3xl font-bold tracking-tight">Debug de Odds</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
          Compara as 4 fontes free de odds disponíveis no projeto. Use para descobrir
          qual API retorna dados Bet365 hoje e se os parsers atuais funcionam.
        </p>
      </section>

      <DebugOddsClient />
    </div>
  );
}
