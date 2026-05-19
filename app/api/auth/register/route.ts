import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { sendSesEmail } from "@/lib/mail/ses";
import { buildMailShell, toPlainText } from "@/lib/mail/templates";
import { SITE } from "@/lib/site-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicSupabaseEnv } from "@/lib/supabase/public-env";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const MAX_BODY_BYTES = 16_000;
const MIN_FORM_FILL_MS = 1_200;
const IP_WINDOW_MS = 10 * 60 * 1000;
const EMAIL_WINDOW_MS = 20 * 60 * 1000;
const IP_LIMIT = 25;
const EMAIL_LIMIT = 4;
const DEFAULT_SITE_ORIGIN = "https://vedisaremates-mu.vercel.app";

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

function normalizeUsername(raw: unknown) {
  if (typeof raw !== "string") return "";
  return raw
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .slice(0, 40);
}

function isValidUsername(username: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$/.test(username);
}

function isStrongPassword(password: string) {
  return password.length >= 6 && password.length <= 128;
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

function shouldReturnNeutralSignupError(errorMessage: string): boolean {
  const text = String(errorMessage ?? "").toLowerCase();
  return (
    text.includes("already registered") ||
    text.includes("user already exists") ||
    text.includes("email rate limit exceeded") ||
    text.includes("for security purposes")
  );
}

function enforceRematesRedirect(actionLink: string, siteOrigin: string): string {
  try {
    const url = new URL(actionLink);
    const target = `${siteOrigin}/?verified=1`;
    const currentRedirect =
      url.searchParams.get("redirect_to") ??
      url.searchParams.get("redirectTo") ??
      url.searchParams.get("next");
    if (!currentRedirect) return actionLink;
    if (currentRedirect.startsWith(siteOrigin)) return actionLink;
    if (url.searchParams.has("redirect_to")) url.searchParams.set("redirect_to", target);
    if (url.searchParams.has("redirectTo")) url.searchParams.set("redirectTo", target);
    if (url.searchParams.has("next")) url.searchParams.set("next", target);
    return url.toString();
  } catch {
    return actionLink;
  }
}

function buildVerificationMail({
  nombre,
  actionLink,
  siteOrigin,
}: {
  nombre: string;
  actionLink: string;
  siteOrigin: string;
}) {
  const salutation = nombre ? `Hola ${nombre},` : "Hola,";
  const wa = `${SITE.whatsappHref}?text=${encodeURIComponent("Hola, quiero constituir mi garantía y enviar comprobante de pago.")}`;
  const paymentLink = "https://www.tuu.cl/vedisaremates";
  const subject = "Verifica tu cuenta en VEDISA Remates y activa tu garantía";
  const html = buildMailShell({
    siteOrigin,
    title: "Verifica tu cuenta",
    subtitle: "Activa tu acceso para participar en remates",
    intro: `${salutation} Gracias por registrarte. Para activar tu cuenta de manera segura, presiona el siguiente botón:`,
    primaryCta: { label: "Verificar mi cuenta", href: actionLink },
    contentHtml: `
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
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;border:1px solid #d1e9f7;background:#f8fcff;border-radius:10px;">
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
              Importante: el pago debe realizarse con el <strong>mismo nombre y correo</strong> de tu usuario en VEDISA Remates.
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
      <p style="margin:8px 0 0;font-size:12px;color:#64748b;">
        Recomendación de seguridad: VEDISA Remates nunca solicitará tu contraseña por WhatsApp, correo o teléfono.
      </p>
      <p style="margin:18px 0 0;font-size:12px;color:#64748b;">
        Si no solicitaste este registro, puedes ignorar este correo.
      </p>
    `,
  });
  const text = toPlainText(html);

  return { subject, text, html };
}

async function forceClienteRemateRole(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  nombre: string,
  apellido: string,
  username: string,
) {
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
          apellido: apellido || null,
          username: username || null,
        },
        { onConflict: "id" },
      );
    if (!error) return;
  }
}

