import { NextResponse } from "next/server";
import { ensurePrimaryAdminAccess, isWhitelisted, recordSuccessfulLogin } from "@/lib/auth/whitelist";
import { createAuthRouteClient } from "@/utils/supabase/auth-route";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?reason=missing_code`);
  }

  const successResponse = NextResponse.redirect(`${origin}${next}`);
  const authClient = await createAuthRouteClient(successResponse);
  const { supabase } = authClient;

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/auth/error?reason=exchange_failed`);
  }

  if (data.session?.access_token && data.session.refresh_token) {
    await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  }

  // Verificar whitelist
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

  if (!(await isWhitelisted(normalizedEmail))) {
    authClient.setResponse(NextResponse.redirect(`${origin}/auth/error?reason=not_authorized`));
    await supabase.auth.signOut();
    return authClient.getResponse();
  }

  await recordSuccessfulLogin(normalizedEmail);

  return authClient.getResponse();
}
