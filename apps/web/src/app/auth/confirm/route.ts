import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createAuthRouteClient } from "@/utils/supabase/auth-route";
import type { EmailOtpType } from "@supabase/supabase-js";

const PRIMARY_ADMIN_EMAIL = "nilson.brites@gmail.com";

/**
 * /auth/confirm — verificação de magic link sem PKCE.
 *
 * O fluxo padrão (/auth/callback?code=...) requer que o código PKCE
 * esteja em cookie do mesmo browser que iniciou o login.
 * Isso quebra quando o link é aberto em outro browser, dispositivo
 * ou dentro do app de email (Gmail webview, etc.).
 *
 * Esta rota usa verifyOtp({ token_hash }) — verificação server-side
 * direta, sem dependência de cookies. Funciona de qualquer browser.
 *
 * O template do email usa:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = (searchParams.get("type") || "magiclink") as EmailOtpType;
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code && !token_hash) {
    return NextResponse.redirect(`${origin}/auth/error?reason=missing_code`);
  }

  const successResponse = NextResponse.redirect(`${origin}${next}`);
  const authClient = await createAuthRouteClient(successResponse);
  const { supabase } = authClient;

  const { error } = token_hash
    ? await supabase.auth.verifyOtp({ token_hash, type })
    : await supabase.auth.exchangeCodeForSession(code!);

  if (error) {
    return NextResponse.redirect(`${origin}/auth/error?reason=exchange_failed`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    authClient.setResponse(NextResponse.redirect(`${origin}/auth/error?reason=no_email`));
    await supabase.auth.signOut();
    return authClient.getResponse();
  }

  const normalizedEmail = user.email.toLowerCase();

  // Bootstrap do admin principal
  if (normalizedEmail === PRIMARY_ADMIN_EMAIL) {
    await prisma.user.upsert({
      where: { email: PRIMARY_ADMIN_EMAIL },
      create: { email: PRIMARY_ADMIN_EMAIL, role: "ADMIN", active: true },
      update: { role: "ADMIN", active: true },
    });
  }

  const whitelisted = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { active: true },
  });

  if (!whitelisted?.active) {
    authClient.setResponse(NextResponse.redirect(`${origin}/auth/error?reason=not_authorized`));
    await supabase.auth.signOut();
    return authClient.getResponse();
  }

  return authClient.getResponse();
}
