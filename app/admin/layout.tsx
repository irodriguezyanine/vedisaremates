import { redirect } from "next/navigation";

import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/ingreso?redirect=/admin");
  }

  const { data: profile } = await supabase.from("profiles").select("rol, nombre").eq("id", user.id).maybeSingle();

  if (profile?.rol !== "admin") {
    redirect("/subastas");
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <AdminSidebar />
      <div className="min-h-screen flex-1 bg-[#0c1016] lg:overflow-auto">
        <header className="border-b border-white/10 bg-[#141c28] px-6 py-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Sesión administrador</p>
          <p className="text-lg font-semibold text-white">{profile?.nombre?.trim() || user.email}</p>
        </header>
        <div className="p-6 text-neutral-200">{children}</div>
      </div>
    </div>
  );
}
