import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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

  const [replayRes, processRes, statsRes] = await Promise.all([
    admin.rpc("portal_integracion_replay_failed", { p_limit: 500 }),
    admin.rpc("portal_integracion_procesar_outbox", { p_limit: 5000 }),
    admin.rpc("portal_integracion_sync_dashboard"),
  ]);

  const firstError = replayRes.error ?? processRes.error ?? statsRes.error;
  if (firstError) {
    return NextResponse.json({ ok: false, error: firstError.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    replay: replayRes.data,
    processed: processRes.data,
    stats: Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data,
  });
}
