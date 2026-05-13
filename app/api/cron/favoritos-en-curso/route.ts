import { NextResponse } from "next/server";

import { sendSesEmail } from "@/lib/mail/ses";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ALERT_TYPE = "favorito_en_curso";
const SITE_ORIGIN = "https://vedisaremates-mu.vercel.app";

type AlertRow = {
  user_id: string;
  lote_id: string;
  notify_email: boolean;
  lote?: {
    id: string;
    titulo: string | null;
    remate_id: string | null;
    remate?: { id: string; titulo: string; estado: string } | null;
  } | null;
};

type AlertRowRaw = {
  user_id: string;
  lote_id: string;
  notify_email: boolean;
  lote?:
    | {
        id: string;
        titulo: string | null;
        remate_id: string | null;
        remate?: { id: string; titulo: string; estado: string }[] | null;
      }[]
    | null;
};

function unauthorized() {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

function buildMail(remateTitulo: string, loteTitulo: string, link: string) {
  const subject = `Tu favorito ya abrió: ${remateTitulo}`;
  const text = [
    "Tu lote favorito ya está en curso.",
    "",
    `Remate: ${remateTitulo}`,
    `Lote: ${loteTitulo}`,
    `Entrar: ${link}`,
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;padding:20px;background:#f3f7fb;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #dbe7f2;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:16px 18px;background:#0f3d5c;color:#fff;font-size:22px;font-weight:800;">Tu favorito ya abrió</td></tr>
        <tr><td style="padding:18px;">
          <p style="margin:0 0 10px;color:#334155;">Ya puedes revisar tu lote favorito en sala:</p>
          <p style="margin:0 0 6px;"><strong>Remate:</strong> ${remateTitulo}</p>
          <p style="margin:0 0 14px;"><strong>Lote:</strong> ${loteTitulo}</p>
          <a href="${link}" style="display:inline-block;background:#009ade;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700;">Entrar a la sala</a>
        </td></tr>
      </table>
    </div>`;
  return { subject, text, html };
}

function normalizeAlertRows(rawRows: AlertRowRaw[]): AlertRow[] {
  return rawRows.map((raw) => {
    const loteRaw = Array.isArray(raw.lote) ? (raw.lote[0] ?? null) : null;
    const remateRaw = loteRaw?.remate;
    const remate = Array.isArray(remateRaw) ? (remateRaw[0] ?? null) : null;
    return {
      user_id: raw.user_id,
      lote_id: raw.lote_id,
      notify_email: raw.notify_email,
      lote: loteRaw
        ? {
            id: loteRaw.id,
            titulo: loteRaw.titulo,
            remate_id: loteRaw.remate_id,
            remate,
          }
        : null,
    };
  });
}

export async function POST(request: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  const headerSecret = (request.headers.get("x-cron-secret") ?? "").trim();
  if (!secret || headerSecret !== secret) return unauthorized();

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "auth_admin_no_configurado" }, { status: 500 });

  const { data, error } = await admin
    .from("portal_lote_favoritos")
    .select(
      `
      user_id,
      lote_id,
      notify_email,
      lote:portal_remate_lotes!portal_lote_favoritos_lote_id_fkey(
        id,
        titulo,
        remate_id,
        remate:portal_remates!portal_remate_lotes_remate_id_fkey(id, titulo, estado)
      )
    `,
    )
    .eq("notify_email", true);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = normalizeAlertRows((data ?? []) as AlertRowRaw[]).filter((r) => r.lote?.remate?.estado === "en_curso");
  let sent = 0;
  let skipped = 0;

  for (const row of rows) {
    const remateId = row.lote?.remate?.id;
    if (!remateId) {
      skipped += 1;
      continue;
    }
    const { error: logErr } = await admin.from("portal_favorito_alertas_log").insert({
      user_id: row.user_id,
      lote_id: row.lote_id,
      alert_type: ALERT_TYPE,
    });
    if (logErr) {
      skipped += 1;
      continue;
    }

    const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(row.user_id);
    const to = userRes?.user?.email?.trim().toLowerCase();
    if (userErr || !to) {
      skipped += 1;
      continue;
    }

    const remateTitulo = row.lote?.remate?.titulo ?? "Remate en curso";
    const loteTitulo = row.lote?.titulo ?? "Lote favorito";
    const link = `${SITE_ORIGIN}/subastas/${remateId}?lote=${encodeURIComponent(row.lote_id)}`;
    const mail = buildMail(remateTitulo, loteTitulo, link);
    const mailRes = await sendSesEmail({
      to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    if (mailRes.ok) sent += 1;
    else skipped += 1;
  }

  return NextResponse.json({ ok: true, processed: rows.length, sent, skipped });
}

