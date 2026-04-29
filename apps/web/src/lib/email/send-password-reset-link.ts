/**
 * Email — "Sua senha foi resetada — crie uma nova senha"
 *
 * Disparado quando admin reseta usando o modo "link" (mais seguro):
 * usuário recebe link Supabase recovery e define sua própria senha.
 *
 * Diferente do `send-password-recovery-link` (que é solicitado pelo próprio
 * user via "Esqueci minha senha"), este avisa que **outro usuário (admin)**
 * iniciou o reset — mais um sinal de auditoria pro destinatário.
 */

import { renderEmailShell, paragraph, button, alertBox, divider, fallbackLink } from "./template";
import { sendEmail, type SendResult } from "./send";

export async function sendPasswordResetLinkEmail(params: {
  to: string;
  resetLink: string;
  adminEmail?: string;
  /** Tempo de expiração do link, em horas. Padrão: 1h (default Supabase). */
  expiresInHours?: number;
}): Promise<SendResult> {
  const expires = params.expiresInHours ?? 1;
  const subject = "🔑 Sua senha do BOB foi resetada";

  const adminLine = params.adminEmail
    ? `<strong>${params.adminEmail}</strong> (administrador)`
    : "um administrador";

  const html = renderEmailShell({
    kicker: "BOB · Segurança da conta",
    title: "Defina uma nova senha 🔑",
    variant: "warning",
    bodyHtml: [
      paragraph("Olá!"),
      paragraph(
        `${adminLine} resetou a senha da sua conta no <strong>BOB · Big Odds Brasileirão</strong>. ` +
        "Para voltar a acessar o painel, clique no botão abaixo e escolha uma nova senha pessoal:",
      ),
      button({ href: params.resetLink, label: "Criar nova senha →", variant: "warning" }),
      fallbackLink(params.resetLink),
      alertBox({
        variant: "warning",
        html: `Este link expira em <strong>${expires} hora${expires === 1 ? "" : "s"}</strong> e só pode ser usado uma vez. ` +
              "Sua senha antiga não funciona mais.",
      }),
      divider(),
      paragraph(
        "<strong>Não foi você que solicitou?</strong> Pode ser que outro admin tenha resetado por engano, " +
        "ou alguém com acesso de admin agiu sem sua autorização. " +
        "Entre em contato com o admin do BOB imediatamente.",
        { muted: true },
      ),
    ].join("\n"),
  });

  const text = `Sua senha do BOB foi resetada

Olá! ${params.adminEmail ? params.adminEmail + " (administrador)" : "Um administrador"} resetou sua senha no BOB · Big Odds Brasileirão.

Para definir uma nova senha, acesse: ${params.resetLink}

⚠ Este link expira em ${expires} hora${expires === 1 ? "" : "s"} e só pode ser usado uma vez. Sua senha antiga não funciona mais.

Não foi você que solicitou? Contate o admin do BOB imediatamente.

— BOB · análise esportiva, não é casa de apostas.`;

  return sendEmail({ to: params.to, subject, html, text });
}
