import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Body = {
  userIds?: unknown;
  garantiaAprobada?: unknown;
};

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
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
  if (role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Body;
  const garantiaAprobada = body.garantiaAprobada === true;
  const userIds = Array.isArray(body.userIds)
    ? Array.from(new Set(body.userIds.map((v) => String(v ?? "").trim()).filter((id) => id && isUuid(id))))
    : [];
  if (!userIds.length) return NextResponse.json({ ok: false, error: "sin_ids" }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "auth_admin_no_configurado" }, { status: 500 });

  const nowIso = new Date().toISOString();
  const { data, error } = await admin
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
  return NextResponse.json({
    ok: true,
    updated: updatedIds.size,
    failed: failedIds.length,
    failedIds,
  });
}

