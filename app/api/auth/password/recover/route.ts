import { NextResponse } from "next/server";

import { sendSesEmail } from "@/lib/mail/ses";
import { SITE } from "@/lib/site-config";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const WINDOW_MS = 20 * 60 * 1000;
const LIMIT_PER_IDENTIFIER = 4;
const DEFAULT_SITE_ORIGIN = "https://vedisaremates-mu.vercel.app";

const hitsByIdentifier = new Map<string, number[]>();

function normalizeIdentifier(raw: unknown) {
  if (typeof raw !== "string") return "";
  return raw.trim();
}

function markAndCount(identifier: string) {
  const now = Date.now();
  const list = (hitsByIdentifier.get(identifier) ?? []).filter((t) => now - t <= WINDOW_MS);
  list.push(now);
  hitsByIdentifier.set(identifier, list);
  return list.length;
}

function responseOk() {
  return NextResponse.json({
    ok: true,
    message: "Si la cuenta existe, enviamos un enlace seguro para restablecer la contraseña.",
  });
}

function isClienteRemateRole(rol: unknown) {
  const value = String(rol ?? "").trim().toLowerCase();
  return value === "cliente-remate" || value === "cliente_remate" || value === "cliente remate";
}

function buildMail(actionLink: string, siteOrigin: string) {
  const logoUrl = `${siteOrigin}/vedisa-logo-navbar.png`;
  const subject = "Restablece tu contraseña · VEDISA Remates";
  const text = [
    "Recibimos una solicitud para restablecer tu contraseña en VEDISA Remates.",
    "Abre este enlace seguro para elegir una nueva contraseña:",
    actionLink,
    "",
    "Si no solicitaste este cambio, ignora este correo.",
    "Nunca compartas tu contraseña por correo, WhatsApp o teléfono.",
  ].join("\n");
  const html = `
    <div style="margin:0;background:#f3f7fb;padding:24px 12px;font-family:Arial,sans-serif;color:#0f1f2c;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f2;border-radius:14px;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(90deg,#0f2f49,#0f3d5c);padding:18px 22px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td style="vertical-align:top;padding-right:12px;">
                  <div style="font-size:28px;line-height:1.15;color:#ffffff;font-weight:900;margin:0;">Cambio de contraseña</div>
                  <div style="font-size:14px;color:#cfe9ff;margin-top:6px;">Acceso seguro a tu cuenta de remates.</div>
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
            <p style="margin:0 0 12px;font-size:15px;color:#334155;">
              Recibimos una solicitud para restablecer tu contraseña.
            </p>
            <p style="margin:0 0 18px;">
              <a href="${actionLink}" style="display:inline-block;background:#009ade;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;">
                Restablecer contraseña
              </a>
            </p>
            <p style="margin:0 0 4px;font-size:12px;color:#64748b;">Si el botón no funciona, copia este enlace:</p>
            <p style="margin:0 0 16px;font-size:12px;word-break:break-all;">
              <a href="${actionLink}" style="color:#0369a1;">${actionLink}</a>
            </p>
            <p style="margin:0;font-size:12px;color:#64748b;">
              Si no solicitaste este cambio, ignora este correo. Nunca compartas tu contraseña por ningún canal.
            </p>
          </td>
        </tr>
      </table>
    </div>
  `;
  return { subject, text, html };
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "json_invalido" }, { status: 400 });
  }

  const identifier = normalizeIdentifier(body.identifier);
  if (!identifier) {
    return NextResponse.json({ ok: false, error: "identificador_requerido" }, { status: 400 });
  }

  if (markAndCount(identifier.toLowerCase()) > LIMIT_PER_IDENTIFIER) {
    return NextResponse.json({ ok: false, error: "demasiados_reintentos" }, { status: 429 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "auth_admin_no_configurado" }, { status: 500 });

  let email = "";
  let role: string | null = null;

  if (EMAIL_RE.test(identifier)) {
    email = identifier.toLowerCase();
  } else {
    const { data: profile } = await admin
      .from("profiles")
      .select("id, rol")
      .ilike("username", identifier)
      .maybeSingle<{ id: string | null; rol: string | null }>();

    if (!profile?.id) return responseOk();
    role = profile.rol;

    const { data: userData, error } = await admin.auth.admin.getUserById(profile.id);
    const resolved = userData?.user?.email?.trim().toLowerCase();
    if (error || !resolved) return responseOk();
    email = resolved;
  }

  if (role && !isClienteRemateRole(role)) return responseOk();
  if (!email) return responseOk();

  const siteOrigin = DEFAULT_SITE_ORIGIN;
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo: `${siteOrigin}/restablecer-clave`,
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
