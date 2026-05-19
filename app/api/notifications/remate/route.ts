import { NextResponse } from "next/server";

import { buildMailShell, formatClp, toPlainText } from "@/lib/mail/templates";
import { sendSesEmail } from "@/lib/mail/ses";
import { SITE } from "@/lib/site-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Body =
  | { event?: "post_bid"; loteId?: string; monto?: number }
  | { event?: "oferta_aceptada"; loteId?: string; email?: string; monto?: number };

type RematePrefs = {
  oferta_confirmada: boolean;
  oferta_superada: boolean;
  oferta_aceptada: boolean;
};

const DEFAULT_PREFS: RematePrefs = {
  oferta_confirmada: true,
  oferta_superada: true,
  oferta_aceptada: true,
};

function parsePrefs(raw: unknown): RematePrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PREFS };
  const obj = raw as Record<string, unknown>;
  return {
    oferta_confirmada: obj.oferta_confirmada !== false,
    oferta_superada: obj.oferta_superada !== false,
    oferta_aceptada: obj.oferta_aceptada !== false,
  };
}

function sanitizeEmail(v: unknown): string | null {
  const email = String(v ?? "").trim().toLowerCase();
  return email.includes("@") ? email : null;
}

async function getPrefsForUser(admin: NonNullable<ReturnType<typeof createAdminClient>>, userId: string): Promise<RematePrefs> {
  try {
    const { data } = await admin.from("profiles").select("remate_notificaciones").eq("id", userId).maybeSingle();
    return parsePrefs((data as { remate_notificaciones?: unknown } | null)?.remate_notificaciones);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

async function buildLoteContext(admin: NonNullable<ReturnType<typeof createAdminClient>>, loteId: string) {
  const { data } = await admin
    .from("portal_remate_lotes")
    .select("id, titulo, remate_id, inventario(patente,marca,modelo), portal_remates(titulo)")
    .eq("id", loteId)
    .maybeSingle();
  const row = (data ?? {}) as Record<string, unknown>;
  const remate = Array.isArray(row.portal_remates) ? row.portal_remates[0] : row.portal_remates;
  const inv = Array.isArray(row.inventario) ? row.inventario[0] : row.inventario;
  const iv = (inv ?? {}) as Record<string, unknown>;
  const patente = String(iv.patente ?? "").trim().toUpperCase();
  const marca = String(iv.marca ?? "").trim();
  const modelo = String(iv.modelo ?? "").trim();
  const inventarioFicha = [patente, marca, modelo].filter(Boolean).join(" · ");
  return {
    loteTitulo: String(row.titulo ?? "Lote").trim() || "Lote",
    remateId: String(row.remate_id ?? "").trim(),
    remateTitulo: String((remate as Record<string, unknown> | null)?.titulo ?? "Subasta").trim() || "Subasta",
    inventarioFicha: inventarioFicha || null,
  };
}

function buildBidMail({
  title,
  subtitle,
  intro,
  remateTitulo,
  loteTitulo,
  loteFicha,
  monto,
  salaHref,
  ctaLabel,
  siteOrigin,
}: {
  title: string;
  subtitle: string;
  intro: string;
  remateTitulo: string;
  loteTitulo: string;
  loteFicha?: string | null;
  monto?: number;
  salaHref: string;
  ctaLabel: string;
  siteOrigin: string;
}) {
  const contentHtml = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dbe7f2;background:#f8fbff;border-radius:10px;">
      <tr>
        <td style="padding:14px;">
          <p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Remate:</strong> ${remateTitulo}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Lote:</strong> ${loteTitulo}</p>
          ${loteFicha ? `<p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Vehículo:</strong> ${loteFicha}</p>` : ""}
          ${typeof monto === "number" ? `<p style="margin:0;font-size:15px;color:#0f3d5c;font-weight:800;"><strong>Monto:</strong> ${formatClp(monto)}</p>` : ""}
        </td>
      </tr>
    </table>
    <p style="margin:14px 0 0;font-size:12px;color:#64748b;">
      Si necesitas ayuda para ofertar, escríbenos por WhatsApp: <a href="${SITE.whatsappHref}" style="color:#0369a1;font-weight:700;text-decoration:none;">${SITE.contactPhoneDisplay}</a>
    </p>
  `;
  const html = buildMailShell({
    siteOrigin,
    title,
    subtitle,
    intro,
    primaryCta: { label: ctaLabel, href: salaHref },
    contentHtml,
  });
  const text = toPlainText(html);
  return { html, text };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const event = String(body.event ?? "");
  const loteId = String(body.loteId ?? "").trim();
  if (!event || !loteId) {
    return NextResponse.json({ ok: false, error: "payload_invalido" }, { status: 400 });
  }

  const sb = await createClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_no_configurado" }, { status: 500 });
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "admin_no_configurado" }, { status: 500 });

  const siteOrigin = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://vedisaremates-mu.vercel.app").trim();
  const ctx = await buildLoteContext(admin, loteId);
  const salaHref = ctx.remateId ? `${siteOrigin}/subastas/${ctx.remateId}?lote=${encodeURIComponent(loteId)}` : `${siteOrigin}/subastas`;

  if (event === "post_bid") {
    const { data: topRows } = await admin
      .from("portal_ofertas")
      .select("user_id, monto")
      .eq("lote_id", loteId)
      .order("monto", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(4);
    const ordered = (topRows ?? []) as Array<{ user_id: string; monto: number }>;
    const top = ordered[0];
    if (!top || String(top.user_id) !== String(user.id)) {
      return NextResponse.json({ ok: true, skipped: true, reason: "top_mismatch" });
    }

    const bidAmount = Number((body as { monto?: number }).monto ?? top.monto ?? 0);

    // Confirmacion al usuario que acaba de ofertar.
    const mePrefs = await getPrefsForUser(admin, user.id);
    if (mePrefs.oferta_confirmada) {
      const meEmail = sanitizeEmail(user.email);
      if (meEmail) {
        await sendSesEmail({
          to: meEmail,
          subject: `Oferta confirmada · ${ctx.remateTitulo}`,
          ...buildBidMail({
            title: "Oferta confirmada",
            subtitle: "Tu puja quedó registrada correctamente",
            intro: "Recibimos tu oferta y ya se encuentra participando en la subasta.",
            remateTitulo: ctx.remateTitulo,
            loteTitulo: ctx.loteTitulo,
            loteFicha: ctx.inventarioFicha,
            monto: bidAmount,
            salaHref,
            ctaLabel: "Ver sala",
            siteOrigin,
          }),
        });
      }
    }

    // Oferta superada al mejor postor anterior (si existe y es distinto).
    const previousUserId = ordered.find((o) => String(o.user_id) !== String(user.id))?.user_id;
    if (previousUserId) {
      const prevPrefs = await getPrefsForUser(admin, previousUserId);
      if (prevPrefs.oferta_superada) {
        const { data: prevUser } = await admin.auth.admin.getUserById(previousUserId);
        const prevEmail = sanitizeEmail(prevUser?.user?.email);
        if (prevEmail) {
          await sendSesEmail({
            to: prevEmail,
            subject: `Tu oferta fue superada · ${ctx.remateTitulo}`,
            ...buildBidMail({
              title: "Oferta superada",
              subtitle: "Otro usuario quedó como mejor postor",
              intro: "Puedes volver a la sala y realizar una nueva oferta si deseas seguir participando.",
              remateTitulo: ctx.remateTitulo,
              loteTitulo: ctx.loteTitulo,
              loteFicha: ctx.inventarioFicha,
              salaHref,
              ctaLabel: "Volver a la sala",
              siteOrigin,
            }),
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  }

  if (event === "oferta_aceptada") {
    const { data: actorProfile } = await admin.from("profiles").select("rol").eq("id", user.id).maybeSingle();
    const actorRole = String((actorProfile as { rol?: string } | null)?.rol ?? "").trim().toLowerCase();
    if (!["admin", "sac"].includes(actorRole)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const email = sanitizeEmail((body as { email?: unknown }).email);
    if (!email) return NextResponse.json({ ok: false, error: "email_invalido" }, { status: 400 });

    // Si existe perfil para ese email, respetar su preferencia.
    const { data: candidates } = await admin.auth.admin.listUsers({ page: 1, perPage: 2000 });
    const winner = (candidates?.users ?? []).find((u) => sanitizeEmail(u.email) === email);
    if (winner) {
      const prefs = await getPrefsForUser(admin, winner.id);
      if (!prefs.oferta_aceptada) return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
    }

    await sendSesEmail({
      to: email,
      subject: `Oferta aceptada · ${ctx.remateTitulo}`,
      ...buildBidMail({
        title: "Oferta aceptada",
        subtitle: "Tu oferta fue aceptada para este lote",
        intro: "Revisa el detalle y próximos pasos en la sala del remate.",
        remateTitulo: ctx.remateTitulo,
        loteTitulo: ctx.loteTitulo,
        loteFicha: ctx.inventarioFicha,
        salaHref,
        ctaLabel: "Ir a la sala",
        siteOrigin,
      }),
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "event_no_soportado" }, { status: 400 });
}
