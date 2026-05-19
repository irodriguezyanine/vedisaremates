import { SITE } from "@/lib/site-config";

type MailShellParams = {
  siteOrigin: string;
  title: string;
  subtitle?: string;
  intro?: string;
  contentHtml: string;
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  showSupport?: boolean;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatClp(value: number): string {
  const amount = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  return amount.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

export function toPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildMailShell({
  siteOrigin,
  title,
  subtitle,
  intro,
  contentHtml,
  primaryCta,
  secondaryCta,
  showSupport = true,
}: MailShellParams): string {
  const logoUrl = `${siteOrigin}/vedisa-logo-navbar.png`;
  const safeTitle = escapeHtml(title);
  const safeSubtitle = subtitle ? escapeHtml(subtitle) : "";
  const safeIntro = intro ? escapeHtml(intro) : "";
  const waSupport = `${SITE.whatsappHref}?text=${encodeURIComponent("Hola, necesito ayuda con mi cuenta y/o mis ofertas en VEDISA Remates.")}`;

  const ctaHtml =
    primaryCta || secondaryCta
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;">
          <tr>
            ${
              primaryCta
                ? `<td style="padding:0 8px 8px 0;">
                     <a href="${primaryCta.href}" style="display:inline-block;background:#009ade;color:#ffffff;text-decoration:none;padding:11px 16px;border-radius:8px;font-weight:700;">${escapeHtml(primaryCta.label)}</a>
                   </td>`
                : ""
            }
            ${
              secondaryCta
                ? `<td style="padding:0 0 8px;">
                     <a href="${secondaryCta.href}" style="display:inline-block;background:#0f3d5c;color:#ffffff;text-decoration:none;padding:11px 16px;border-radius:8px;font-weight:700;">${escapeHtml(secondaryCta.label)}</a>
                   </td>`
                : ""
            }
          </tr>
        </table>`
      : "";

  const supportHtml = showSupport
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;border:1px solid #dbeafe;background:#f8fbff;border-radius:10px;">
        <tr>
          <td style="padding:12px 14px 8px;font-size:15px;font-weight:800;color:#1e3a8a;">Contacto y soporte</td>
        </tr>
        <tr>
          <td style="padding:0 14px 14px;font-size:13px;line-height:1.6;color:#334155;">
            WhatsApp: <a href="${waSupport}" style="color:#0369a1;font-weight:700;text-decoration:none;">${SITE.contactPhoneDisplay}</a><br/>
            Correo de pagos: <a href="mailto:${SITE.pagosEmail}" style="color:#0369a1;font-weight:700;text-decoration:none;">${SITE.pagosEmail}</a>
          </td>
        </tr>
      </table>`
    : "";

  return `
    <div style="margin:0;background:#f3f7fb;padding:24px 12px;font-family:Arial,sans-serif;color:#0f1f2c;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f2;border-radius:14px;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(90deg,#0f2f49,#0f3d5c);padding:18px 22px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td style="vertical-align:top;padding-right:12px;">
                  <div style="font-size:31px;line-height:1.15;color:#ffffff;font-weight:900;margin:0;">${safeTitle}</div>
                  ${safeSubtitle ? `<div style="font-size:14px;color:#cfe9ff;margin-top:6px;">${safeSubtitle}</div>` : ""}
                </td>
                <td style="width:220px;text-align:right;vertical-align:middle;">
                  <img src="${logoUrl}" alt="${SITE.name}" width="200" style="display:inline-block;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;" />
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:22px;">
            ${safeIntro ? `<p style="margin:0 0 14px;font-size:15px;color:#334155;">${safeIntro}</p>` : ""}
            ${ctaHtml}
            ${contentHtml}
            ${supportHtml}
          </td>
        </tr>
      </table>
    </div>
  `;
}
