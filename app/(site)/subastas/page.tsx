import Link from "next/link";

import { SupabaseDeployWarning } from "@/components/supabase-deploy-warning";
import { createClient } from "@/lib/supabase/server";
import type { PortalRemateRow } from "@/lib/portal-types";

export default async function SubastasIndexPage() {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-14">
        <h1 className="text-3xl font-black text-neutral-900">Sala de subastas</h1>
        <SupabaseDeployWarning />
      </div>
    );
  }

  const { data, error } = await supabase
    .from("portal_remates")
    .select("*")
    .in("estado", ["publicado", "en_curso", "cerrado"])
    .order("ends_at", { ascending: true });

  const rows = ((data ?? []) as PortalRemateRow[]) ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <h1 className="text-3xl font-black text-neutral-900">Sala de subastas</h1>
      <p className="mt-3 max-w-2xl text-neutral-600">
        Eventos en vivo con ofertas en tiempo real. Iniciá sesión para participar; las cuentas son las mismas que en
        Tasaciones Vedisa.
      </p>

      {error ? (
        <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No se pudo cargar la lista ({error.message}). Revisá variables{" "}
          <code className="rounded bg-black/5 px-1">NEXT_PUBLIC_SUPABASE_*</code> y que ejecutaste el SQL portal en tu
          Supabase.
        </p>
      ) : null}

      <ul className="mt-10 space-y-4">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/subastas/${r.id}`}
              className="block rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-[#33C7E3]/60 hover:shadow-md"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-neutral-900">{r.titulo}</h2>
                  <p className="mt-2 line-clamp-2 text-sm text-neutral-600">{r.descripcion}</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#e8f4fc] px-3 py-1 text-xs font-bold capitalize text-[#1a2c4e]">
                  {r.estado.replaceAll("_", " ")}
                </span>
              </div>
              <p className="mt-4 text-xs text-neutral-500">Cierre: {new Date(r.ends_at).toLocaleString("es-CL")}</p>
            </Link>
          </li>
        ))}
      </ul>

      {!rows.length && !error ? (
        <p className="mt-10 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-neutral-600">
          Todavía no hay remates publicados. Cuando los administradores creen eventos y los marquen como publicados,
          aparecerán acá automáticamente.
        </p>
      ) : null}
    </div>
  );
}
