import { NextResponse } from "next/server";

import { sendSesEmail } from "@/lib/mail/ses";
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
    .select("id, titulo, remate_id, portal_remates(titulo)")
    .eq("id", loteId)
    .maybeSingle();
  const row = (data ?? {}) as Record<string, unknown>;
  const remate = Array.isArray(row.portal_remates) ? row.portal_remates[0] : row.portal_remates;
  return {
    loteTitulo: String(row.titulo ?? "Lote").trim() || "Lote",
    remateId: String(row.remate_id ?? "").trim(),
    remateTitulo: String((remate as Record<string, unknown> | null)?.titulo ?? "Subasta").trim() || "Subasta",
  };
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
          text: `Tu oferta fue registrada.\n\nRemate: ${ctx.remateTitulo}\nLote: ${ctx.loteTitulo}\nMonto: $${Math.round(bidAmount)}\nSala: ${salaHref}`,
          html: `
            <div style="font-family:Arial,sans-serif;padding:20px;background:#f3f7fb;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #dbe7f2;border-radius:12px;overflow:hidden;">
                <tr><td style="padding:16px 18px;background:#0f3d5c;color:#fff;font-size:22px;font-weight:800;">Oferta confirmada</td></tr>
                <tr><td style="padding:18px;">
                  <p style="margin:0 0 10px;color:#334155;">Tu puja se registró correctamente.</p>
                  <p style="margin:0 0 6px;"><strong>Remate:</strong> ${ctx.remateTitulo}</p>
                  <p style="margin:0 0 6px;"><strong>Lote:</strong> ${ctx.loteTitulo}</p>
                  <p style="margin:0 0 12px;"><strong>Monto:</strong> $${Math.round(bidAmount)}</p>
                  <a href="${salaHref}" style="display:inline-block;background:#009ade;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700;">Ver sala</a>
                </td></tr>
              </table>
            </div>`,
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
            text: `Otro usuario superó tu oferta.\n\nRemate: ${ctx.remateTitulo}\nLote: ${ctx.loteTitulo}\nSala: ${salaHref}`,
            html: `
              <div style="font-family:Arial,sans-serif;padding:20px;background:#f3f7fb;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #dbe7f2;border-radius:12px;overflow:hidden;">
                  <tr><td style="padding:16px 18px;background:#0f3d5c;color:#fff;font-size:22px;font-weight:800;">Oferta superada</td></tr>
                  <tr><td style="padding:18px;">
                    <p style="margin:0 0 10px;color:#334155;">Un nuevo postor superó tu oferta.</p>
                    <p style="margin:0 0 6px;"><strong>Remate:</strong> ${ctx.remateTitulo}</p>
                    <p style="margin:0 0 12px;"><strong>Lote:</strong> ${ctx.loteTitulo}</p>
                    <a href="${salaHref}" style="display:inline-block;background:#009ade;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700;">Volver a la sala</a>
                  </td></tr>
                </table>
              </div>`,
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
      text: `¡Tu oferta fue aceptada!\n\nRemate: ${ctx.remateTitulo}\nLote: ${ctx.loteTitulo}\nRevisa el detalle en tu cuenta o en la sala: ${salaHref}`,
      html: `
        <div style="font-family:Arial,sans-serif;padding:20px;background:#f3f7fb;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #dbe7f2;border-radius:12px;overflow:hidden;">
            <tr><td style="padding:16px 18px;background:#0f3d5c;color:#fff;font-size:22px;font-weight:800;">Oferta aceptada</td></tr>
            <tr><td style="padding:18px;">
              <p style="margin:0 0 10px;color:#334155;">Tu oferta fue aceptada en la subasta.</p>
              <p style="margin:0 0 6px;"><strong>Remate:</strong> ${ctx.remateTitulo}</p>
              <p style="margin:0 0 12px;"><strong>Lote:</strong> ${ctx.loteTitulo}</p>
              <a href="${salaHref}" style="display:inline-block;background:#009ade;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700;">Ir a la sala</a>
            </td></tr>
          </table>
        </div>`,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "event_no_soportado" }, { status: 400 });
}
