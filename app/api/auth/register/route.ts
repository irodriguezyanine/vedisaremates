import { NextResponse } from "next/server";

import { sendSesEmail } from "@/lib/mail/ses";
import { SITE } from "@/lib/site-config";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const MAX_BODY_BYTES = 16_000;
const MIN_FORM_FILL_MS = 1_200;
const IP_WINDOW_MS = 10 * 60 * 1000;
const EMAIL_WINDOW_MS = 20 * 60 * 1000;
const IP_LIMIT = 25;
const EMAIL_LIMIT = 4;

const ipHits = new Map<string, number[]>();
const emailHits = new Map<string, number[]>();

function nowMs() {
  return Date.now();
}

function pruneAndCount(bucket: Map<string, number[]>, key: string, windowMs: number) {
  const now = nowMs();
  const values = (bucket.get(key) ?? []).filter((t) => now - t <= windowMs);
  bucket.set(key, values);
  return values.length;
}

function registerHit(bucket: Map<string, number[]>, key: string) {
  const list = bucket.get(key) ?? [];
  list.push(nowMs());
  bucket.set(key, list);
}

function normalizeEmail(raw: unknown) {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

function normalizeName(raw: unknown) {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ").slice(0, 80);
}

function isStrongPassword(password: string) {
  if (password.length < 10 || password.length > 128) return false;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  return hasUpper && hasLower && hasDigit && hasSpecial;
}

function sanitizeRedirectOrigin(origin: string) {
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const fromForwarded = forwarded.split(",")[0]?.trim();
  const fromRealIp = request.headers.get("x-real-ip")?.trim();
  return fromForwarded || fromRealIp || "unknown";
}

function genericSuccess() {
  return NextResponse.json({
    ok: true,
    message:
      "Si el correo es válido, enviamos un link de verificación. Revisa bandeja principal/spam y sigue los pasos para constituir tu garantía.",
  });
}

function buildVerificationMail({
  nombre,
  actionLink,
}: {
  nombre: string;
  actionLink: string;
}) {
  const salutation = nombre ? `Hola ${nombre},` : "Hola,";
  const wa = `${SITE.whatsappHref}?text=${encodeURIComponent("Hola, quiero constituir mi garantía y enviar comprobante de pago.")}`;
  const subject = "Verifica tu cuenta en VEDISA Remates y activa tu garantía";
  const text = [
    `${salutation}`,
    "",
    "Gracias por registrarte en VEDISA Remates.",
    "Para verificar tu cuenta, haz clic en este enlace:",
    actionLink,
    "",
    "Luego, para habilitar tu participación en remates debes constituir tu garantía.",
    `Monto de garantía: ${SITE.guaranteeAmountDisplay}`,
    `Puedes enviar el comprobante por WhatsApp: ${wa}`,
    `o por correo a ${SITE.pagosEmail}.`,
    "",
    "Si no iniciaste este registro, ignora este correo.",
  ].join("\n");

  const html = `
  <div style="margin:0;background:#f3f7fb;padding:24px 12px;font-family:Arial,sans-serif;color:#0f1f2c;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f2;border-radius:14px;overflow:hidden;">
      <tr>
        <td style="background:linear-gradient(90deg,#0f2f49,#0f3d5c);padding:18px 22px;">
          <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7dd3fc;font-weight:700;">${SITE.name}</div>
          <div style="font-size:24px;line-height:1.2;color:#ffffff;font-weight:800;margin-top:6px;">Verifica tu cuenta</div>
          <div style="font-size:14px;color:#cfe9ff;margin-top:6px;">Activa tu acceso para participar en remates.</div>
        </td>
      </tr>
      <tr>
        <td style="padding:22px;">
          <p style="margin:0 0 14px;font-size:15px;">${salutation}</p>
          <p style="margin:0 0 16px;font-size:15px;color:#334155;">
            Gracias por registrarte. Para activar tu cuenta de manera segura, presiona el siguiente botón:
          </p>
          <p style="margin:0 0 18px;">
            <a href="${actionLink}" style="display:inline-block;background:#009ade;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;">
              Verificar mi cuenta
            </a>
          </p>
          <p style="margin:0 0 4px;font-size:12px;color:#64748b;">Si el botón no funciona, copia este enlace:</p>
          <p style="margin:0 0 18px;font-size:12px;word-break:break-all;">
            <a href="${actionLink}" style="color:#0369a1;">${actionLink}</a>
          </p>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #fde68a;background:#fffbeb;border-radius:10px;">
            <tr>
              <td style="padding:14px 14px 8px;font-size:16px;font-weight:800;color:#92400e;">Siguiente paso: constituir garantía</td>
            </tr>
            <tr>
              <td style="padding:0 14px 14px;">
                <ol style="margin:0;padding-left:18px;color:#7c2d12;font-size:14px;line-height:1.55;">
                  <li>Constituye tu garantía de participación (<strong>${SITE.guaranteeAmountDisplay}</strong>).</li>
                  <li>Envía tu comprobante para habilitar tu cuenta en remates.</li>
                  <li>Adjunta por WhatsApp o por correo.</li>
                </ol>
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

          <p style="margin:18px 0 0;font-size:12px;color:#64748b;">
            Si no solicitaste este registro, puedes ignorar este correo.
          </p>
        </td>
      </tr>
    </table>
  </div>`;

  return { subject, text, html };
}

async function forceClienteRemateRole(admin: ReturnType<typeof createAdminClient>, userId: string, nombre: string) {
  if (!admin || !userId) return;
  const roleCandidates = ["cliente-remate", "cliente_remate", "cliente remate"];
  for (const rol of roleCandidates) {
    const { error } = await admin
      .from("profiles")
      .upsert(
        {
          id: userId,
          rol,
          nombre: nombre || null,
        },
        { onConflict: "id" },
      );
    if (!error) return;
  }
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  if (pruneAndCount(ipHits, ip, IP_WINDOW_MS) >= IP_LIMIT) {
    return NextResponse.json({ ok: false, error: "demasiadas_solicitudes_ip" }, { status: 429 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "payload_demasiado_grande" }, { status: 413 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "json_invalido" }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const nombre = normalizeName(body.nombre);
  const password = typeof body.password === "string" ? body.password : "";
  const botTrap = typeof body.website === "string" ? body.website.trim() : "";
  const formStartedAt = Number(body.formStartedAt ?? 0);
  const origin = sanitizeRedirectOrigin(typeof body.origin === "string" ? body.origin : "");
  const fallbackOrigin = sanitizeRedirectOrigin(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  const siteOrigin = origin ?? fallbackOrigin ?? "https://vedisaremates.vercel.app";
  const redirectTo = `${siteOrigin}/ingreso?verified=1`;

  registerHit(ipHits, ip);

  if (botTrap) return genericSuccess();
  if (Number.isFinite(formStartedAt) && formStartedAt > 0 && nowMs() - formStartedAt < MIN_FORM_FILL_MS) {
    return genericSuccess();
  }
  if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "email_invalido" }, { status: 400 });
  if (!isStrongPassword(password)) {
    return NextResponse.json({ ok: false, error: "password_debil" }, { status: 400 });
  }

  if (pruneAndCount(emailHits, email, EMAIL_WINDOW_MS) >= EMAIL_LIMIT) {
    return NextResponse.json({ ok: false, error: "demasiadas_solicitudes_email" }, { status: 429 });
  }
  registerHit(emailHits, email);

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "auth_admin_no_configurado" }, { status: 500 });
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: {
      redirectTo,
      data: {
        nombre: nombre || undefined,
        registration_channel: "web",
      },
    },
  });

  if (error) {
    // Evita enumeración de cuentas: respuesta neutral.
    return genericSuccess();
  }

  const actionLink = data?.properties?.action_link;
  const userId = data?.user?.id;
  if (userId) {
    await forceClienteRemateRole(admin, userId, nombre);
  }
  if (!actionLink) {
    return genericSuccess();
  }

  const mail = buildVerificationMail({ nombre, actionLink });
  const sent = await sendSesEmail({
    to: email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });

  if (!sent.ok) {
    return NextResponse.json({ ok: false, error: "mail_no_enviado" }, { status: 502 });
  }

  return genericSuccess();
}
