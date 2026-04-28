/**
 * Email — "Senha resetada pelo administrador"
 *
 * Disparado quando um admin clica 🔑 Reset no /admin.
 * Contém:
 *   - Aviso amigável
 *   - Senha temporária em destaque (credentialBox)
 *   - Botão "Entrar com senha temporária"
 *   - Aviso forte: TROCA OBRIGATÓRIA no próximo login
 *   - Aviso de segurança: se não foi você, contate o admin
 */

import { renderEmailShell, paragraph, button, credentialBox, alertBox, divider, fallbackLink } from "./template";
import { sendEmail, getAppUrl, type SendResult } from "./send";

export async function sendPasswordResetByAdminEmail(params: {
  to: string;
  temporaryPassword: string;
  adminEmail?: string;
  appUrl?: string;
}): Promise<SendResult> {
  const appUrl = getAppUrl(params.appUrl);
  const loginUrl = `${appUrl}/login`;
  const subject = "🔑 Sua senha do BOB foi resetada";

  const adminLine = params.adminEmail
    ? `<strong>${params.adminEmail}</strong> (administrador)`
    : "um administrador";

  const html = renderEmailShell({
    kicker: "BOB · Segurança da conta",
    title: "Sua senha foi resetada 🔑",
    variant: "warning",
    bodyHtml: [
      paragraph("Olá!"),
      paragraph(
        `${adminLine} resetou a senha da sua conta no <strong>BOB · Big Odds Brasileirão</strong>. ` +
        "Use a senha temporária abaixo para entrar e definir uma nova senha pessoal.",
      ),
      credentialBox({ label: "Senha temporária", value: params.temporaryPassword }),
      button({ href: loginUrl, label: "Entrar no BOB →", variant: "warning" }),
      fallbackLink(loginUrl),
      alertBox({
        variant: "warning",
        html:
          "<strong>Troca obrigatória:</strong> assim que você entrar com essa senha temporária, " +
          "será solicitado que defina uma nova senha pessoal. Esta senha temporária não funcionará " +
          "depois disso.",
      }),
      divider(),
      paragraph(
        "<strong>Não foi você que solicitou?</strong> Pode ser que outro admin tenha resetado por engano, " +
        "ou alguém com acesso de admin agiu sem sua autorização. " +
        "Entre em contato com o admin do BOB imediatamente e troque sua senha assim que conseguir entrar.",
        { muted: true },
      ),
    ].join("\n"),
  });

  const text = `Sua senha do BOB foi resetada

Olá! ${params.adminEmail ? params.adminEmail + " (administrador)" : "Um administrador"} resetou sua senha no BOB · Big Odds Brasileirão.

Senha temporária: ${params.temporaryPassword}

Para entrar, acesse: ${loginUrl}

⚠ TROCA OBRIGATÓRIA: ao entrar com essa senha, você será obrigado(a) a definir uma nova senha pessoal antes de acessar o painel.

Não foi você que solicitou? Contate o admin do BOB imediatamente.

— BOB · análise esportiva, não é casa de apostas.`;

  return sendEmail({ to: params.to, subject, html, text });
}
