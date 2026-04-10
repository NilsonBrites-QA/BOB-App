/**
 * BOB — Push Subscription API
 *
 * POST /api/push/subscribe   — registra subscription de um usuário
 * DELETE /api/push/subscribe — remove subscription
 *
 * O servidor precisa de VAPID keys para assinar as notificações:
 *   VAPID_PUBLIC_KEY   — chave pública (também em NEXT_PUBLIC_VAPID_PUBLIC_KEY)
 *   VAPID_PRIVATE_KEY  — chave privada (server-only)
 *   VAPID_EMAIL        — ex: mailto:admin@bob.app
 *
 * Para gerar as keys: npx web-push generate-vapid-keys
 *
 * A tabela PushSubscription precisa existir no banco.
 * Obs: na ausência de tabela dedicada, usamos a tabela User como proxy
 *      (campo pushSubscription: String?). Adicionar migração se necessário.
 */

import { NextResponse }  from "next/server";
import { cookies }       from "next/headers";
import { createClient }  from "@/utils/supabase/server";
import { prisma }        from "@/lib/db";

// ─── POST — registrar subscription ───────────────────────────────────────────

export async function POST(request: Request) {
  // Auth — somente usuários autenticados
  const cookieStore = await cookies();
  const supabase    = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  // Validação mínima da PushSubscription
  if (
    !body ||
    typeof body !== "object" ||
    !("endpoint" in body) ||
    typeof (body as Record<string, unknown>).endpoint !== "string"
  ) {
    return NextResponse.json({ error: "Subscription inválida." }, { status: 400 });
  }

  const subscriptionJson = JSON.stringify(body);

  await prisma.user.update({
    where: { email: user.email.toLowerCase() },
    data:  { pushSubscription: subscriptionJson },
  });

  return NextResponse.json({ ok: true, message: "Push subscription registrada." });
}

// ─── DELETE — remover subscription ───────────────────────────────────────────

export async function DELETE(request: Request) {
  const cookieStore = await cookies();
  const supabase    = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  await prisma.user.update({
    where: { email: user.email.toLowerCase() },
    data:  { pushSubscription: null },
  });

  return NextResponse.json({ ok: true, message: "Push subscription removida." });
}
