import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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

function isAuthorized(req: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return true;
  const provided = req.headers.get("x-cron-secret")?.trim() ?? "";
  return provided.length > 0 && provided === expected;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Falta cliente admin." }, { status: 500 });
  }

  const warnings: string[] = [];
  const replayRes = await admin.rpc("portal_integracion_replay_failed", { p_limit: 120 });
  if (replayRes.error && !isRetryableSyncError(replayRes.error.message)) {
    return NextResponse.json({ ok: false, error: replayRes.error.message }, { status: 500 });
  }
  if (replayRes.error) warnings.push(`replay_failed: ${replayRes.error.message}`);

  const processRes = await admin.rpc("portal_integracion_procesar_outbox", { p_limit: 300 });
  if (processRes.error && !isRetryableSyncError(processRes.error.message)) {
    return NextResponse.json({ ok: false, error: processRes.error.message }, { status: 500 });
  }
  if (processRes.error) warnings.push(`procesar_outbox: ${processRes.error.message}`);

  const statsRes = await admin.rpc("portal_integracion_sync_dashboard");
  if (statsRes.error) warnings.push(`sync_dashboard: ${statsRes.error.message}`);

  return NextResponse.json({
    ok: true,
    replay: replayRes.data,
    processed: processRes.data,
    stats: Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data,
    warnings,
  });
}
