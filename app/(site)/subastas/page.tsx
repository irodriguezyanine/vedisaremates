import Link from "next/link";

import { SupabaseDeployWarning } from "@/components/supabase-deploy-warning";
import type { PortalRemateRow } from "@/lib/portal-types";
import { fetchRemateThumbnailMap } from "@/lib/remate-cover-thumbnails";
import { createClient } from "@/lib/supabase/server";

function estadoLabel(e: PortalRemateRow["estado"]) {
  const map: Record<PortalRemateRow["estado"], string> = {
    borrador: "Borrador",
    publicado: "Publicado",
    en_curso: "En curso",
    cerrado: "Cerrado",
  };
  return map[e] ?? e;
}

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

  const thumbMap = await fetchRemateThumbnailMap(
    supabase,
    rows.map((r) => r.id),
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <h1 className="text-3xl font-black text-neutral-900">Sala de subastas</h1>
      <p className="mt-3 max-w-2xl text-neutral-600">
        Eventos en vivo con ofertas en tiempo real. Iniciá sesión para participar; si ya tenés usuario Vedisa desde otro
        canal, podés usar ese mismo correo y clave.
      </p>

      {error ? (
        <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No se pudo cargar la lista. Verificá conexión o probá dentro de unos minutos.
        </p>
      ) : null}

      <ul className="mt-10 space-y-4">
        {rows.map((r) => {
          const thumb = thumbMap[r.id];

          return (
            <li key={r.id}>
              <Link
                href={`/subastas/${r.id}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:border-[#33C7E3]/60 hover:shadow-md sm:flex-row sm:items-stretch"
              >
                <div className="relative aspect-[16/10] w-full shrink-0 bg-gradient-to-br from-neutral-100 via-neutral-200 to-sky-50 sm:aspect-auto sm:w-[200px] lg:w-[240px]">
                  {thumb ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={thumb}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs font-semibold uppercase tracking-wide text-neutral-400">
                      Sin miniatura configurada para el primer lote
                    </div>
                  )}
                </div>
                <div className="flex min-h-0 flex-1 flex-col justify-between gap-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold text-neutral-900 group-hover:text-[#009ade]">{r.titulo}</h2>
                      <p className="mt-2 line-clamp-2 text-sm text-neutral-600">{r.descripcion}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#e8f4fc] px-3 py-1 text-xs font-bold text-[#1a2c4e]">
                      {estadoLabel(r.estado)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-4 text-xs text-neutral-500">
                    <p>
                      Cierre:{" "}
                      <span className="font-semibold text-neutral-800">
                        {new Date(r.ends_at).toLocaleString("es-CL")}
                      </span>
                    </p>
                    <span className="font-bold text-[#009ade] group-hover:underline">Entrar a la sala →</span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
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
