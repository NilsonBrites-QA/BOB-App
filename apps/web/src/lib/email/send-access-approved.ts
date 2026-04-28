/**
 * Email — "Acesso liberado no BOB"
 *
 * Disparado quando um admin libera acesso para um usuário (em access-actions:
 * grantUserAccess, createUserWithPassword, ou toggleUserAccess reativando).
 *
 * Refatorado para usar o template comum (./template.ts + ./send.ts).
 * O fluxo de login é por email + senha (não OTP) — o texto reflete isso.
 */

import { renderEmailShell, paragraph, button, fallbackLink, divider } from "./template";
import { sendEmail, getAppUrl, type SendResult } from "./send";

// Re-exportado para compatibilidade com chamadores que tipam o retorno.
export type { SendResult };

export async function sendAccessApprovedEmail(params: {
  to: string;
  appUrl?: string;
}): Promise<SendResult> {
  const appUrl = getAppUrl(params.appUrl);
  const loginUrl = `${appUrl}/login`;
  const subject = "✅ Seu acesso ao BOB foi liberado";

  const html = renderEmailShell({
    kicker: "BOB · Big Odds",
    title: "Seu acesso foi liberado 🎯",
    bodyHtml: [
      paragraph("Olá!"),
      paragraph(
        "Seu acesso ao painel do <strong>BOB · Big Odds Brasileirão</strong> foi aprovado pelo administrador. " +
        "Agora você pode fazer login a qualquer momento e ver as variações da rodada, âncoras e apostas prontas.",
      ),
      paragraph(
        "O administrador deve ter te enviado a senha inicial em separado (mensagem, telefone, etc). " +
        "Caso ainda não tenha, peça a ele.",
      ),
      button({ href: loginUrl, label: "Entrar no BOB →" }),
      fallbackLink(loginUrl),
      divider(),
      paragraph(
        "Esqueceu a senha? Na tela de login, clique em <strong>\"Esqueci minha senha\"</strong> " +
        "para receber um link de recuperação por email.",
        { muted: true },
      ),
    ].join("\n"),
  });

  const text = `Seu acesso ao BOB foi liberado!

Olá! Seu acesso ao painel BOB · Big Odds Brasileirão foi aprovado pelo administrador.

Para entrar, acesse: ${loginUrl}

O administrador deve ter te enviado a senha inicial em separado. Caso ainda não tenha, peça a ele.

Esqueceu a senha? Na tela de login, use a opção "Esqueci minha senha".

— BOB · análise esportiva, não é casa de apostas.`;

  return sendEmail({ to: params.to, subject, html, text });
}
