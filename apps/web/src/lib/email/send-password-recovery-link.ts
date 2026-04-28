/**
 * Email — "Link de recuperação de senha"
 *
 * Disparado quando o usuário clica "Esqueci minha senha" em /auth/recover.
 * Recebe `recoveryLink` gerado pelo `supabase.auth.admin.generateLink({type:'recovery'})`.
 *
 * O link valida sessão no /auth/confirm e leva pra /conta/senha onde o user
 * define nova senha.
 */

import { renderEmailShell, paragraph, button, alertBox, fallbackLink, divider } from "./template";
import { sendEmail, type SendResult } from "./send";

export async function sendPasswordRecoveryLinkEmail(params: {
  to: string;
  recoveryLink: string;
  /** Tempo de expiração do link, em horas. Apenas informativo. Padrão: 1 hora (default Supabase). */
  expiresInHours?: number;
}): Promise<SendResult> {
  const expires = params.expiresInHours ?? 1;
  const subject = "🔐 Recuperação de senha — BOB";

  const html = renderEmailShell({
    kicker: "BOB · Recuperação de acesso",
    title: "Recupere o acesso à sua conta 🔐",
    bodyHtml: [
      paragraph("Olá!"),
      paragraph(
        "Recebemos um pedido para recuperar a senha da sua conta no <strong>BOB · Big Odds Brasileirão</strong>. " +
        "Clique no botão abaixo para definir uma nova senha:",
      ),
      button({ href: params.recoveryLink, label: "Definir nova senha →" }),
      fallbackLink(params.recoveryLink),
      alertBox({
        variant: "warning",
        html: `Este link expira em <strong>${expires} hora${expires === 1 ? "" : "s"}</strong> e só pode ser usado uma vez.`,
      }),
      divider(),
      paragraph(
        "<strong>Não foi você que pediu?</strong> Você pode ignorar este email — sua senha atual continua válida. " +
        "Se receber este email com frequência sem ter pedido, fale com o admin do BOB.",
        { muted: true },
      ),
    ].join("\n"),
  });

  const text = `Recuperação de senha — BOB

Olá! Recebemos um pedido para recuperar a senha da sua conta no BOB · Big Odds Brasileirão.

Para definir uma nova senha, acesse: ${params.recoveryLink}

Este link expira em ${expires} hora${expires === 1 ? "" : "s"} e só pode ser usado uma vez.

Não foi você que pediu? Pode ignorar este email — sua senha atual continua válida.

— BOB · análise esportiva, não é casa de apostas.`;

  return sendEmail({ to: params.to, subject, html, text });
}
