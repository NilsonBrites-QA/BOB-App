import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getSupabaseEnv } from "@/utils/supabase/config";

// Rotas que não exigem sessão Supabase.
// As rotas de API (/api/*) têm autenticação própria (CRON_SECRET ou são públicas).
// Adicioná-las aqui evita o redirect 307 → /login quando o cron-job.org as chama.
const PUBLIC_PATHS = [
  "/login",
  "/auth/callback",
  "/auth/confirm",
  "/auth/error",
  "/auth/recover",   // página de recuperação de senha — acessível sem sessão
  "/api/",           // todas as rotas de API — autenticação gerenciada por cada route handler
  "/manifest.json",  // PWA manifest — deve ser acessível sem sessão
  "/sw.js",          // Service Worker — deve ser acessível sem sessão
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function updateSession(request: NextRequest) {
  let supabaseUrl: string;
  let supabasePublishableKey: string;
  try {
    ({ supabaseUrl, supabasePublishableKey } = getSupabaseEnv());
  } catch {
    // Env vars ausentes — deixa a requisição passar sem autenticação
    return NextResponse.next({ request: { headers: request.headers } });
  }

  const { pathname } = request.nextUrl;

  // Passa o pathname como header para server components (ex: SiteShell)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Rota pública — deixa passar
  if (isPublic(pathname)) return response;

  // Não autenticado — redireciona para login
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}