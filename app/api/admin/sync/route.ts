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

export async function POST() {
  try {
    const auth = await authorizeAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: auth.status });
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ ok: false, error: "Falta cliente admin." }, { status: 500 });

    const warnings: string[] = [];

    const bootTas = await admin.rpc("portal_integracion_bootstrap_desde_tasaciones", { p_limit: 300 });
    if (bootTas.error && !isRetryableSyncError(bootTas.error.message)) {
      return NextResponse.json({ ok: false, error: formatApiError(bootTas.error.message, "Error bootstrap tasaciones.") }, { status: 500 });
    }
    if (bootTas.error) warnings.push(`bootstrap_tasaciones: ${formatApiError(bootTas.error.message, "timeout")}`);

    const bootPortal = await admin.rpc("portal_integracion_bootstrap_desde_portal", { p_limit: 300 });
    if (bootPortal.error && !isRetryableSyncError(bootPortal.error.message)) {
      return NextResponse.json({ ok: false, error: formatApiError(bootPortal.error.message, "Error bootstrap portal.") }, { status: 500 });
    }
    if (bootPortal.error) warnings.push(`bootstrap_portal: ${formatApiError(bootPortal.error.message, "timeout")}`);

    const processRes = await admin.rpc("portal_integracion_procesar_outbox", { p_limit: 400 });
    if (processRes.error && !isRetryableSyncError(processRes.error.message)) {
      return NextResponse.json({ ok: false, error: formatApiError(processRes.error.message, "Error procesando outbox.") }, { status: 500 });
    }
    if (processRes.error) warnings.push(`procesar_outbox: ${formatApiError(processRes.error.message, "timeout")}`);

    const statsRes = await admin.rpc("portal_integracion_sync_dashboard");
    if (statsRes.error) warnings.push(`sync_dashboard: ${formatApiError(statsRes.error.message, "timeout")}`);

    return NextResponse.json({
      ok: true,
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
