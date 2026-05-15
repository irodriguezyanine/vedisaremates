import { NextResponse } from "next/server";

import type { ListaUsuarioRow } from "@/lib/portal-types";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isPrivilegedRole(role: string): boolean {
  return ["admin", "sac"].includes(role);
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "servicio_no_disponible" }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("rol").eq("id", user.id).maybeSingle();
  const role = String(profile?.rol ?? "").trim().toLowerCase();
  if (!isPrivilegedRole(role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  // Evitamos depender de SERVICE_ROLE en este endpoint.
  // Usamos el RPC existente del proyecto para listar usuarios.
  const { data, error } = await supabase.rpc("listar_usuarios");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, rows: ((data ?? []) as ListaUsuarioRow[]) || [] });
}

