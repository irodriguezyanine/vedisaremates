import { NextResponse } from "next/server";

import { sendSesEmail } from "@/lib/mail/ses";
import { SITE } from "@/lib/site-config";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const WINDOW_MS = 20 * 60 * 1000;
const LIMIT_PER_EMAIL = 4;
const hitsByEmail = new Map<string, number[]>();

function normalizeEmail(raw: unknown) {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

function sanitizeOrigin(origin: string) {
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" && u.hostname !== "localhost") return null;
    return u.origin;
  } catch {
    return null;
  }
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

function buildMail(actionLink: string) {
  const wa = `${SITE.whatsappHref}?text=${encodeURIComponent("Hola, quiero enviar mi comprobante de garantía para habilitar mi cuenta.")}`;
  return {
    subject: "Enlace de acceso/verificación · VEDISA Remates",
    text: [
      "Solicitaste reenviar tu enlace de verificación/acceso.",
      actionLink,
      "",
      "Recuerda constituir tu garantía para participar en remates.",
      `Monto de garantía: ${SITE.guaranteeAmountDisplay}`,
      `WhatsApp: ${wa}`,
      `Correo de pagos: ${SITE.pagosEmail}`,
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937;max-width:640px;margin:0 auto;">
        <h2 style="margin:0 0 16px;color:#0f3d5c;">${SITE.name}</h2>
        <p>Recibimos una solicitud para reenviar tu enlace de verificación/acceso.</p>
        <p style="margin:20px 0;">
          <a href="${actionLink}" style="background:#009ade;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;display:inline-block;">
            Abrir enlace seguro
          </a>
        </p>
        <p style="font-size:13px;word-break:break-all;"><a href="${actionLink}">${actionLink}</a></p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
        <p>Para participar en remates debes constituir garantía (${SITE.guaranteeAmountDisplay}) y enviar comprobante:</p>
        <p>
          <a href="${wa}" style="color:#0f766e;font-weight:700;">Enviar comprobante por WhatsApp</a><br/>
          <a href="mailto:${SITE.pagosEmail}" style="color:#0f766e;font-weight:700;">Enviar por correo (${SITE.pagosEmail})</a>
        </p>
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

  const origin =
    sanitizeOrigin(typeof body.origin === "string" ? body.origin : "") ??
    sanitizeOrigin(process.env.NEXT_PUBLIC_SITE_URL ?? "") ??
    "https://vedisaremates.vercel.app";

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: `${origin}/ingreso?verified=1`,
    },
  });

  if (error) return responseOk();
  const actionLink = data?.properties?.action_link;
  if (!actionLink) return responseOk();

  const mail = buildMail(actionLink);
  const sent = await sendSesEmail({
    to: email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
  if (!sent.ok) return NextResponse.json({ ok: false, error: "mail_no_enviado" }, { status: 502 });
  return responseOk();
}
