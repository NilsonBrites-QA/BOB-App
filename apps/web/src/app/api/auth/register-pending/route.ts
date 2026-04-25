/**
 * POST /api/auth/register-pending
 *
 * Chamado após signUp bem-sucedido no client. Registra o email como
 * solicitação pendente na tabela `users` (active=false, role=VIEWER).
 *
 * Idempotente: se o email já está liberado, não sobrescreve.
 */

import { NextResponse } from "next/server";
import { registerPendingAccessRequest } from "@/lib/auth/whitelist";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { email?: string } | null;
    const email = body?.email?.trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "Email inválido" }, { status: 400 });
    }

    await registerPendingAccessRequest(email);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/auth/register-pending] erro:", err);
    return NextResponse.json({ ok: false, error: "Falha interna" }, { status: 500 });
  }
}
