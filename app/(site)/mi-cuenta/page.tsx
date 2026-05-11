import Link from "next/link";
import { redirect } from "next/navigation";

import { MiCuentaDashboard } from "@/components/portal/mi-cuenta-dashboard";
import { SupabaseDeployWarning } from "@/components/supabase-deploy-warning";
import { createClient } from "@/lib/supabase/server";

export default async function MiCuentaPage() {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <div className="mx-auto max-w-xl px-4 py-14">
        <SupabaseDeployWarning compact />
        <Link href="/" className="mt-6 inline-block text-sm font-semibold text-[#009ade] hover:underline">
          ← Inicio
        </Link>
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/ingreso?redirect=${encodeURIComponent("/mi-cuenta")}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("nombre, apellido, rut, direccion, telefono, avatar_url, rol, must_change_password")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <MiCuentaDashboard
      email={user.email ?? ""}
      initialNombre={profile?.nombre ?? null}
      initialApellido={profile?.apellido ?? null}
      initialRut={profile?.rut ?? null}
      initialDireccion={profile?.direccion ?? null}
      initialTelefono={profile?.telefono ?? null}
      initialAvatarUrl={profile?.avatar_url ?? null}
      initialRol={profile?.rol ?? null}
      mustChangePassword={Boolean(profile?.must_change_password)}
    />
  );
}
