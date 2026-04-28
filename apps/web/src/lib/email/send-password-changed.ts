/**
 * Email — "Sua senha foi alterada"
 *
 * Notificação de segurança disparada após troca bem-sucedida em /conta/senha.
 * Não contém credenciais — apenas confirma a alteração e dá um caminho de
 * escape se a alteração não foi legítima.
 *
 * Este é um padrão padrão de bancos/serviços corporativos: o user deve ser
 * SEMPRE notificado quando algo crítico muda na conta dele.
 */

import { renderEmailShell, paragraph, alertBox, divider } from "./template";
import { sendEmail, getAppUrl, type SendResult } from "./send";

export async function sendPasswordChangedEmail(params: {
  to: string;
  /** Quando a alteração ocorreu. Padrão: agora. */
  changedAt?: Date;
  appUrl?: string;
}): Promise<SendResult> {
  const changedAt = params.changedAt ?? new Date();
  const appUrl = getAppUrl(params.appUrl);
  const subject = "✅ Sua senha do BOB foi alterada";

  const formattedDate = changedAt.toLocaleString("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });

  const html = renderEmailShell({
    kicker: "BOB · Segurança da conta",
    title: "Senha alterada com sucesso ✅",
    bodyHtml: [
      paragraph("Olá!"),
      paragraph(
        `A senha da sua conta no <strong>BOB · Big Odds Brasileirão</strong> foi alterada em ` +
        `<strong>${formattedDate}</strong>.`,
      ),
      paragraph(
        "A nova senha já está ativa. Use ela no próximo login.",
        { mb: 24 },
      ),
      divider(),
      alertBox({
        variant: "danger",
        html:
          "<strong>Não foi você que alterou?</strong> Sua conta pode estar comprometida. " +
          `Acesse <a href="${appUrl}/auth/recover" style="color:#fca5a5;text-decoration:underline;">recuperar senha</a> ` +
          "imediatamente e contate o admin do BOB.",
      }),
      paragraph(
        "Por segurança, sempre que sua senha for alterada (por você, pelo recurso 'esqueci minha senha', " +
        "ou por um administrador), enviamos um email como este.",
        { muted: true },
      ),
    ].join("\n"),
  });

  const text = `Senha alterada com sucesso

A senha da sua conta no BOB · Big Odds Brasileirão foi alterada em ${formattedDate}.

A nova senha já está ativa.

🚨 NÃO FOI VOCÊ? Sua conta pode estar comprometida.
Acesse ${appUrl}/auth/recover imediatamente e contate o admin do BOB.

Por segurança, sempre que sua senha for alterada, enviamos um email como este.

— BOB · análise esportiva, não é casa de apostas.`;

  return sendEmail({ to: params.to, subject, html, text });
}
