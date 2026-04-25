/**
 * Notificação por email — "Acesso liberado no BOB"
 *
 * Usa a API REST do Resend (sem dependência adicional). 
 * Se RESEND_API_KEY não estiver configurada, retorna { skipped: true } silenciosamente.
 *
 * O usuário ainda fará login via Supabase OTP (código único enviado pelo provedor de auth).
 * Esse email é apenas a notificação amigável de que o acesso foi liberado.
 */

type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string }
  | { ok: false; skipped: true; error: "missing-api-key" };

export async function sendAccessApprovedEmail(params: {
  to: string;
  appUrl?: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim() || "BOB <onboarding@resend.dev>";
  const appUrl = (params.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://bob-app.vercel.app").replace(/\/$/, "");

  if (!apiKey) {
    return { ok: false, skipped: true, error: "missing-api-key" };
  }

  const subject = "✅ Seu acesso ao BOB foi liberado";
  const loginUrl = `${appUrl}/login`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a1410;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#0a1410;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#11201a;border:1px solid rgba(232,239,233,0.16);border-radius:14px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#14854f,#1aa564);padding:24px 28px;color:#fff;">
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.85)">BOB · Big Odds</p>
          <h1 style="margin:6px 0 0 0;font-size:22px;font-weight:700;color:#fff;">Seu acesso foi liberado 🎯</h1>
        </td></tr>
        <tr><td style="padding:28px;color:#e8efe9;">
          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">Olá!</p>
          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">
            Seu acesso ao painel do <strong>BOB · Big Odds Brasileirão</strong> foi aprovado pelo administrador.
            Agora você pode fazer login a qualquer momento e ver as variações da rodada, âncoras e apostas prontas.
          </p>
          <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;">
            Para entrar, clique no botão abaixo. Você receberá um <strong>código único de 6 dígitos por email</strong> a cada login — basta digitá-lo na tela.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr><td style="background:#14854f;border-radius:10px;">
              <a href="${loginUrl}" style="display:inline-block;padding:14px 32px;color:#fff;font-weight:600;font-size:15px;text-decoration:none;">
                Entrar no BOB →
              </a>
            </td></tr>
          </table>
          <p style="margin:24px 0 0 0;font-size:13px;line-height:1.6;color:#88a092;">
            Ou cole no navegador: <a href="${loginUrl}" style="color:#1aa564;">${loginUrl}</a>
          </p>
          <hr style="border:none;border-top:1px solid rgba(232,239,233,0.08);margin:24px 0;">
          <p style="margin:0;font-size:12px;color:#88a092;line-height:1.6;">
            <strong>Como funciona o login:</strong> ao clicar em "Solicitar código", o BOB envia um código único de 6 dígitos para seu email. Esse código vale por 1 hora e te dá acesso à plataforma.
          </p>
        </td></tr>
        <tr><td style="background:#0a1410;padding:16px 28px;border-top:1px solid rgba(232,239,233,0.08);">
          <p style="margin:0;font-size:11px;color:#88a092;text-align:center;">
            BOB · análise esportiva · não é casa de apostas.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Seu acesso ao BOB foi liberado!

Olá! Seu acesso ao painel BOB · Big Odds Brasileirão foi aprovado pelo administrador.

Para entrar, acesse: ${loginUrl}

Você receberá um código único de 6 dígitos por email a cada login. Esse código vale por 1 hora.

— BOB · análise esportiva, não é casa de apostas.`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject,
        html,
        text,
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
