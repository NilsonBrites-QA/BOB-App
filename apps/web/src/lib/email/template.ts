/**
 * Template base de email — shell HTML único reutilizado por todas as
 * notificações do BOB. Mantém visual consistente, evita duplicação de
 * ~50 linhas de boilerplate por arquivo, e centraliza:
 *   - Branding (cores, logo, fontes)
 *   - Estrutura table-based (compatibilidade Outlook/Gmail/clientes legados)
 *   - Footer com aviso "não é casa de apostas"
 *
 * Cada email só precisa fornecer o `bodyHtml` via `renderEmailShell()`.
 */

const BRAND = {
  bgPage: "#0a1410",
  bgCard: "#11201a",
  border: "rgba(232,239,233,0.16)",
  borderSoft: "rgba(232,239,233,0.08)",
  textBody: "#e8efe9",
  textMuted: "#88a092",
  accent: "#14854f",
  accentLight: "#1aa564",
  warning: "#d97706",
  warningBg: "#1f1808",
  warningBorder: "#7a4a0a",
  danger: "#dc2626",
  dangerBg: "#1f0808",
  dangerBorder: "#7a0a0a",
};

export type EmailVariant = "info" | "warning" | "danger";

/**
 * Envolve o `bodyHtml` no shell HTML do BOB (header, gradient, card, footer).
 *
 * @param kicker  Texto pequeno acima do título (ex: "BOB · Big Odds")
 * @param title   Título grande do email (com emoji opcional)
 * @param variant Define cor do header (info=verde padrão, warning=âmbar, danger=vermelho)
 * @param bodyHtml HTML do conteúdo principal (use os helpers como `paragraph()`, `button()`, etc)
 */
export function renderEmailShell(params: {
  kicker: string;
  title: string;
  bodyHtml: string;
  variant?: EmailVariant;
}): string {
  const { kicker, title, bodyHtml, variant = "info" } = params;

  const headerGradient =
    variant === "warning"
      ? "linear-gradient(135deg,#92400e,#d97706)"
      : variant === "danger"
      ? "linear-gradient(135deg,#7f1d1d,#dc2626)"
      : "linear-gradient(135deg,#14854f,#1aa564)";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bgPage};font-family:system-ui,-apple-system,Segoe UI,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${BRAND.bgPage};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${BRAND.bgCard};border:1px solid ${BRAND.border};border-radius:14px;overflow:hidden;">

        <tr><td style="background:${headerGradient};padding:24px 28px;color:#fff;">
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.85)">${escapeHtml(kicker)}</p>
          <h1 style="margin:6px 0 0 0;font-size:22px;font-weight:700;color:#fff;line-height:1.3;">${escapeHtml(title)}</h1>
        </td></tr>

        <tr><td style="padding:28px;color:${BRAND.textBody};font-size:15px;line-height:1.65;">
          ${bodyHtml}
        </td></tr>

        <tr><td style="background:${BRAND.bgPage};padding:16px 28px;border-top:1px solid ${BRAND.borderSoft};">
          <p style="margin:0;font-size:11px;color:${BRAND.textMuted};text-align:center;line-height:1.6;">
            BOB · análise esportiva · não é casa de apostas.<br/>
            Você recebeu este email porque tem acesso ao painel BOB.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Helpers de body (retornam strings de HTML inline) ────────────────────

export function paragraph(html: string, opts?: { muted?: boolean; mb?: number }): string {
  const mb = opts?.mb ?? 16;
  const color = opts?.muted ? BRAND.textMuted : BRAND.textBody;
  const fontSize = opts?.muted ? "13px" : "15px";
  return `<p style="margin:0 0 ${mb}px 0;font-size:${fontSize};line-height:1.65;color:${color};">${html}</p>`;
}

export function button(params: { href: string; label: string; variant?: EmailVariant }): string {
  const { href, label, variant = "info" } = params;
  const bg =
    variant === "warning" ? BRAND.warning :
    variant === "danger" ? BRAND.danger :
    BRAND.accent;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px auto 16px auto;">
    <tr><td style="background:${bg};border-radius:10px;">
      <a href="${escapeAttr(href)}" style="display:inline-block;padding:14px 32px;color:#fff;font-weight:600;font-size:15px;text-decoration:none;">
        ${escapeHtml(label)}
      </a>
    </td></tr>
  </table>`;
}

export function fallbackLink(href: string): string {
  return `<p style="margin:8px 0 16px 0;font-size:12px;line-height:1.6;color:${BRAND.textMuted};text-align:center;">
    Ou cole no navegador:<br/><a href="${escapeAttr(href)}" style="color:${BRAND.accentLight};word-break:break-all;">${escapeHtml(href)}</a>
  </p>`;
}

/** Caixa de credenciais — destaca uma senha temporária ou código. */
export function credentialBox(params: { label: string; value: string }): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 20px 0;background:rgba(20,133,79,0.12);border:1px solid rgba(20,133,79,0.4);border-radius:10px;">
    <tr><td style="padding:16px 20px;">
      <p style="margin:0 0 6px 0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.textMuted};">${escapeHtml(params.label)}</p>
      <p style="margin:0;font-size:18px;font-weight:700;font-family:Menlo,Consolas,monospace;color:${BRAND.accentLight};letter-spacing:0.05em;word-break:break-all;">${escapeHtml(params.value)}</p>
    </td></tr>
  </table>`;
}

/** Caixa de alerta — warning ou danger, com ícone e texto destacado. */
export function alertBox(params: { html: string; variant?: EmailVariant }): string {
  const { html, variant = "warning" } = params;
  const bg = variant === "danger" ? BRAND.dangerBg : BRAND.warningBg;
  const border = variant === "danger" ? BRAND.dangerBorder : BRAND.warningBorder;
  const fg = variant === "danger" ? "#fca5a5" : "#fbbf24";
  const icon = variant === "danger" ? "🚨" : "⚠️";
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 20px 0;background:${bg};border:1px solid ${border};border-radius:10px;">
    <tr><td style="padding:14px 18px;">
      <p style="margin:0;font-size:13px;line-height:1.6;color:${fg};">
        <span style="font-size:16px;">${icon}</span> ${html}
      </p>
    </td></tr>
  </table>`;
}

export function divider(): string {
  return `<hr style="border:none;border-top:1px solid ${BRAND.borderSoft};margin:24px 0;">`;
}

// ─── Escape helpers ───────────────────────────────────────────────────────

function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(input: string): string {
  return escapeHtml(input);
}
