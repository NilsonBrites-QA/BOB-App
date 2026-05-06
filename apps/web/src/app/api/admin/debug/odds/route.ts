/**
 * Endpoint de debug — compara fontes de odds (Bet365 vs Pinnacle).
 *
 * Uso: GET /api/admin/debug/odds?fixtureId=12345
 *      Se fixtureId omitido, usa o primeiro Pick da Round mais recente.
 *
 * Acesso: somente role=ADMIN.
 *
 * Saída: diagnóstico consolidado do Data Gateway.
 *
 * Útil para descobrir qual fonte está retornando dados úteis hoje sem
 * bypassar cache, lock, cooldown ou timeout central.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { getGatewayOddsDiagnostics } from "@/lib/data/sports-data-gateway";

async function requireAdmin() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return false;

  const dbUser = await prisma.user.findUnique({
    where: { email: user.email.toLowerCase() },
    select: { role: true, active: true },
  });
  return Boolean(dbUser?.active && dbUser.role === "ADMIN");
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const fixtureIdParam = url.searchParams.get("fixtureId");
  let fixtureId = fixtureIdParam ? parseInt(fixtureIdParam, 10) : NaN;

  // Se não vier por querystring, pega do último Pick com fixtureId
  if (!Number.isFinite(fixtureId)) {
    const lastPick = await prisma.pick.findFirst({
      where: { fixtureId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { fixtureId: true, match: true },
    });
    if (lastPick?.fixtureId) {
      fixtureId = parseInt(lastPick.fixtureId, 10);
    }
  }

  const diagnostics = await getGatewayOddsDiagnostics();

  return NextResponse.json({
    fixtureId: Number.isFinite(fixtureId) ? fixtureId : null,
    fontes: diagnostics,
    notas: [
      "Diagnóstico executado via Data Gateway, com cache, lock, cooldown e timeout central.",
      "Esta rota não consulta providers diretamente.",
    ],
  }, { status: 200 });
}
