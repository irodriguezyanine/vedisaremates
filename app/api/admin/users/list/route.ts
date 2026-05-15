import { NextResponse } from "next/server";

import type { ListaUsuarioRow } from "@/lib/portal-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const PAGE_SIZE = 1000;
const MAX_PAGES = 250;

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

  // Camino A (preferido): SERVICE_ROLE presente => ignora diferencias de RLS entre entornos.
  const admin = createAdminClient();
  if (admin) {
    const profileRows: ListaUsuarioRow[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data: chunk, error: profilesError } = await admin
        .from("profiles")
        .select("id, nombre, rol, created_at, must_change_password, garantia_aprobada")
        .order("created_at", { ascending: false })
        .range(from, to);
      if (profilesError) return NextResponse.json({ ok: false, error: profilesError.message }, { status: 500 });
      const rows = ((chunk ?? []) as ListaUsuarioRow[]) || [];
      profileRows.push(...rows);
      if (rows.length < PAGE_SIZE) break;
    }

    const authUsersById = new Map<string, string | null>();
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: PAGE_SIZE,
      });
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      const list = data?.users ?? [];
      for (const u of list) {
        authUsersById.set(String(u.id), u.email ?? null);
      }
      if (list.length < PAGE_SIZE) break;
    }

    const rows: ListaUsuarioRow[] = profileRows.map((p) => ({
      ...p,
      email: authUsersById.get(String(p.id)) ?? null,
    }));
    return NextResponse.json({ ok: true, rows });
  }

  // Camino B (fallback): RPC legacy del proyecto.
  const { data, error } = await supabase.rpc("listar_usuarios");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, rows: ((data ?? []) as ListaUsuarioRow[]) || [] });
}

