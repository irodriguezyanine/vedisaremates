import Link from "next/link";

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
          Gestioná remates enlazados al inventario de Tasaciones Vedisa y las cuentas compartidas vía Supabase Auth.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard title="Ítems inventario Tasaciones" value={invCount} />
        <MetricCard title="Remates configurados" value={rematesCount} />
        <MetricCard title="Lotes sumados" value={lotesCount} />
      </div>

      <div className="rounded-xl border border-white/10 bg-[#141c28] p-5">
        <h2 className="font-semibold text-white">Pasos rápidos</h2>
        <ol className="mt-6 list-inside list-decimal space-y-3 text-sm text-neutral-400">
          <li>Ejecutá el SQL nuevo en tu proyecto Supabase (`supabase/migrations/portal_subastas_vedisaremates.sql`).</li>
          <li>En Remates creá un evento con fechas de inicio y fin.</li>
          <li>Añadí lotes desde Inventario; publicá y luego marcá estado &quot;en curso&quot; para habilitar ofertas.</li>
          <li>
            Sala pública:{" "}
            <Link className="text-[#33C7E3] hover:underline" href="/subastas">
              /subastas
            </Link>
            .
          </li>
        </ol>
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
