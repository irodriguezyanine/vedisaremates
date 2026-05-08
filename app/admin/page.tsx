import { SupabaseDeployWarning } from "@/components/supabase-deploy-warning";
import { createClient } from "@/lib/supabase/server";

export default async function AdminHomePage() {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <div className="mx-auto max-w-2xl">
        <SupabaseDeployWarning compact />
      </div>
    );
  }

  const [rematesRes, lotesRes, invRes] = await Promise.all([
    supabase.from("portal_remates").select("id", { count: "exact", head: true }),
    supabase.from("portal_remate_lotes").select("id", { count: "exact", head: true }),
    supabase.from("inventario").select("id", { count: "exact", head: true }),
  ]);

  const rematesCount = rematesRes.count ?? 0;
  const lotesCount = lotesRes.count ?? 0;
  const invCount = invRes.count ?? 0;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10">
      <div>
        <h1 className="text-2xl font-bold text-white">Panel general</h1>
        <p className="mt-2 max-w-xl text-sm text-neutral-400">
          Gestioná remates, lotes vinculados al inventario y cuentas de participantes.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard title="Ítems inventario Tasaciones" value={invCount} />
        <MetricCard title="Remates configurados" value={rematesCount} />
        <MetricCard title="Lotes sumados" value={lotesCount} />
      </div>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#141c28] p-5">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{title}</p>
      <p className="mt-3 text-3xl font-black text-[#33C7E3]">{value}</p>
    </div>
  );
}
