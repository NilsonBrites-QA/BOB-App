/**
 * Wrapper sobre a API REST do Resend.
 * Centraliza envio: fetch, headers, tratamento de erro, RESEND_API_KEY,
 * RESEND_FROM defaults. Todos os senders concretos chamam `sendEmail()`.
 *
 * Se RESEND_API_KEY ausente, retorna `{ ok: false, skipped: true }` sem lançar
 * — fluxos chamadores tratam como warning, não como erro fatal.
 */

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string }
  | { ok: false; skipped: true; error: "missing-api-key" };

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim() || "BOB <onboarding@resend.dev>";

  if (!apiKey) {
    return { ok: false, skipped: true, error: "missing-api-key" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
        ...(params.replyTo ? { reply_to: params.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${body}` };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id ?? "unknown" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** URL da app, padronizada (sem barra final). */
export function getAppUrl(override?: string): string {
  const raw =
    override ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://bob-app.vercel.app";
  return raw.replace(/\/$/, "");
}
