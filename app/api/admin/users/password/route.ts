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

  // Primero intentamos validar userId directo si viene.
  if (authUserId) {
    const { data: userById, error: userByIdError } = await admin.auth.admin.getUserById(authUserId);
    if (userByIdError || !userById?.user?.id) {
      authUserId = "";
    }
  }

  // Fallback robusto: resolver por email usando la API admin (sin tocar schema auth).
  if (!authUserId && email) {
    let page = 1;
    const perPage = 200;
    let foundId = "";

    while (page <= 50 && !foundId) {
      const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page, perPage });
      if (usersError) {
        return NextResponse.json(
          { ok: false, error: `No se pudo listar usuarios auth para resolver email: ${usersError.message}` },
          { status: 500 },
        );
      }
      const users = usersData?.users ?? [];
      const match = users.find((user) => String(user.email ?? "").trim().toLowerCase() === email);
      if (match?.id) {
        foundId = match.id;
        break;
      }
      if (users.length < perPage) break;
      page += 1;
    }

    if (!foundId) {
      return NextResponse.json({ ok: false, error: "No existe usuario auth para ese email." }, { status: 404 });
    }
    authUserId = foundId;
  }

  if (!authUserId) {
    return NextResponse.json({ ok: false, error: "No se pudo resolver userId de autenticación." }, { status: 500 });
  }

  const { error } = await admin.auth.admin.updateUserById(authUserId, {
    password,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, userId: authUserId });
}
