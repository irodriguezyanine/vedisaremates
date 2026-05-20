import { NextResponse } from "next/server";

import { buildMailShell, toPlainText } from "@/lib/mail/templates";
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
  const subject = "Restablece tu contraseña · VEDISA Remates";
  const html = buildMailShell({
    siteOrigin,
    title: "Cambio de contraseña",
    subtitle: "Acceso seguro a tu cuenta de remates",
    intro: "Recibimos una solicitud para restablecer tu contraseña.",
    primaryCta: { label: "Restablecer contraseña", href: actionLink },
    showSupport: false,
    contentHtml: `
      <p style="margin:0 0 4px;font-size:12px;color:#64748b;">Si el botón no funciona, copia este enlace:</p>
      <p style="margin:0 0 16px;font-size:12px;word-break:break-all;">
        <a href="${actionLink}" style="color:#0369a1;">${actionLink}</a>
      </p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dbeafe;background:#f8fbff;border-radius:10px;">
        <tr>
          <td style="padding:12px 14px;font-size:13px;line-height:1.55;color:#334155;">
            Si no solicitaste este cambio, ignora este correo.<br/>
            Nunca compartas tu contraseña por correo, WhatsApp o teléfono.
          </td>
        </tr>
      </table>
      <p style="margin:12px 0 0;font-size:12px;color:#64748b;">
        Soporte WhatsApp: <a href="${SITE.whatsappHref}" style="color:#0369a1;font-weight:700;text-decoration:none;">${SITE.contactPhoneDisplay}</a>
      </p>
    `,
  });
  const text = toPlainText(html);
  return { subject, text, html };
}

function buildRecoveryEntryLink(siteOrigin: string, data: unknown, fallbackActionLink: string): string {
  const props = ((data as { properties?: Record<string, unknown> } | null)?.properties ?? {}) as Record<string, unknown>;
  const tokenHash = String(props.hashed_token ?? props.token_hash ?? "").trim();
  if (tokenHash) {
    return `${siteOrigin}/restablecer-clave?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;
  }
  return fallbackActionLink;
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

  if (error) {
    return NextResponse.json(
      { ok: false, error: "link_no_generado", detail: error.message },
      { status: 500 },
    );
  }
  const actionLink = data?.properties?.action_link;
  if (!actionLink) return NextResponse.json({ ok: false, error: "link_invalido" }, { status: 500 });
  const entryLink = buildRecoveryEntryLink(siteOrigin, data, actionLink);

  const mail = buildMail(entryLink, siteOrigin);
  const sent = await sendSesEmail({
    to: email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });

  if (!sent.ok) {
    return NextResponse.json(
      { ok: false, error: "mail_no_enviado", detail: sent.error },
      { status: 502 },
    );
  }
  return responseOk();
}
