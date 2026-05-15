import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type PortalEstado = "borrador" | "publicado" | "en_curso" | "cerrado";

function parseIsoOrNull(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

function stripLeadingRemateNumber(value: string): string {
  return String(value ?? "")
    .replace(/^\s*remate\s*#?\s*\d+\s*[-:]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractNumeroRemate(value: string): string {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const byHash = raw.match(/#\s*([0-9]+)/);
  if (byHash?.[1]) return `Remate #${byHash[1]}`;
  const byRemate = raw.match(/^\s*remate\s*#?\s*([0-9]+)/i);
  if (byRemate?.[1]) return `Remate #${byRemate[1]}`;
  return "";
}

function normalizeNumeroRemate(input: string): string {
  const raw = String(input ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const byHash = raw.match(/#\s*([0-9]+)/);
  if (byHash?.[1]) return `Remate #${byHash[1]}`;
  if (/^remate\b/i.test(raw)) return raw;
  return raw;
}

function buildPortalTitle(numeroRemate: string, descripcion: string): string {
  const numero = String(numeroRemate ?? "").trim();
  const desc = String(descripcion ?? "").trim();
  if (numero && desc) return `${numero} - ${desc}`;
  if (numero) return numero;
  if (desc) return desc;
  return "Remate";
}

function mapPortalEstadoToTasaciones(estado: PortalEstado): string {
  return estado === "cerrado" ? "cerrado" : "abierto";
}

async function authorizeAdmin() {
  const supabase = await createClient();
  if (!supabase) return { ok: false as const, status: 503 };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };
  const { data: profile } = await supabase.from("profiles").select("rol").eq("id", user.id).maybeSingle();
  const rol = String(profile?.rol ?? "").toLowerCase();
  if (!["admin", "sac"].includes(rol)) return { ok: false as const, status: 403 };
  return { ok: true as const };
}

export async function POST(req: Request) {
  const auth = await authorizeAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: auth.status });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Falta cliente admin." }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as {
    remateId?: string;
    titulo?: string;
    descripcion?: string;
    estado?: PortalEstado;
    startsAt?: string | null;
    endsAt?: string | null;
  };

  const remateId = String(body.remateId ?? "").trim();
  const estado = String(body.estado ?? "") as PortalEstado;
  const rawTitulo = String(body.titulo ?? "").trim();
  const rawDescripcion = String(body.descripcion ?? "").trim();
  const startsAt = parseIsoOrNull(body.startsAt);
  const endsAt = parseIsoOrNull(body.endsAt);

  if (!remateId) return NextResponse.json({ ok: false, error: "Falta remateId." }, { status: 400 });
  if (!rawTitulo) return NextResponse.json({ ok: false, error: "Falta título o número de remate." }, { status: 400 });
  if (!endsAt) return NextResponse.json({ ok: false, error: "Fecha de cierre inválida." }, { status: 400 });
  if (!["borrador", "publicado", "en_curso", "cerrado"].includes(estado)) {
    return NextResponse.json({ ok: false, error: "Estado inválido." }, { status: 400 });
  }

  const numeroFromTitle = extractNumeroRemate(rawTitulo);
  const numeroFromDescription = extractNumeroRemate(rawDescripcion);
  const numeroRemate = normalizeNumeroRemate(numeroFromTitle || numeroFromDescription || rawTitulo);
  if (!numeroRemate) return NextResponse.json({ ok: false, error: "Número de remate inválido." }, { status: 400 });

  const descripcion = stripLeadingRemateNumber(rawDescripcion);
  const portalTitle = buildPortalTitle(numeroRemate, descripcion);
  const startIso = startsAt ?? new Date(new Date(endsAt).getTime() - 24 * 60 * 60 * 1000).toISOString();

  const { data: portalRow, error: portalFetchError } = await admin
    .from("portal_remates")
    .select("id, tasaciones_remate_id")
    .eq("id", remateId)
    .maybeSingle<{ id: string | null; tasaciones_remate_id: string | null }>();
  if (portalFetchError) return NextResponse.json({ ok: false, error: portalFetchError.message }, { status: 500 });
  if (!portalRow?.id) return NextResponse.json({ ok: false, error: "Remate no encontrado." }, { status: 404 });

  const { error: portalUpdateError } = await admin
    .from("portal_remates")
    .update({
      titulo: portalTitle,
      descripcion: descripcion || null,
      estado,
      starts_at: startIso,
      ends_at: endsAt,
      source_event_number: numeroRemate,
    })
    .eq("id", remateId);
  if (portalUpdateError) return NextResponse.json({ ok: false, error: portalUpdateError.message }, { status: 500 });

  let tasacionesRemateId = String(portalRow.tasaciones_remate_id ?? "").trim();
  if (!tasacionesRemateId) {
    const { data: syncedTasId, error: syncError } = await admin.rpc("portal_integracion_sync_portal_remate_to_tasaciones", {
      p_portal_remate_id: remateId,
    });
    if (syncError) return NextResponse.json({ ok: false, error: syncError.message }, { status: 500 });
    tasacionesRemateId = String(syncedTasId ?? "").trim();
    if (!tasacionesRemateId) {
      return NextResponse.json({ ok: false, error: "No se pudo crear/vincular remate en Tasaciones." }, { status: 500 });
    }
  }

  const { error: tasUpdateError } = await admin
    .from("remates")
    .update({
      descripcion: descripcion || null,
      fecha_hora_inicio: startIso,
      fecha_hora_cierre: endsAt,
      fecha_hora_remate: endsAt,
      estado: mapPortalEstadoToTasaciones(estado),
    })
    .eq("id", tasacionesRemateId);
  if (tasUpdateError) return NextResponse.json({ ok: false, error: tasUpdateError.message }, { status: 500 });

  const { error: relinkError } = await admin
    .from("portal_remates")
    .update({
      tasaciones_remate_id: tasacionesRemateId,
      source_system: "tasaciones",
      source_event_number: numeroRemate,
      titulo: portalTitle,
      descripcion: descripcion || null,
    })
    .eq("id", remateId);
  if (relinkError) return NextResponse.json({ ok: false, error: relinkError.message }, { status: 500 });

  const { error: outboxError } = await admin.rpc("portal_integracion_procesar_outbox", { p_limit: 400 });
  if (outboxError) {
    return NextResponse.json({ ok: false, error: `Actualizado, pero falló outbox: ${outboxError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tasacionesRemateId, numeroRemate, titulo: portalTitle });
}

