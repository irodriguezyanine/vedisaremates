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

  // Camino A (preferido): usar el RPC del proyecto para respetar la lógica histórica
  // de clasificación/filtrado de usuarios que espera el panel.
  const { data: rpcRows, error: rpcError } = await supabase.rpc("listar_usuarios");
  if (!rpcError && Array.isArray(rpcRows)) {
    const rows = ((rpcRows as ListaUsuarioRow[]) || []).map((r) => ({ ...r }));
    const ids = rows.map((r) => String(r.id ?? "").trim()).filter(Boolean);
    if (!ids.length) return NextResponse.json({ ok: true, rows });

    const { data: empresasRows } = await supabase.from("profiles").select("id, empresa").in("id", ids);
    const empresaById = new Map<string, string | null>();
    for (const row of (empresasRows ?? []) as Array<{ id: string; empresa: string | null }>) {
      empresaById.set(String(row.id), row.empresa ?? null);
    }
    const merged = rows.map((row) => ({
      ...row,
      empresa: empresaById.get(String(row.id)) ?? null,
    }));
    return NextResponse.json({ ok: true, rows: merged });
  }

  // Camino B (fallback técnico): SERVICE_ROLE presente => evita caída total si el RPC falla.
  const admin = createAdminClient();
  if (admin) {
    const profileRows: ListaUsuarioRow[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data: chunk, error: profilesError } = await admin
        .from("profiles")
        .select("id, nombre, rol, empresa, created_at, must_change_password, garantia_aprobada")
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
    return NextResponse.json({
      ok: true,
      rows,
      source: "fallback_admin_profiles",
      note: rpcError?.message ?? null,
    });
  }

  return NextResponse.json({ ok: false, error: rpcError?.message ?? "listar_usuarios_no_disponible" }, { status: 500 });
}

