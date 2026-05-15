import { NextResponse } from "next/server";

import { sendSesEmail } from "@/lib/mail/ses";
import { SITE } from "@/lib/site-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const DEFAULT_SITE_ORIGIN = "https://vedisaremates-mu.vercel.app";

type Body = {
  userIds?: unknown;
  garantiaAprobada?: unknown;
};

function isPrivilegedRole(role: string): boolean {
  return ["admin", "sac"].includes(role);
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

type FeaturedVehicleLink = {
  title: string;
  href: string;
};

async function fetchFeaturedVehicleLinks(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  siteOrigin: string,
): Promise<FeaturedVehicleLink[]> {
  const { data, error } = await admin
    .from("portal_remate_lotes")
    .select(
      `
      id,
      remate_id,
      inventario(patente,marca,modelo),
      portal_remates(estado,titulo)
    `,
    )
    .order("created_at", { ascending: false })
    .limit(36);

  if (error) return [];

  const out: FeaturedVehicleLink[] = [];
  const seen = new Set<string>();
  for (const raw of ((data ?? []) as Array<Record<string, unknown>>)) {
    const remate = Array.isArray(raw.portal_remates) ? raw.portal_remates[0] : raw.portal_remates;
    const estado = String((remate as Record<string, unknown> | null)?.estado ?? "")
      .trim()
      .toLowerCase();
    if (!["publicado", "en_curso"].includes(estado)) continue;

    const loteId = String(raw.id ?? "").trim();
    const remateId = String(raw.remate_id ?? "").trim();
    if (!loteId || !remateId) continue;

    const inv = Array.isArray(raw.inventario) ? raw.inventario[0] : raw.inventario;
    const iv = (inv ?? {}) as Record<string, unknown>;
    const patente = String(iv.patente ?? "").trim().toUpperCase();
    const marca = String(iv.marca ?? "").trim();
    const modelo = String(iv.modelo ?? "").trim();
    const title = [patente, marca, modelo].filter(Boolean).join(" · ") || `Lote ${loteId.slice(0, 8)}`;
    const key = `${remateId}:${loteId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title,
      href: `${siteOrigin}/subastas/${remateId}?lote=${encodeURIComponent(loteId)}`,
    });
    if (out.length >= 6) break;
  }
  return out;
}

async function buildFeaturedRemateLinks(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  siteOrigin: string,
): Promise<Array<{ title: string; href: string }>> {
  const { data, error } = await admin
    .from("portal_remates")
    .select("id,titulo,estado,ends_at")
    .in("estado", ["publicado", "en_curso"])
    .order("ends_at", { ascending: true })
    .limit(4);
  if (error) return [];
  return ((data ?? []) as Array<{ id: string; titulo: string | null }>)
    .filter((r) => Boolean(r.id))
    .map((r) => ({
      title: String(r.titulo ?? "Subasta disponible"),
      href: `${siteOrigin}/subastas/${r.id}`,
    }));
}

function buildGarantiaApprovedMail({
  nombre,
  email,
  siteOrigin,
  remates,
  vehicles,
}: {
  nombre: string;
  email: string;
  siteOrigin: string;
  remates: Array<{ title: string; href: string }>;
  vehicles: FeaturedVehicleLink[];
}) {
  const salutation = nombre ? `Hola ${nombre},` : "Hola,";
  const logoUrl = `${siteOrigin}/vedisa-logo-navbar.png`;
  const subject = "¡Tu garantía fue aprobada! Ya puedes ofertar en VEDISA Remates";
  const text = [
    `${salutation}`,
    "",
    "Tu garantía ya fue aprobada. Desde ahora puedes ofertar en los remates activos.",
    "",
    `Ingresar a subastas: ${siteOrigin}/subastas`,
    `Buscar vehículos disponibles: ${siteOrigin}/buscar`,
    "",
    ...remates.map((r, i) => `Subasta ${i + 1}: ${r.title} -> ${r.href}`),
    "",
    ...vehicles.map((v, i) => `Vehículo ${i + 1}: ${v.title} -> ${v.href}`),
    "",
    `Si tienes dudas, contáctanos por WhatsApp: ${SITE.whatsappHref}`,
  ].join("\n");

  const rematesHtml = remates.length
    ? remates
        .map(
          (r) => `
        <li style="margin:0 0 8px;">
          <a href="${r.href}" style="color:#0369a1;text-decoration:none;font-weight:700;">${r.title}</a>
        </li>`,
        )
        .join("")
    : `<li style="margin:0 0 8px;"><a href="${siteOrigin}/subastas" style="color:#0369a1;text-decoration:none;font-weight:700;">Ver subastas activas</a></li>`;

  const vehiclesHtml = vehicles.length
    ? vehicles
        .map(
          (v) => `
        <li style="margin:0 0 8px;">
          <a href="${v.href}" style="color:#0f766e;text-decoration:none;font-weight:700;">${v.title}</a>
        </li>`,
        )
        .join("")
    : `<li style="margin:0 0 8px;"><a href="${siteOrigin}/buscar" style="color:#0f766e;text-decoration:none;font-weight:700;">Explorar vehículos disponibles</a></li>`;

  const html = `
    <div style="margin:0;background:#f3f7fb;padding:24px 12px;font-family:Arial,sans-serif;color:#0f1f2c;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f2;border-radius:14px;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(90deg,#0f2f49,#0f3d5c);padding:18px 22px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td style="vertical-align:top;padding-right:12px;">
                  <div style="font-size:30px;line-height:1.15;color:#ffffff;font-weight:900;margin:0;">¡Garantía aprobada!</div>
                  <div style="font-size:14px;color:#cfe9ff;margin-top:6px;">Tu cuenta ya está habilitada para ofertar.</div>
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
            <p style="margin:0 0 14px;font-size:15px;">${salutation}</p>
            <p style="margin:0 0 14px;font-size:15px;color:#334155;">
              Te confirmamos que tu garantía fue validada exitosamente.
              <strong> Desde este momento ya puedes ofertar en VEDISA Remates.</strong>
            </p>

            <p style="margin:0 0 18px;">
              <a href="${siteOrigin}/subastas" style="display:inline-block;background:#009ade;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;">
                Ir a subastas activas
              </a>
              <a href="${siteOrigin}/buscar" style="display:inline-block;margin-left:8px;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;">
                Ver vehículos disponibles
              </a>
            </p>

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dbeafe;background:#f8fbff;border-radius:10px;">
              <tr>
                <td style="padding:12px 14px 8px;font-size:15px;font-weight:800;color:#1e3a8a;">Accesos directos a subastas</td>
              </tr>
              <tr>
                <td style="padding:0 14px 14px;">
                  <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.55;color:#1e293b;">
                    ${rematesHtml}
                  </ul>
                </td>
              </tr>
            </table>

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;border:1px solid #ccfbf1;background:#f0fdfa;border-radius:10px;">
              <tr>
                <td style="padding:12px 14px 8px;font-size:15px;font-weight:800;color:#0f766e;">Vehículos disponibles para ofertar</td>
              </tr>
              <tr>
                <td style="padding:0 14px 14px;">
                  <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.55;color:#134e4a;">
                    ${vehiclesHtml}
                  </ul>
                </td>
              </tr>
            </table>

            <p style="margin:16px 0 0;font-size:12px;color:#64748b;">
              Este mensaje fue enviado a <strong>${email}</strong>. Si necesitas ayuda, contáctanos por WhatsApp o desde la sección de contacto.
            </p>
          </td>
        </tr>
      </table>
    </div>
  `;

  return { subject, text, html };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "servicio_no_disponible" }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("rol").eq("id", user.id).maybeSingle();
  const role = String(profile?.rol ?? "").trim().toLowerCase();
  if (!isPrivilegedRole(role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Body;
  const garantiaAprobada = body.garantiaAprobada === true;
  const userIds = Array.isArray(body.userIds)
    ? Array.from(new Set(body.userIds.map((v) => String(v ?? "").trim()).filter((id) => id && isUuid(id))))
    : [];
  if (!userIds.length) return NextResponse.json({ ok: false, error: "sin_ids" }, { status: 400 });

  // Importante: la actualización de garantía debe ocurrir en el mismo contexto
  // de base de datos de la sesión actual (supabase servidor), para evitar desalineaciones.
  const { data: beforeRows, error: beforeErr } = await supabase.from("profiles").select("id, garantia_aprobada").in("id", userIds);
  if (beforeErr) return NextResponse.json({ ok: false, error: beforeErr.message }, { status: 500 });
  const wasApproved = new Map<string, boolean>(
    ((beforeRows ?? []) as Array<{ id: string; garantia_aprobada: boolean | null }>).map((r) => [
      String(r.id),
      r.garantia_aprobada === true,
    ]),
  );

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      garantia_aprobada: garantiaAprobada,
      garantia_aprobada_at: garantiaAprobada ? nowIso : null,
      garantia_aprobada_by: garantiaAprobada ? user.id : null,
    })
    .in("id", userIds)
    .select("id");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const updatedIds = new Set(((data ?? []) as { id: string }[]).map((row) => row.id));
  const failedIds = userIds.filter((id) => !updatedIds.has(id));

  let notified = 0;
  if (garantiaAprobada) {
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({
        ok: true,
        updated: updatedIds.size,
        failed: failedIds.length,
        failedIds,
        notified: 0,
        note: "garantia_actualizada_sin_mail_por_falta_service_role",
      });
    }
    const newlyApprovedIds = [...updatedIds].filter((id) => !wasApproved.get(id));
    if (newlyApprovedIds.length > 0) {
      const siteOrigin = DEFAULT_SITE_ORIGIN;
      const [featuredRemates, featuredVehicles] = await Promise.all([
        buildFeaturedRemateLinks(admin, siteOrigin),
        fetchFeaturedVehicleLinks(admin, siteOrigin),
      ]);

      const { data: profileRows } = await admin
        .from("profiles")
        .select("id, nombre, email")
        .in("id", newlyApprovedIds);
      const profiles = ((profileRows ?? []) as Array<{ id: string; nombre: string | null; email: string | null }>) ?? [];

      for (const p of profiles) {
        const userId = String(p.id ?? "");
        if (!userId) continue;
        let email = String(p.email ?? "").trim().toLowerCase();
        if (!email) {
          const { data: authData } = await admin.auth.admin.getUserById(userId);
          email = String(authData?.user?.email ?? "").trim().toLowerCase();
        }
        if (!email) continue;
        const mail = buildGarantiaApprovedMail({
          nombre: String(p.nombre ?? "").trim(),
          email,
          siteOrigin,
          remates: featuredRemates,
          vehicles: featuredVehicles,
        });
        const sent = await sendSesEmail({
          to: email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        });
        if (sent.ok) notified += 1;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    updated: updatedIds.size,
    failed: failedIds.length,
    failedIds,
    notified,
  });
}

