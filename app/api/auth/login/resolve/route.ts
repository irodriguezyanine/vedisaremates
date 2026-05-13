import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function normalizeIdentifier(raw: unknown) {
  if (typeof raw !== "string") return "";
  return raw.trim();
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "json_invalido" }, { status: 400 });
  }

  const identifier = normalizeIdentifier(body.identifier);
  if (!identifier) {
    return NextResponse.json({ ok: false, error: "identificador_requerido" }, { status: 400 });
  }

  if (EMAIL_RE.test(identifier)) {
    return NextResponse.json({ ok: true, email: identifier.toLowerCase() });
  }

  const admin = createAdminClient();
  if (!admin) {
    // fallback neutro: cliente intentará login con el valor original
    return NextResponse.json({ ok: true, email: identifier });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", identifier)
    .maybeSingle<{ id: string | null }>();

  if (profile?.id) {
    const { data: userData, error } = await admin.auth.admin.getUserById(profile.id);
    const resolved = userData?.user?.email?.trim().toLowerCase();
    if (!error && resolved) {
      return NextResponse.json({ ok: true, email: resolved });
    }
  }

  // fallback neutro para no exponer si el username existe
  return NextResponse.json({ ok: true, email: identifier });
}
