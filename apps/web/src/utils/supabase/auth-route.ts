import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseEnv } from "@/utils/supabase/config";

export async function createAuthRouteClient(initialResponse: NextResponse) {
  const cookieStore = await cookies();
  const { supabaseUrl, supabasePublishableKey } = getSupabaseEnv();

  let response = initialResponse;

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  return {
    supabase,
    getResponse() {
      return response;
    },
    setResponse(nextResponse: NextResponse) {
      // Copia cookies já setados na response atual para a nova, evitando perda de sessão
      response.cookies.getAll().forEach((c) => {
        nextResponse.cookies.set(c.name, c.value);
      });
      response = nextResponse;
    },
  };
}