import { NextResponse } from "next/server";
import {
  ensurePrimaryAdminAccess,
  isWhitelisted,
  registerPendingAccessRequest,
} from "@/lib/auth/whitelist";
import { createAuthRouteClient } from "@/utils/supabase/auth-route";
import type { EmailOtpType } from "@supabase/supabase-js";

const PRIMARY_ADMIN_EMAIL = "nilson.brites@gmail.com";

type ResponseMode = "redirect" | "json";

function resolveNextPath(next: string | null | undefined) {
  return next?.startsWith("/") ? next : "/dashboard";
}

function buildSuccessResponse(origin: string, next: string, mode: ResponseMode) {
  return mode === "json"
    ? NextResponse.json({ ok: true, next })
    : NextResponse.redirect(`${origin}${next}`);
}

function buildErrorResponse(
  origin: string,
  reason: string,
  mode: ResponseMode,
  status: number,
  errorMessage?: string,
) {
  return mode === "json"
    ? NextResponse.json({ ok: false, reason, errorMessage }, { status })
    : NextResponse.redirect(`${origin}/auth/error?reason=${reason}`);
}

async function finalizeAuthenticatedUser(
  authClient: Awaited<ReturnType<typeof createAuthRouteClient>>,
  origin: string,
  next: string,
  mode: ResponseMode,
) {
  const { supabase } = authClient;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    authClient.setResponse(
      buildErrorResponse(origin, "no_email", mode, 401, "Sessao invalida apos validar o codigo."),
    );
    await supabase.auth.signOut();
    return authClient.getResponse();
  }

  const normalizedEmail = user.email.toLowerCase();

  await ensurePrimaryAdminAccess(normalizedEmail);

  if (!(await isWhitelisted(normalizedEmail))) {
    // Registra como solicitação pendente para o admin aprovar depois.
    // Idempotente: se já existir, não sobrescreve role/active atuais.
    await registerPendingAccessRequest(normalizedEmail).catch((err) => {
      console.warn("[auth/confirm] falha ao registrar solicitação pendente:", err);
    });

    authClient.setResponse(
      buildErrorResponse(
        origin,
        "pending_approval",
        mode,
        403,
        "Sua solicitação de acesso foi registrada. O administrador do BOB irá liberar em breve.",
      ),
    );
    await supabase.auth.signOut();
    return authClient.getResponse();
  }

  authClient.setResponse(buildSuccessResponse(origin, next, mode));
  return authClient.getResponse();
}

async function persistSessionIfPresent(
  authClient: Awaited<ReturnType<typeof createAuthRouteClient>>,
  session:
    | {
        access_token: string;
        refresh_token: string;
      }
    | null
    | undefined,
) {
  if (!session?.access_token || !session.refresh_token) {
    return;
  }

  await authClient.supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
}

/**
 * /auth/confirm
 *
 * GET: fallback para links de email existentes.
 * POST: validacao direta do codigo OTP digitado no login.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = (searchParams.get("type") || "magiclink") as EmailOtpType;
  const next = resolveNextPath(searchParams.get("next"));

  const successResponse = buildSuccessResponse(origin, next, "redirect");
  const authClient = await createAuthRouteClient(successResponse);
  const { supabase } = authClient;

  if (!code && !token_hash) {
    return finalizeAuthenticatedUser(authClient, origin, next, "redirect");
  }

  const { data, error } = token_hash
    ? await supabase.auth.verifyOtp({ token_hash, type })
    : await supabase.auth.exchangeCodeForSession(code!);

  if (error) {
    return buildErrorResponse(origin, "exchange_failed", "redirect", 401);
  }

  await persistSessionIfPresent(authClient, data.session);

  return finalizeAuthenticatedUser(authClient, origin, next, "redirect");
}

export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const payload = await request.json().catch(() => null) as
    | { email?: string; token?: string; next?: string }
    | null;

  const email = payload?.email?.trim().toLowerCase();
  const token = payload?.token?.replace(/\s+/g, "").trim();
  const next = resolveNextPath(payload?.next);

  if (!email || !token) {
    return buildErrorResponse(
      origin,
      "missing_code",
      "json",
      400,
      "Informe o email e o codigo recebido para continuar.",
    );
  }

  const successResponse = buildSuccessResponse(origin, next, "json");
  const authClient = await createAuthRouteClient(successResponse);
  const { supabase } = authClient;

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    return buildErrorResponse(
      origin,
      "exchange_failed",
      "json",
      401,
      "Codigo invalido ou expirado. Solicite um novo codigo e tente novamente.",
    );
  }

  await persistSessionIfPresent(authClient, data.session);

  return finalizeAuthenticatedUser(authClient, origin, next, "json");
}
