import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function normalizeIdentifier(raw: unknown) {
  if (typeof raw !== "string") return "";
  return raw.trim();
}

function normalizeUsernameCandidate(raw: string) {
  return raw
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .slice(0, 40);
}

async function resolveEmailByUsername(identifier: string) {
  const admin = createAdminClient();
  if (!admin) return null;

  const candidates = Array.from(
    new Set([identifier, normalizeUsernameCandidate(identifier)].map((v) => v.trim()).filter(Boolean)),
  );

  for (const candidate of candidates) {
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id")
      .ilike("username", candidate)
      .limit(1)
      .maybeSingle<{ id: string | null }>();
    if (profileError || !profile?.id) continue;

    const { data: userData, error } = await admin.auth.admin.getUserById(profile.id);
    const resolved = userData?.user?.email?.trim().toLowerCase();
    if (!error && resolved && EMAIL_RE.test(resolved)) return resolved;
  }

  return null;
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

  const resolved = await resolveEmailByUsername(identifier);
  if (resolved) {
    return NextResponse.json({ ok: true, email: resolved });
  }

  // Respuesta neutra para no filtrar existencia de usuarios.
  return NextResponse.json({ ok: false, error: "credenciales_invalidas" }, { status: 400 });
}
