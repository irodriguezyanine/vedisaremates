import { NextResponse } from "next/server";

import type { ListaUsuarioRow } from "@/lib/portal-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const PAGE_SIZE = 1000;
const MAX_USERS = 10000;

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

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "auth_admin_no_configurado" }, { status: 500 });

  const { data: profilesData, error: profilesError } = await admin
    .from("profiles")
    .select("id, email, nombre, rol, created_at, must_change_password, garantia_aprobada")
    .order("created_at", { ascending: false })
    .limit(MAX_USERS);
  if (profilesError) return NextResponse.json({ ok: false, error: profilesError.message }, { status: 500 });

  const profileRows = ((profilesData ?? []) as ListaUsuarioRow[]) || [];
  const byId = new Map(profileRows.map((p) => [String(p.id), p] as const));

  const authUsersById = new Map<string, string | null>();
  for (let page = 1; page < 100; page += 1) {
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
    email: authUsersById.get(String(p.id)) ?? p.email ?? null,
  }));

  // Mantenemos formato compatible con el RPC existente.
  return NextResponse.json({ ok: true, rows });
}

