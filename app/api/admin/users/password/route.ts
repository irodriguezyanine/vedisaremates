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

export async function POST(request: Request) {
  const auth = await authorizeAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: auth.status });

  const body = (await request.json().catch(() => ({}))) as { userId?: string; email?: string; password?: string };
  const userId = String(body.userId ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!userId && !email) return NextResponse.json({ ok: false, error: "Falta userId o email." }, { status: 400 });
  if (password.length < 6) {
    return NextResponse.json({ ok: false, error: "La contraseña debe tener al menos 6 caracteres." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Falta cliente admin." }, { status: 500 });

  let authUserId = userId;
  if (email) {
    const { data: authUserRow, error: authUserError } = await admin
      .schema("auth")
      .from("users")
      .select("id")
      .ilike("email", email)
      .limit(1)
      .maybeSingle<{ id: string | null }>();
    if (authUserError) {
      return NextResponse.json({ ok: false, error: `No se pudo resolver usuario por email: ${authUserError.message}` }, { status: 500 });
    }
    if (!authUserRow?.id) {
      return NextResponse.json({ ok: false, error: "No existe usuario auth para ese email." }, { status: 404 });
    }
    authUserId = String(authUserRow.id);
  }

  const { error } = await admin.auth.admin.updateUserById(authUserId, { password });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, userId: authUserId });
}
