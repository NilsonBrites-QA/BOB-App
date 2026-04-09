/**
 * BOB — Cron endpoint: GET /api/cron/revalidate
 *
 * Chamado pelo Vercel Cron às 10h nas sextас, sábados e domingos.
 * Revalida o cache do dashboard para que os dados da rodada sejam
 * buscados de forma fresca na próxima visita do usuário.
 *
 * Requer: header Authorization: Bearer <CRON_SECRET>
 */

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const secret     = process.env.CRON_SECRET;

  // Rejeita se o secret não estiver configurado ou não bater
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  revalidatePath("/dashboard");
  revalidatePath("/investimento-retorno");

  return NextResponse.json({
    ok: true,
    revalidated: ["/dashboard", "/investimento-retorno"],
    timestamp: new Date().toISOString(),
  });
}
