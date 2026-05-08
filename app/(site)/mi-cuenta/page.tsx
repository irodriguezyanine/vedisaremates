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

  const { data: profile } = await supabase.from("profiles").select("nombre, rol").eq("id", user.id).maybeSingle();

  return (
    <MiCuentaDashboard email={user.email ?? ""} initialNombre={profile?.nombre ?? null} initialRol={profile?.rol ?? null} />
  );
}
