import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { SupabaseDeployWarning } from "@/components/supabase-deploy-warning";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <div className="flex min-h-screen justify-center bg-[#0c1016] px-4 py-14">
        <SupabaseDeployWarning />
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/ingreso?redirect=/admin");
  }

  const { data: profile } = await supabase.from("profiles").select("rol, nombre").eq("id", user.id).maybeSingle();

  if ((profile?.rol ?? "").toLowerCase() !== "admin") {
    redirect("/subastas");
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <AdminSidebar />
      <div className="min-h-screen flex-1 bg-[#0c1016] lg:overflow-auto">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-[#141c28] px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-500">Sesión administrador</p>
            <p className="text-lg font-semibold text-white">{profile?.nombre?.trim() || user.email}</p>
          </div>
          <Link
            href="/"
            className="shrink-0 rounded-lg border border-[#33C7E3]/50 bg-[#33C7E3]/10 px-4 py-2 text-sm font-semibold text-[#33C7E3] transition hover:border-[#33C7E3] hover:bg-[#33C7E3]/20"
          >
            ← Volver al inicio
          </Link>
        </header>
        <div className="p-6 text-neutral-200">{children}</div>
      </div>
    </div>
  );
}
