import { NextResponse } from "next/server";
import { ensurePrimaryAdminAccess, isWhitelisted, recordSuccessfulLogin } from "@/lib/auth/whitelist";
import { createAuthRouteClient } from "@/utils/supabase/auth-route";

/**
 * /auth/callback
 *
 * Intercepta o PKCE code enviado pelo Supabase nos emails de:
 *   - Magic link / Convite
 *   - Recovery de senha (type=recovery)
 *
 * Fluxo:
 *   1. Troca o `code` por sessão via PKCE
 *   2. Verifica whitelist
 *   3. Redireciona:
 *      - type=recovery  → /conta?forced=1   (usuário define nova senha)
 *      - type=invite    → /conta?forced=1
 *      - demais         → ?next= ou /dashboard
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type"); // "recovery" | "invite" | "magiclink" | null
  const nextParam = searchParams.get("next");

  // Determina para onde redirecionar após auth bem-sucedida
  // Recovery e convites sempre vão para /conta para o user definir/redefinir senha
  const isRecovery = type === "recovery" || type === "invite";
  const defaultNext = isRecovery ? "/conta?forced=1" : "/dashboard";
  const next = nextParam?.startsWith("/") ? nextParam : defaultNext;

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?reason=missing_code`);
  }

  const successResponse = NextResponse.redirect(`${origin}${next}`);
  const authClient = await createAuthRouteClient(successResponse);
  const { supabase } = authClient;

  // Troca o código PKCE por sessão
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession falhou:", error.message);
    return NextResponse.redirect(
      `${origin}/auth/error?reason=exchange_failed&hint=${encodeURIComponent(error.message)}`,
    );
  }

  // Persiste a sessão nos cookies da resposta
  if (data.session?.access_token && data.session.refresh_token) {
    await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  }

  // Verifica identidade pós-sessão
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    authClient.setResponse(NextResponse.redirect(`${origin}/auth/error?reason=no_email`));
    await supabase.auth.signOut();
    return authClient.getResponse();
  }

  const normalizedEmail = user.email.toLowerCase();

  await ensurePrimaryAdminAccess(normalizedEmail);

  // Recovery/convite: não bloqueia por whitelist — o admin já gerou o link
  // intencionalmente. Apenas garante o registro no DB.
  if (!isRecovery) {
    if (!(await isWhitelisted(normalizedEmail))) {
      authClient.setResponse(
        NextResponse.redirect(`${origin}/auth/error?reason=not_authorized`),
      );
      await supabase.auth.signOut();
      return authClient.getResponse();
    }
  }

  await recordSuccessfulLogin(normalizedEmail);

  // Atualiza o redirect target na resposta
  authClient.setResponse(NextResponse.redirect(`${origin}${next}`));
  return authClient.getResponse();
}

