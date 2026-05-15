import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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

function isRetryableSyncError(errorMessage: string): boolean {
  const message = String(errorMessage).toLowerCase();
  return (
    message.includes("statement timeout") ||
    message.includes("canceling statement due to statement timeout") ||
    message.includes("deadlock detected") ||
    message.includes("could not obtain lock") ||
    message.includes("canceling statement due to lock timeout")
  );
}

function formatApiError(error: unknown, fallback: string): string {
  const raw = String(error ?? "").trim();
  if (!raw) return fallback;
  const lower = raw.toLowerCase();
  if (
    lower.includes("<html") ||
    lower.includes("<!doctype html") ||
    lower.includes("cloudflare") ||
    lower.includes("error 520")
  ) {
    return "Servicio de sincronización temporalmente inestable. Reintenta en unos segundos.";
  }
  return raw.length > 240 ? `${raw.slice(0, 240)}…` : raw;
}

type TasacionesRemateRow = {
  id: string | null;
  numero_remate: string | null;
  descripcion: string | null;
  fecha_hora_inicio: string | null;
  fecha_hora_cierre: string | null;
  fecha_hora_remate: string | null;
  estado: string | null;
};

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

function extractEventNumberCandidate(title: string, sourceEventNumber: string): string {
  const fromEvent = normalizeDigits(String(sourceEventNumber ?? ""));
  if (fromEvent) return fromEvent;
  const match = String(title ?? "").match(/#\s*([0-9]+)/);
  return normalizeDigits(match?.[1] ?? "");
}

function buildPortalState(startsAtIso: string, endsAtIso: string, tasacionesState: string | null): "publicado" | "en_curso" | "cerrado" {
  const now = Date.now();
  const startMs = new Date(startsAtIso).getTime();
  const endMs = new Date(endsAtIso).getTime();
  const source = String(tasacionesState ?? "").trim().toLowerCase();
  // Para mantener consistencia con "históricos = pasados" de Tasaciones,
  // privilegiamos ventana temporal por sobre flags textuales de estado.
  if (Number.isFinite(endMs) && endMs <= now) return "cerrado";
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && startMs <= now && now < endMs) return "en_curso";
  if (source === "en_curso") return "en_curso";
  return "publicado";
}

async function reconcileTasacionesRematesMirror(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  maxRows: number,
  strictCleanup: boolean,
): Promise<{ mirrored: number; removed: number; linked: number; orphaned: number }> {
  const sourceLimit = Math.max(1, Math.min(maxRows, 50000));
  const pageSize = 1000;
  const rows: TasacionesRemateRow[] = [];
  for (let offset = 0; offset < sourceLimit; offset += pageSize) {
    const upper = Math.min(sourceLimit - 1, offset + pageSize - 1);
    const { data: sourceRows, error: sourceError } = await admin
      .from("remates")
      .select("id, numero_remate, descripcion, fecha_hora_inicio, fecha_hora_cierre, fecha_hora_remate, estado")
      .order("created_at", { ascending: false })
      .range(offset, upper);
    if (sourceError) throw new Error(`Error leyendo remates compartidos: ${sourceError.message}`);
    const chunk = (sourceRows ?? []) as TasacionesRemateRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }

  const payload = rows
    .filter((row) => row?.id)
    .map((row) => {
      const endsAt = String(row.fecha_hora_cierre ?? row.fecha_hora_remate ?? "").trim();
      const startsAt =
        String(row.fecha_hora_inicio ?? "").trim() ||
        (endsAt ? new Date(new Date(endsAt).getTime() - 24 * 60 * 60 * 1000).toISOString() : new Date().toISOString());
      const numero = String(row.numero_remate ?? "").trim();
      const descripcion = String(row.descripcion ?? "").trim();
      const titulo = descripcion || "Sin nombre";
      return {
        titulo,
        descripcion: descripcion || null,
        estado: buildPortalState(startsAt, endsAt || startsAt, row.estado),
        starts_at: startsAt,
        ends_at: endsAt || startsAt,
        source_system: "tasaciones",
        tasaciones_remate_id: String(row.id),
        source_event_number: numero || null,
      };
    });

  const sourceById = new Set(payload.map((row) => row.tasaciones_remate_id));
  const sourceByNumber = new Map<string, string>();
  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    const key = normalizeDigits(String(row.numero_remate ?? ""));
    if (!key) continue;
    sourceByNumber.set(key, id);
  }

  if (payload.length) {
    const { error: upsertError } = await admin.from("portal_remates").upsert(payload, { onConflict: "tasaciones_remate_id" });
    if (upsertError) throw new Error(`Error espejando remates en portal: ${upsertError.message}`);
  }

  const orphanCandidates: Array<{ id: string; eventNumber: string }> = [];
  for (let offset = 0; offset < 50000; offset += pageSize) {
    const upper = offset + pageSize - 1;
    const { data: orphanChunk, error: orphanError } = await admin
      .from("portal_remates")
      .select("id, titulo, source_event_number")
      .eq("source_system", "tasaciones")
      .is("tasaciones_remate_id", null)
      .range(offset, upper);
    if (orphanError) throw new Error(`Error leyendo remates huérfanos de portal: ${orphanError.message}`);
    const rowsChunk = (orphanChunk ?? []) as Array<{
      id: string | null;
      titulo: string | null;
      source_event_number: string | null;
    }>;
    for (const row of rowsChunk) {
      const id = String(row.id ?? "").trim();
      if (!id) continue;
      orphanCandidates.push({
        id,
        eventNumber: extractEventNumberCandidate(String(row.titulo ?? ""), String(row.source_event_number ?? "")),
      });
    }
    if (rowsChunk.length < pageSize) break;
  }

  let linked = 0;
  const unresolvedOrphans: string[] = [];
  for (const orphan of orphanCandidates) {
    const targetTasId = orphan.eventNumber ? sourceByNumber.get(orphan.eventNumber) : undefined;
    if (targetTasId && sourceById.has(targetTasId)) {
      const { error: linkError } = await admin
        .from("portal_remates")
        .update({ tasaciones_remate_id: targetTasId, source_event_number: orphan.eventNumber || null })
        .eq("id", orphan.id);
      if (linkError) throw new Error(`Error vinculando remate huérfano ${orphan.id}: ${linkError.message}`);
      linked += 1;
    } else {
      unresolvedOrphans.push(orphan.id);
    }
  }

  const portalRows: Array<{ id: string | null; tasaciones_remate_id: string | null }> = [];
  for (let offset = 0; offset < 50000; offset += pageSize) {
    const upper = offset + pageSize - 1;
    const { data: portalChunk, error: portalTasError } = await admin
      .from("portal_remates")
      .select("id, tasaciones_remate_id")
      .not("tasaciones_remate_id", "is", null)
      .range(offset, upper);
    if (portalTasError) throw new Error(`Error leyendo espejo de portal: ${portalTasError.message}`);
    const rowsChunk = (portalChunk ?? []) as Array<{ id: string | null; tasaciones_remate_id: string | null }>;
    portalRows.push(...rowsChunk);
    if (rowsChunk.length < pageSize) break;
  }

  const stalePortalIds = portalRows
    .filter((row) => row.id && row.tasaciones_remate_id && !sourceById.has(String(row.tasaciones_remate_id)))
    .map((row) => String(row.id));

  if (strictCleanup && unresolvedOrphans.length) {
    stalePortalIds.push(...unresolvedOrphans);
  }

  let removed = 0;
  for (let i = 0; i < stalePortalIds.length; i += 200) {
    const chunk = stalePortalIds.slice(i, i + 200);
    const { error: deleteError } = await admin.from("portal_remates").delete().in("id", chunk);
    if (deleteError) throw new Error(`Error limpiando remates obsoletos en portal: ${deleteError.message}`);
    removed += chunk.length;
  }

  return {
    mirrored: payload.length,
    removed,
    linked,
    orphaned: unresolvedOrphans.length,
  };
}