async function fallbackSignupWithPublicClient({
  email,
  password,
  nombre,
  apellido,
  username,
  redirectTo,
}: {
  email: string;
  password: string;
  nombre: string;
  apellido: string;
  username: string;
  redirectTo: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const env = getPublicSupabaseEnv();
  if (!env) return { ok: false, error: "supabase_public_no_configurado" };

  const supabase = createSupabaseClient(env.url, env.key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        nombre: nombre || undefined,
        apellido: apellido || undefined,
        username: username || undefined,
        registration_channel: "web_fallback",
      },
    },
  });

  if (error) {
    if (shouldReturnNeutralSignupError(error.message)) return { ok: true };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

async function resendVerificationWithPublicClient({
  email,
  redirectTo,
}: {
  email: string;
  redirectTo: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const env = getPublicSupabaseEnv();
  if (!env) return { ok: false, error: "supabase_public_no_configurado" };

  const supabase = createSupabaseClient(env.url, env.key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: redirectTo },
  });

  if (error) {
    if (shouldReturnNeutralSignupError(error.message)) return { ok: true };
    return { ok: false, error: error.message };
  }
  return { ok: true };
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
  const apellido = normalizeName(body.apellido);
  const username = normalizeUsername(body.username);
  const password = typeof body.password === "string" ? body.password : "";
  const botTrap = typeof body.website === "string" ? body.website.trim() : "";
  const formStartedAt = Number(body.formStartedAt ?? 0);
  const siteOrigin = DEFAULT_SITE_ORIGIN;
  const redirectTo = `${siteOrigin}/?verified=1`;

  registerHit(ipHits, ip);

  if (botTrap) return genericSuccess();
  if (Number.isFinite(formStartedAt) && formStartedAt > 0 && nowMs() - formStartedAt < MIN_FORM_FILL_MS) {
    return genericSuccess();
  }
  if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "email_invalido" }, { status: 400 });
  if (!nombre || !apellido) return NextResponse.json({ ok: false, error: "nombre_apellido_requerido" }, { status: 400 });
  if (!isValidUsername(username)) return NextResponse.json({ ok: false, error: "username_invalido" }, { status: 400 });
  if (!isStrongPassword(password)) {
    return NextResponse.json({ ok: false, error: "password_debil" }, { status: 400 });
  }

  if (pruneAndCount(emailHits, email, EMAIL_WINDOW_MS) >= EMAIL_LIMIT) {
    return NextResponse.json({ ok: false, error: "demasiadas_solicitudes_email" }, { status: 429 });
  }
  registerHit(emailHits, email);

  const admin = createAdminClient();
  if (!admin) {
    const fallback = await fallbackSignupWithPublicClient({
      email,
      password,
      nombre,
      apellido,
      username,
      redirectTo,
    });
    if (fallback.ok) return genericSuccess();
    return NextResponse.json(
      { ok: false, error: "auth_admin_no_configurado", detail: fallback.error },
      { status: 500 },
    );
  }

  try {
    const { data: existingUsername, error: usernameQueryError } = await admin
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .limit(1);
    if (usernameQueryError) {
      console.error("[auth/register] username check failed", usernameQueryError.message);
    }
    if ((existingUsername ?? []).length > 0) {
      return NextResponse.json({ ok: false, error: "username_duplicado" }, { status: 400 });
    }

    const { data, error } = await admin.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: {
        redirectTo,
        data: {
          nombre: nombre || undefined,
          apellido: apellido || undefined,
          username: username || undefined,
          registration_channel: "web",
        },
      },
    });

    if (error) {
      if (shouldReturnNeutralSignupError(error.message)) return genericSuccess();
      const fallback = await fallbackSignupWithPublicClient({
        email,
        password,
        nombre,
        apellido,
        username,
        redirectTo,
      });
      if (fallback.ok) return genericSuccess();
      console.error("[auth/register] generateLink failed", error.message);
      return NextResponse.json(
        { ok: false, error: "link_no_generado", detail: `${error.message} | fallback:${fallback.error}` },
        { status: 500 },
      );
    }

    const rawActionLink = data?.properties?.action_link;
    const userId = data?.user?.id;
    if (userId) {
      await forceClienteRemateRole(admin, userId, nombre, apellido, username);
    }
    if (!rawActionLink) {
      return NextResponse.json({ ok: false, error: "link_invalido" }, { status: 500 });
    }
    const actionLink = enforceRematesRedirect(rawActionLink, siteOrigin);

    const mail = buildVerificationMail({ nombre, actionLink, siteOrigin });
    const sent = await sendSesEmail({
      to: email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });

    if (!sent.ok) {
      const resend = await resendVerificationWithPublicClient({
        email,
        redirectTo,
      });
      if (resend.ok) return genericSuccess();
      console.error("[auth/register] SES send failed", sent.error);
      return NextResponse.json(
        { ok: false, error: "mail_no_enviado", detail: `${sent.error} | resend:${resend.error}` },
        { status: 502 },
      );
    }

    return genericSuccess();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "error_desconocido";
    console.error("[auth/register] unexpected failure", detail);
    return NextResponse.json({ ok: false, error: "registro_no_disponible", detail }, { status: 503 });
  }
}
