import { NextResponse } from "next/server";

import { sendSesEmail } from "@/lib/mail/ses";
import { SITE } from "@/lib/site-config";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const WINDOW_MS = 20 * 60 * 1000;
const LIMIT_PER_EMAIL = 4;
const DEFAULT_SITE_ORIGIN = "https://vedisaremates-mu.vercel.app";
const hitsByEmail = new Map<string, number[]>();

function normalizeEmail(raw: unknown) {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

function markAndCount(email: string) {
  const now = Date.now();
  const list = (hitsByEmail.get(email) ?? []).filter((t) => now - t <= WINDOW_MS);
  list.push(now);
  hitsByEmail.set(email, list);
  return list.length;
}

function responseOk() {
  return NextResponse.json({
    ok: true,
    message:
      "Si el correo existe, reenviamos un enlace de verificación/ingreso y recordatorio para constituir tu garantía.",
  });
}

function buildMail(actionLink: string, siteOrigin: string) {
  const wa = `${SITE.whatsappHref}?text=${encodeURIComponent("Hola, quiero enviar mi comprobante de garantía para habilitar mi cuenta.")}`;
  const paymentLink = "https://www.tuu.cl/vedisaremates";
  const logoUrl = `${siteOrigin}/vedisa-logo-navbar.png`;
  return {
    subject: "Enlace de acceso/verificación · VEDISA Remates",
    text: [
      "Solicitaste reenviar tu enlace de verificación/acceso.",
      actionLink,
      "",
      "Recuerda constituir tu garantía para participar en remates.",
      `Monto de garantía: ${SITE.guaranteeAmountDisplay}`,
      "",
      "Pago con tarjeta:",
      paymentLink,
      "(Usa el mismo nombre y correo registrados en VEDISA Remates).",
      "",
      "Transferencia bancaria:",
      "VEDISA REMATES LIMITADA",
      "RUT: 76.114.336-0",
      "CUENTA CORRIENTE: 08490043006",
      "BANCO: BANCO DE CHILE",
      "Correo: PAGOS@VEDISAREMATES.CL",
      "",
      `WhatsApp: ${wa}`,
      `Correo de pagos: ${SITE.pagosEmail}`,
      "Tiempo de habilitación aproximado: menos de 1 hora en horario laboral.",
    ].join("\n"),
    html: `
      <div style="margin:0;background:#f3f7fb;padding:24px 12px;font-family:Arial,sans-serif;color:#0f1f2c;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f2;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(90deg,#0f2f49,#0f3d5c);padding:18px 22px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:top;padding-right:12px;">
                    <div style="font-size:29px;line-height:1.15;color:#ffffff;font-weight:900;margin:0;">Enlace seguro</div>
                    <div style="font-size:14px;color:#cfe9ff;margin-top:6px;">Reenvío de verificación y acceso.</div>
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
              <p style="margin:0 0 12px;font-size:15px;color:#334155;">Recibimos una solicitud para reenviar tu enlace de verificación/acceso.</p>
              <p style="margin:0 0 18px;">
                <a href="${actionLink}" style="display:inline-block;background:#009ade;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;">
                  Abrir enlace seguro
                </a>
              </p>
              <p style="margin:0 0 4px;font-size:12px;color:#64748b;">Si el botón no funciona, copia este enlace:</p>
              <p style="margin:0 0 18px;font-size:12px;word-break:break-all;"><a href="${actionLink}" style="color:#0369a1;">${actionLink}</a></p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #d1e9f7;background:#f8fcff;border-radius:10px;">
                <tr>
                  <td style="padding:12px 14px 8px;font-size:15px;font-weight:800;color:#0f3d5c;">Opciones de pago de garantía</td>
                </tr>
                <tr>
                  <td style="padding:0 14px 14px;">
                    <p style="margin:0 0 8px;font-size:14px;color:#1e293b;">
                      <strong>Pago con tarjeta:</strong>
                      <a href="${paymentLink}" style="color:#0369a1;font-weight:700;text-decoration:none;margin-left:6px;">${paymentLink}</a>
                    </p>
                    <p style="margin:0 0 10px;font-size:13px;color:#475569;">
                      Importante: usa el mismo nombre y correo registrados en tu cuenta de VEDISA Remates.
                    </p>
                    <p style="margin:0 0 4px;font-size:14px;color:#1e293b;"><strong>Transferencia bancaria:</strong></p>
                    <p style="margin:0;font-size:13px;line-height:1.6;color:#334155;">
                      <strong>VEDISA REMATES LIMITADA</strong><br/>
                      RUT: 76.114.336-0<br/>
                      Cuenta Corriente: 08490043006<br/>
                      Banco de Chile<br/>
                      Correo: pagos@vedisaremates.cl
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;">
                <tr>
                  <td style="padding:0 0 8px;">
                    <a href="${wa}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;font-size:14px;font-weight:700;">Enviar comprobante por WhatsApp</a>
                  </td>
                </tr>
                <tr>
                  <td style="font-size:14px;">
                    <a href="mailto:${SITE.pagosEmail}" style="color:#0f766e;font-weight:700;text-decoration:none;">Enviar comprobante por correo (${SITE.pagosEmail})</a>
                  </td>
                </tr>
              </table>

              <p style="margin:10px 0 0;font-size:13px;color:#0f3d5c;">
                Tiempo de habilitación aproximado: <strong>menos de 1 hora en horario laboral</strong>.
              </p>
            </td>
          </tr>
        </table>
      </div>
    `,
  };
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "json_invalido" }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "email_invalido" }, { status: 400 });
  }

  if (markAndCount(email) > LIMIT_PER_EMAIL) {
    return NextResponse.json({ ok: false, error: "demasiados_reintentos" }, { status: 429 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "auth_admin_no_configurado" }, { status: 500 });

  const siteOrigin = DEFAULT_SITE_ORIGIN;

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: `${siteOrigin}/?verified=1`,
    },
  });

  if (error) return responseOk();
  const actionLink = data?.properties?.action_link;
  if (!actionLink) return responseOk();

  const mail = buildMail(actionLink, siteOrigin);
  const sent = await sendSesEmail({
    to: email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
  if (!sent.ok) return NextResponse.json({ ok: false, error: "mail_no_enviado" }, { status: 502 });
  return responseOk();
}
