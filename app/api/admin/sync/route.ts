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

export async function GET() {
  const auth = await authorizeAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: auth.status });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Falta cliente admin." }, { status: 500 });
  const { data, error } = await admin.rpc("portal_integracion_sync_dashboard");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const stats = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, stats });
}

export async function POST() {
  const auth = await authorizeAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: auth.status });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Falta cliente admin." }, { status: 500 });

  const warnings: string[] = [];

  const bootTas = await admin.rpc("portal_integracion_bootstrap_desde_tasaciones", { p_limit: 300 });
  if (bootTas.error && !isRetryableSyncError(bootTas.error.message)) {
    return NextResponse.json({ ok: false, error: bootTas.error.message }, { status: 500 });
  }
  if (bootTas.error) warnings.push(`bootstrap_tasaciones: ${bootTas.error.message}`);

  const bootPortal = await admin.rpc("portal_integracion_bootstrap_desde_portal", { p_limit: 300 });
  if (bootPortal.error && !isRetryableSyncError(bootPortal.error.message)) {
    return NextResponse.json({ ok: false, error: bootPortal.error.message }, { status: 500 });
  }
  if (bootPortal.error) warnings.push(`bootstrap_portal: ${bootPortal.error.message}`);

  const processRes = await admin.rpc("portal_integracion_procesar_outbox", { p_limit: 400 });
  if (processRes.error && !isRetryableSyncError(processRes.error.message)) {
    return NextResponse.json({ ok: false, error: processRes.error.message }, { status: 500 });
  }
  if (processRes.error) warnings.push(`procesar_outbox: ${processRes.error.message}`);

  const statsRes = await admin.rpc("portal_integracion_sync_dashboard");
  if (statsRes.error) warnings.push(`sync_dashboard: ${statsRes.error.message}`);

  return NextResponse.json({
    ok: true,
    bootstrap_tasaciones: bootTas.data,
    bootstrap_portal: bootPortal.data,
    processed: processRes.data,
    stats: Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data,
    warnings,
  });
}