export async function GET() {
  try {
    const auth = await authorizeAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: auth.status });
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ ok: false, error: "Falta cliente admin." }, { status: 500 });
    const { data, error } = await admin.rpc("portal_integracion_sync_dashboard");
    if (error) return NextResponse.json({ ok: false, error: formatApiError(error.message, "Error de dashboard.") }, { status: 500 });
    const stats = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: formatApiError(error, "No se pudo consultar el estado de sincronización.") },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authorizeAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: auth.status });
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ ok: false, error: "Falta cliente admin." }, { status: 500 });

    const body = (await req.json().catch(() => ({}))) as { full?: boolean };
    const fullSync = Boolean(body.full);
    const bootstrapLimit = fullSync ? 5000 : 300;
    const outboxLimit = fullSync ? 1200 : 400;
    const warnings: string[] = [];

    const bootTas = await admin.rpc("portal_integracion_bootstrap_desde_tasaciones", { p_limit: bootstrapLimit });
    if (bootTas.error && !isRetryableSyncError(bootTas.error.message)) {
      return NextResponse.json({ ok: false, error: formatApiError(bootTas.error.message, "Error bootstrap tasaciones.") }, { status: 500 });
    }
    if (bootTas.error) warnings.push(`bootstrap_tasaciones: ${formatApiError(bootTas.error.message, "timeout")}`);

    const bootPortal = await admin.rpc("portal_integracion_bootstrap_desde_portal", { p_limit: bootstrapLimit });
    if (bootPortal.error && !isRetryableSyncError(bootPortal.error.message)) {
      return NextResponse.json({ ok: false, error: formatApiError(bootPortal.error.message, "Error bootstrap portal.") }, { status: 500 });
    }
    if (bootPortal.error) warnings.push(`bootstrap_portal: ${formatApiError(bootPortal.error.message, "timeout")}`);

    const processRes = await admin.rpc("portal_integracion_procesar_outbox", { p_limit: outboxLimit });
    if (processRes.error && !isRetryableSyncError(processRes.error.message)) {
      return NextResponse.json({ ok: false, error: formatApiError(processRes.error.message, "Error procesando outbox.") }, { status: 500 });
    }
    if (processRes.error) warnings.push(`procesar_outbox: ${formatApiError(processRes.error.message, "timeout")}`);

    const statsRes = await admin.rpc("portal_integracion_sync_dashboard");
    if (statsRes.error) warnings.push(`sync_dashboard: ${formatApiError(statsRes.error.message, "timeout")}`);

    let mirror: { mirrored: number; removed: number } | null = null;
    try {
      mirror = await reconcileTasacionesRematesMirror(admin, fullSync ? 50000 : 10000, fullSync);
    } catch (mirrorError) {
      const formatted = formatApiError(mirrorError, "No se pudo reconciliar espejo de remates.");
      if (fullSync) {
        return NextResponse.json({ ok: false, error: formatted }, { status: 500 });
      }
      warnings.push(`mirror_reconcile: ${formatted}`);
    }

    return NextResponse.json({
      ok: true,
      full_sync: fullSync,
      limits: { bootstrap: bootstrapLimit, outbox: outboxLimit },
      mirror,
      bootstrap_tasaciones: bootTas.data,
      bootstrap_portal: bootPortal.data,
      processed: processRes.data,
      stats: Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data,
      warnings,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: formatApiError(error, "No se pudo ejecutar la sincronización.") },
      { status: 500 },
    );
  }
}
