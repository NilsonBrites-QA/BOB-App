/**
 * BOB — Send Push API
 *
 * POST /api/push/send
 *
 * Envia push notification para todos os usuários (ou usuário específico).
 * Uso principal: chamado pelos crons pós-análise para notificar "pacote pronto".
 *
 * Body (JSON):
 *   title   — título da notificação
 *   body    — corpo do texto
 *   url     — URL a abrir ao clicar (default: /dashboard)
 *   tag     — tag para agrupar notificações (evita duplicatas)
 *   userId  — (opcional) enviar apenas para um usuário específico (email)
 *
 * Requer: Authorization: Bearer <CRON_SECRET>  OU  role=ADMIN
 *
 * Depende de: web-push npm package (instalar se necessário)
 *
 * NOTA: pushSubscription é armazenada como JSON string no campo User.pushSubscription.
 * Se o campo não existir no schema, adicionar: pushSubscription String? @map("push_subscription")
 */

import { NextResponse }  from "next/server";
import { cookies }       from "next/headers";
import { createClient }  from "@/utils/supabase/server";
import { prisma }        from "@/lib/db";

// ─── Tipo do payload de push ──────────────────────────────────────────────────

type PushPayload = {
  title:  string;
  body:   string;
  url?:   string;
  tag?:   string;
  userId?: string; // email — se omitido, envia para todos
};

// ─── sendWebPush ──────────────────────────────────────────────────────────────

/** Envia push para uma subscription usando a Web Push Protocol */
async function sendWebPush(
  subscriptionJson: string,
  payload: PushPayload,
): Promise<boolean> {
  const vapidPublic  = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidEmail   = process.env.VAPID_EMAIL ?? "mailto:admin@bob.app";

  if (!vapidPublic || !vapidPrivate) {
    console.warn("[BOB/push] VAPID keys não configuradas — push não enviado.");
    return false;
  }

  let subscription: PushSubscriptionJSON;
  try {
    subscription = JSON.parse(subscriptionJson) as PushSubscriptionJSON;
  } catch {
    return false;
  }

  if (!subscription.endpoint) return false;

  // Usar web-push para assinar e enviar
  try {
    const webpush = await import("web-push");
    webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);

    await webpush.sendNotification(
      subscription as Parameters<typeof webpush.sendNotification>[0],
      JSON.stringify({
        title: payload.title,
        body:  payload.body,
        url:   payload.url  ?? "/dashboard",
        tag:   payload.tag  ?? "bob-round",
      }),
    );
    return true;
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 410 || status === 404) {
      // Subscription expirada — limpar do banco
      console.info("[BOB/push] Subscription expirada, limpando.");
    } else {
      console.error("[BOB/push] Erro ao enviar push:", err);
    }
    return false;
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Autenticação: cron secret OU admin via sessão
  const secret     = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");

  let isAuthorized = secret && authHeader === `Bearer ${secret}`;

  if (!isAuthorized) {
    // Verificar se é admin via sessão
    const cookieStore = await cookies();
    const supabase    = await createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();

    if (user?.email) {
      const dbUser = await prisma.user.findUnique({
        where:  { email: user.email.toLowerCase() },
        select: { role: true, active: true },
      });
      isAuthorized = dbUser?.active && dbUser?.role === "ADMIN";
    }
  }

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: PushPayload;
  try {
    payload = (await request.json()) as PushPayload;
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  if (!payload.title || !payload.body) {
    return NextResponse.json({ error: "title e body são obrigatórios." }, { status: 400 });
  }

  // Buscar usuários com subscription ativa
  const where = payload.userId
    ? { email: payload.userId.toLowerCase(), active: true }
    : { active: true };

  const users = await prisma.user.findMany({
    where: { ...where, pushSubscription: { not: null } },
    select: { email: true, pushSubscription: true },
  });

  if (users.length === 0) {
    return NextResponse.json({
      ok:      false,
      message: "Nenhum usuário com subscription ativa encontrada.",
      sent:    0,
    });
  }

  let sent    = 0;
  let expired = 0;

  for (const user of users) {
    if (!user.pushSubscription) continue;

    const success = await sendWebPush(user.pushSubscription, payload);
    if (success) {
      sent++;
    } else {
      expired++;
      // Limpar subscriptions expiradas
      await prisma.user.update({
        where: { email: user.email },
        data:  { pushSubscription: null },
      }).catch(() => { /* não bloquear se falhar */ });
    }
  }

  return NextResponse.json({
    ok:           true,
    total:        users.length,
    sent,
    expired,
    timestamp:    new Date().toISOString(),
  });
}
