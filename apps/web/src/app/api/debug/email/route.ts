/**
 * BOB — Diagnóstico de Email (Resend)
 *
 * GET /api/debug/email
 *   → verifica se RESEND_API_KEY está configurada e envia email de teste
 *
 * POST /api/debug/email
 *   body: { "to": "email@destino.com" }
 *   → envia email de teste de reset de senha para o endereço especificado
 *
 * Protegido por CRON_SECRET (Authorization: Bearer <CRON_SECRET>)
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function assertAuth(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return false;
  }
  return true;
}

export async function GET(request: Request) {
  if (!(await assertAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from   = process.env.RESEND_FROM?.trim();

  return NextResponse.json({
    ok: !!apiKey,
    env: {
      RESEND_API_KEY:  apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : null,
      RESEND_FROM:     from ?? null,
      APP_URL:         process.env.NEXT_PUBLIC_APP_URL ?? null,
    },
    diagnosis: !apiKey
      ? "❌ RESEND_API_KEY não configurada — emails NÃO serão enviados. Configure em: Vercel Dashboard → Settings → Environment Variables"
      : !from
      ? "⚠️ RESEND_API_KEY OK, mas RESEND_FROM não configurada. Usando fallback 'BOB <onboarding@resend.dev>' (funciona apenas no domínio padrão Resend)"
      : "✅ Configuração de email OK",
  });
}

export async function POST(request: Request) {
  if (!(await assertAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let to: string;
  try {
    const body = await request.json() as { to?: string };
    to = (body.to ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  if (!to || !to.includes("@")) {
    return NextResponse.json({ error: "Campo 'to' é obrigatório e deve ser um email válido" }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: "RESEND_API_KEY não configurada",
      action: "Configure em Vercel → Settings → Environment Variables → RESEND_API_KEY",
    });
  }

  // Envia email de teste real
  const { sendPasswordRecoveryLinkEmail } = await import("@/lib/email/send-password-recovery-link");
  const result = await sendPasswordRecoveryLinkEmail({
    to,
    recoveryLink: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://bob-app-kappa.vercel.app"}/conta/senha?token=TESTE-NAO-VALIDO`,
    expiresInHours: 1,
  });

  return NextResponse.json({
    ok: result.ok,
    to,
    result,
    timestamp: new Date().toISOString(),
  });
}
