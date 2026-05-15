import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const CHUNK_SIZE = 200;

type Body = { userIds?: unknown };

function isPrivilegedRole(role: string): boolean {
  return ["admin", "sac"].includes(role);
}

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
  if (!isPrivilegedRole(role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const userIds = Array.isArray(body.userIds)
    ? Array.from(new Set(body.userIds.map((v) => String(v ?? "").trim()).filter((id) => id && isUuid(id))))
    : [];
  if (!userIds.length) return NextResponse.json({ ok: true, rows: [] });

  const allRows: Array<{ id: string; garantia_aprobada: boolean | null }> = [];
  for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + CHUNK_SIZE);
    // Usar el mismo contexto de sesión/base que el panel y la puja para evitar
    // desalineaciones visuales de garantía entre admin y subastas.
    const { data, error } = await supabase.from("profiles").select("id, garantia_aprobada").in("id", chunk);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    for (const row of (data ?? []) as Array<{ id: string; garantia_aprobada: boolean | null }>) {
      allRows.push(row);
    }
  }

  return NextResponse.json({ ok: true, rows: allRows });
}

